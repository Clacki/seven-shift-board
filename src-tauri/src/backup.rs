use crate::db::DbPath;
use rusqlite::{backup::Backup, Connection, OpenFlags};
use std::{path::Path, time::Duration};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// Snapshot the entire database, including committed WAL pages. Never open the source for writing.
fn export_to_path(source_path: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err("이미 존재하는 파일입니다. 원본과 기존 백업을 보호하기 위해 다른 파일명을 선택해주세요.".into());
    }
    let source = Connection::open_with_flags(source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    source
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    let parent = destination
        .parent()
        .ok_or("백업 저장 경로가 올바르지 않습니다.")?;
    // Stage on the same volume, then publish only a complete, verified SQLite file.
    let staged = tempfile::Builder::new()
        .prefix(".seven-backup-")
        .suffix(".db")
        .tempfile_in(parent)
        .map_err(|error| error.to_string())?
        .into_temp_path();
    {
        let mut target = Connection::open(&staged).map_err(|error| error.to_string())?;
        {
            let backup = Backup::new(&source, &mut target).map_err(|error| error.to_string())?;
            backup
                .run_to_completion(128, Duration::from_millis(10), None)
                .map_err(|error| error.to_string())?;
        }
        // The exported artifact must be usable without WAL/SHM sidecar files.
        target
            .pragma_update(None, "journal_mode", "DELETE")
            .map_err(|error| error.to_string())?;
        let integrity: String = target
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if integrity != "ok" {
            return Err("백업 파일 무결성 확인에 실패했습니다.".into());
        }
        target.close().map_err(|(_, error)| error.to_string())?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .open(&staged)
        .and_then(|file| file.sync_all())
        .map_err(|error| error.to_string())?;
    // Also refuses an existing destination if it appeared while the backup was running.
    staged
        .persist_noclobber(destination)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_database_backup(
    app: tauri::AppHandle,
    db: State<'_, DbPath>,
) -> Result<Option<String>, String> {
    let source = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let filename = format!(
            "seven-work-manager-backup-{}.db",
            chrono::Local::now().format("%Y-%m-%d-%H%M%S")
        );
        let Some(selected) = app
            .dialog()
            .file()
            .set_title("백업 파일 내보내기")
            .set_file_name(&filename)
            .add_filter("SQLite 데이터베이스", &["db"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let destination = selected.into_path().map_err(|error| error.to_string())?;
        export_to_path(&source, &destination)?;
        Ok(Some(destination.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::types::Value;

    fn snapshot(connection: &Connection) -> Vec<(String, Vec<Vec<Value>>)> {
        let schema = connection
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let mut result = Vec::new();
        for name in std::iter::once("sqlite_master".to_string()).chain(schema) {
            let sql = format!(
                "SELECT * FROM \"{}\" ORDER BY rowid",
                name.replace('"', "\"\"")
            );
            let mut statement = connection.prepare(&sql).unwrap();
            let count = statement.column_count();
            let rows = statement
                .query_map([], |row| {
                    (0..count)
                        .map(|index| row.get(index))
                        .collect::<Result<Vec<Value>, _>>()
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            result.push((name, rows));
        }
        result
    }

    #[test]
    fn complete_backup_preserves_source_and_committed_wal_data() {
        for journal in ["DELETE", "WAL"] {
            let directory = tempfile::tempdir().unwrap();
            let source_path = directory.path().join("source.db");
            let db = crate::db::initialize(source_path.clone()).unwrap();
            let source = crate::db::connect(&db).unwrap();
            source.pragma_update(None, "journal_mode", journal).unwrap();
            source.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
            source.execute_batch("UPDATE employees SET color='#123456' WHERE id=1;
                UPDATE shift_templates SET start_time='09:00' WHERE id=1;
                INSERT INTO shifts(template_id,employee_id,work_date,start_time,end_time,shift_type,memo) VALUES
                  (1,1,'2026-09-01','09:00','16:00','regular','edited'),
                  (2,2,'2026-09-02','22:00','08:00','substitute','replacement'),
                  (NULL,1,'2026-09-03','08:00','09:00','regular','additional');
                INSERT INTO app_settings(key,value) VALUES ('my_employee_id','1'),('other_setting','preserved');
                INSERT INTO holiday_cache_years(year,fetched_at,last_attempt_at) VALUES (2026,1,1);
                INSERT INTO holiday_cache(year,date,name) VALUES (2026,'2026-09-01','holiday');
                CREATE TABLE future_data(id INTEGER PRIMARY KEY, payload BLOB);
                INSERT INTO future_data VALUES (1,X'001122');").unwrap();
            let before = snapshot(&source);
            let bytes_before = std::fs::read(&source_path).unwrap();
            let wal_path = directory.path().join("source.db-wal");
            let wal_before = (journal == "WAL").then(|| std::fs::read(&wal_path).unwrap());
            let destination = directory.path().join("backup.db");
            export_to_path(&source_path, &destination).unwrap();
            assert!(destination.is_file());
            let backup =
                Connection::open_with_flags(&destination, OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .unwrap();
            assert_eq!(snapshot(&backup), before);
            assert_eq!(snapshot(&source), before);
            assert_eq!(std::fs::read(&source_path).unwrap(), bytes_before);
            if let Some(wal) = wal_before {
                assert_eq!(std::fs::read(wal_path).unwrap(), wal);
            }
            assert!(!directory.path().join("backup.db-wal").exists());
            assert_eq!(
                backup
                    .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                    .unwrap(),
                "ok"
            );
        }
    }

    #[test]
    fn refuses_source_and_existing_files_and_does_not_create_missing_source() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.db");
        let connection = Connection::open(&source).unwrap();
        connection
            .execute_batch("CREATE TABLE example(id INTEGER); INSERT INTO example VALUES (7);")
            .unwrap();
        let before = std::fs::read(&source).unwrap();
        assert!(export_to_path(&source, &source).is_err());
        assert_eq!(std::fs::read(&source).unwrap(), before);
        let existing = directory.path().join("existing.db");
        std::fs::write(&existing, b"existing backup").unwrap();
        assert!(export_to_path(&source, &existing).is_err());
        assert_eq!(std::fs::read(&existing).unwrap(), b"existing backup");
        let missing = directory.path().join("missing.db");
        let output = directory.path().join("output.db");
        assert!(export_to_path(&missing, &output).is_err());
        assert!(!missing.exists());
        assert!(!output.exists());
        assert!(
            export_to_path(&source, &directory.path().join("missing-folder/output.db")).is_err()
        );
        assert_eq!(std::fs::read(&source).unwrap(), before);
    }
}
