use rusqlite::{params, Connection};
use std::{fs, path::PathBuf};

pub const LEGACY_EMPLOYEE_COLORS: [&str; 6] = [
    "#6485B5", "#6B9475", "#BD9062", "#9580B6", "#B77F98", "#639B9B",
];

#[derive(Clone)]
pub struct DbPath(pub PathBuf);

pub fn connect(path: &DbPath) -> Result<Connection, String> {
    let connection = Connection::open(&path.0).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

pub fn initialize(path: PathBuf) -> Result<DbPath, String> {
    fs::create_dir_all(path.parent().ok_or("DB 경로가 올바르지 않습니다.")?)
        .map_err(|error| error.to_string())?;
    let db_path = DbPath(path);
    let mut connection = connect(&db_path)?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) > 0),
                active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS shift_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL CHECK(length(trim(name)) > 0),
                employee_id INTEGER NOT NULL REFERENCES employees(id),
                days_of_week TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS shifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER REFERENCES shift_templates(id) ON DELETE SET NULL,
                employee_id INTEGER NOT NULL REFERENCES employees(id),
                work_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                shift_type TEXT NOT NULL CHECK(shift_type IN ('regular', 'substitute')),
                memo TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(template_id, work_date)
            );
            CREATE INDEX IF NOT EXISTS idx_shifts_work_date ON shifts(work_date);
            CREATE INDEX IF NOT EXISTS idx_templates_employee ON shift_templates(employee_id);
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|error| error.to_string())?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    crate::holidays::migrate(&transaction).map_err(|error| error.to_string())?;
    let has_color: bool = transaction
        .prepare("PRAGMA table_info(employees)")
        .map_err(|error| error.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?
        .iter()
        .any(|name| name == "color");
    if !has_color {
        transaction
            .execute_batch(
                "ALTER TABLE employees ADD COLUMN color TEXT NOT NULL DEFAULT '#6485B5';",
            )
            .map_err(|error| error.to_string())?;
        let ids = transaction
            .prepare("SELECT id FROM employees ORDER BY id")
            .map_err(|error| error.to_string())?
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        for (index, id) in ids.iter().enumerate() {
            transaction
                .execute(
                    "UPDATE employees SET color=?1 WHERE id=?2",
                    params![
                        LEGACY_EMPLOYEE_COLORS[index % LEGACY_EMPLOYEE_COLORS.len()],
                        id
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    // Shared with the frontend presets. Existing rows remain untouched by INSERT OR IGNORE.
    #[derive(serde::Deserialize)]
    struct Preset {
        color: String,
    }
    let palette: Vec<Preset> =
        serde_json::from_str(include_str!("../../src/lib/employeePalette.json"))
            .map_err(|error| error.to_string())?;
    let employees = ["사장님", "지원", "선빈", "형철", "광욱", "은지"];
    for (index, name) in employees.iter().enumerate() {
        transaction
            .execute(
                "INSERT OR IGNORE INTO employees (name, color) VALUES (?1, ?2)",
                params![name, palette[index % palette.len()].color],
            )
            .map_err(|error| error.to_string())?;
    }
    let template_count: i64 = transaction
        .query_row("SELECT COUNT(*) FROM shift_templates", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if template_count == 0 {
        let templates = [
            ("평일 오전", "사장님", "1,2,3,4,5", "08:00", "15:00"),
            ("평일 오후", "지원", "1,2,3,4,5", "15:00", "22:00"),
            ("야간 A", "선빈", "1,2", "22:00", "08:00"),
            ("야간 B", "형철", "3,4,5,6,0", "22:00", "08:00"),
            ("주말 오전", "광욱", "6,0", "08:00", "15:00"),
            ("주말 오후 A", "은지", "6,0", "14:00", "21:00"),
            ("주말 오후 B (토)", "선빈", "6", "15:00", "24:00"),
            ("주말 오후 B (일)", "선빈", "0", "15:00", "22:00"),
        ];
        for (name, employee_name, days, start, end) in templates {
            transaction.execute(
                "INSERT INTO shift_templates (name, employee_id, days_of_week, start_time, end_time)
                 SELECT ?1, id, ?3, ?4, ?5 FROM employees WHERE name = ?2",
                params![name, employee_name, days, start, end],
            ).map_err(|error| error.to_string())?;
        }
    } else {
        // Upgrade only the untouched legacy seed. User-created or edited templates do not match.
        let changed = transaction
            .execute(
                "UPDATE shift_templates SET name='주말 오후 B (토)', days_of_week='6', end_time='24:00', updated_at=CURRENT_TIMESTAMP WHERE name='주말 오후 B' AND days_of_week='6,0' AND start_time='15:00' AND end_time='22:00'",
                [],
            )
            .map_err(|error| error.to_string())?;
        if changed > 0 {
            transaction
                .execute(
                    "INSERT INTO shift_templates (name, employee_id, days_of_week, start_time, end_time)
                     SELECT '주말 오후 B (일)', employee_id, '0', '15:00', '22:00'
                     FROM shift_templates WHERE name='주말 오후 B (토)'
                     AND NOT EXISTS (SELECT 1 FROM shift_templates WHERE name='주말 오후 B (일)')",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(db_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_existing_employees_without_losing_data_or_colors() {
        let path =
            std::env::temp_dir().join(format!("seven-colors-migration-{}.db", std::process::id()));
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch("CREATE TABLE employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO employees (id,name,active) VALUES (100,'Existing employee',0);").unwrap();
        drop(connection);
        let db = initialize(path.clone()).unwrap();
        let connection = connect(&db).unwrap();
        let value: (String, bool, String) = connection
            .query_row(
                "SELECT name,active,color FROM employees WHERE id=100",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            value,
            (
                "Existing employee".into(),
                false,
                LEGACY_EMPLOYEE_COLORS[0].into()
            )
        );
        connection
            .execute("UPDATE employees SET color='#123456' WHERE id=100", [])
            .unwrap();
        drop(connection);
        initialize(path.clone()).unwrap();
        let connection = connect(&db).unwrap();
        let color: String = connection
            .query_row("SELECT color FROM employees WHERE id=100", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(color, "#123456");
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn seed_is_idempotent() {
        let path =
            std::env::temp_dir().join(format!("seven-work-manager-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        initialize(path.clone()).unwrap();
        let db = initialize(path.clone()).unwrap();
        let connection = connect(&db).unwrap();
        let employees: i64 = connection
            .query_row("SELECT COUNT(*) FROM employees", [], |row| row.get(0))
            .unwrap();
        let templates: i64 = connection
            .query_row("SELECT COUNT(*) FROM shift_templates", [], |row| row.get(0))
            .unwrap();
        assert_eq!((employees, templates), (6, 8));
        let colors: Vec<String> = connection
            .prepare("SELECT color FROM employees ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        let palette: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/employeePalette.json")).unwrap();
        for (index, color) in colors.iter().enumerate() {
            assert_eq!(color, palette[index]["color"].as_str().unwrap());
        }
        connection
            .execute(
                "UPDATE employees SET color='#6485B5' WHERE name='사장님'",
                [],
            )
            .unwrap();
        drop(connection);
        initialize(path.clone()).unwrap();
        let connection = connect(&db).unwrap();
        let preserved: String = connection
            .query_row(
                "SELECT color FROM employees WHERE name='사장님'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(preserved, "#6485B5");
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }
}
