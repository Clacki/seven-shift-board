mod provider;
use crate::db::{connect, DbPath};
use chrono::{Datelike, FixedOffset, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::sync::Mutex;

pub const CACHE_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;
const RETRY_SECONDS: i64 = 60 * 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Holiday {
    pub date: String,
    pub name: String,
}

pub struct HolidayService {
    fallback_key: Option<String>,
    gate: Mutex<()>,
}
impl HolidayService {
    pub fn new(config_dir: &std::path::Path) -> Self {
        Self {
            fallback_key: provider::load_key(config_dir),
            gate: Mutex::new(()),
        }
    }
}

pub fn migrate(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS holiday_cache_years (
        year INTEGER PRIMARY KEY,
        fetched_at INTEGER,
        last_attempt_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS holiday_cache (
        year INTEGER NOT NULL REFERENCES holiday_cache_years(year),
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (year, date, name)
    );",
    )
}

fn cached(connection: &Connection, year: i32) -> rusqlite::Result<Vec<Holiday>> {
    connection
        .prepare("SELECT date,name FROM holiday_cache WHERE year=?1 ORDER BY date,name")?
        .query_map([year], |row| {
            Ok(Holiday {
                date: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect()
}

fn get_year<F>(
    connection: &mut Connection,
    year: i32,
    current_year: i32,
    now: i64,
    fetch: F,
) -> Vec<Holiday>
where
    F: FnOnce() -> Result<Vec<Holiday>, &'static str>,
{
    let fallback = cached(connection, year).unwrap_or_default();
    let metadata: Option<(Option<i64>, i64)> = connection
        .query_row(
            "SELECT fetched_at,last_attempt_at FROM holiday_cache_years WHERE year=?1",
            [year],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .unwrap_or_default();
    if let Some((fetched_at, last_attempt)) = metadata {
        if fetched_at.is_some_and(|stamp| {
            year < current_year || (0..CACHE_TTL_SECONDS).contains(&(now - stamp))
        }) || (0..RETRY_SECONDS).contains(&(now - last_attempt))
        {
            return fallback;
        }
    }
    // Persist retry suppression even if the app is restarted while the provider is unavailable.
    if connection
        .execute(
            "INSERT INTO holiday_cache_years (year,last_attempt_at) VALUES (?1,?2)
        ON CONFLICT(year) DO UPDATE SET last_attempt_at=excluded.last_attempt_at",
            params![year, now],
        )
        .is_err()
    {
        return fallback;
    }
    let Ok(holidays) = fetch() else {
        return fallback;
    };
    let store = (|| -> rusqlite::Result<()> {
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM holiday_cache WHERE year=?1", [year])?;
        for holiday in &holidays {
            transaction.execute(
                "INSERT OR IGNORE INTO holiday_cache (year,date,name) VALUES (?1,?2,?3)",
                params![year, holiday.date, holiday.name],
            )?;
        }
        transaction.execute(
            "UPDATE holiday_cache_years SET fetched_at=?2,last_attempt_at=?2 WHERE year=?1",
            params![year, now],
        )?;
        transaction.commit()
    })();
    if store.is_err() {
        return fallback;
    }
    holidays
}

#[tauri::command]
pub async fn get_holidays(app: tauri::AppHandle, year: i32) -> Vec<Holiday> {
    if !(1900..=9999).contains(&year) {
        return Vec::new();
    }
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let service = app.state::<HolidayService>();
        // Serialize fetch-and-cache to coalesce duplicate requests from mounts/month navigation.
        let Ok(_guard) = service.gate.lock() else {
            return Vec::new();
        };
        let db = app.state::<DbPath>();
        let Ok(mut connection) = connect(&db) else {
            return Vec::new();
        };
        let now = Utc::now();
        let current_year = now
            .with_timezone(&FixedOffset::east_opt(9 * 3600).unwrap())
            .year();
        let saved_key: Option<String> = connection.query_row("SELECT value FROM app_settings WHERE key='holiday_api_key'", [], |row| row.get(0)).optional().unwrap_or_default();
        get_year(&mut connection, year, current_year, now.timestamp(), || provider::fetch(year, saved_key.as_deref().or(service.fallback_key.as_deref()).ok_or("holiday key not configured")?))
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&connection).unwrap();
        connection
    }
    fn sample(year: i32) -> Vec<Holiday> {
        vec![Holiday {
            date: format!("{year}-10-03"),
            name: "개천절".into(),
        }]
    }
    #[test]
    fn successful_fetch_stores_and_reuses_cache_without_fetching() {
        let mut connection = db();
        assert_eq!(
            get_year(&mut connection, 2026, 2026, 100, || Ok(sample(2026))),
            sample(2026)
        );
        assert_eq!(cached(&connection, 2026).unwrap(), sample(2026));
        assert_eq!(
            get_year(&mut connection, 2026, 2026, 200, || panic!(
                "must use cache"
            )),
            sample(2026)
        );
    }
    #[test]
    fn expired_cache_is_refreshed_transactionally() {
        let mut connection = db();
        get_year(&mut connection, 2026, 2026, 100, || Ok(sample(2026)));
        let updated = vec![Holiday {
            date: "2026-10-05".into(),
            name: "대체공휴일".into(),
        }];
        assert_eq!(
            get_year(&mut connection, 2026, 2026, 100 + CACHE_TTL_SECONDS, || Ok(
                updated.clone()
            )),
            updated
        );
        assert_eq!(cached(&connection, 2026).unwrap(), updated);
    }
    #[test]
    fn failure_returns_stale_cache_and_does_not_destroy_it() {
        let mut connection = db();
        get_year(&mut connection, 2026, 2026, 100, || Ok(sample(2026)));
        let now = 100 + CACHE_TTL_SECONDS;
        assert_eq!(
            get_year(&mut connection, 2026, 2026, now, || Err("offline")),
            sample(2026)
        );
        assert_eq!(
            get_year(&mut connection, 2026, 2026, now + 1, || panic!(
                "retry cooldown"
            )),
            sample(2026)
        );
        assert_eq!(cached(&connection, 2026).unwrap(), sample(2026));
    }
    #[test]
    fn failure_without_cache_returns_empty_and_retries_after_cooldown() {
        let mut connection = db();
        assert!(get_year(&mut connection, 2026, 2026, 100, || Err("offline")).is_empty());
        assert!(get_year(&mut connection, 2026, 2026, 101, || panic!(
            "retry cooldown"
        ))
        .is_empty());
        assert_eq!(
            get_year(&mut connection, 2026, 2026, 100 + RETRY_SECONDS, || Ok(
                sample(2026)
            )),
            sample(2026)
        );
    }
    #[test]
    fn past_year_cache_is_reused_and_future_cache_expires() {
        let mut connection = db();
        get_year(&mut connection, 2025, 2026, 100, || Ok(sample(2025)));
        assert_eq!(
            get_year(
                &mut connection,
                2025,
                2026,
                100 + CACHE_TTL_SECONDS,
                || panic!("past cache")
            ),
            sample(2025)
        );
        get_year(&mut connection, 2027, 2026, 100, || Ok(sample(2027)));
        assert!(
            get_year(&mut connection, 2027, 2026, 100 + CACHE_TTL_SECONDS, || Ok(
                vec![]
            ))
            .is_empty()
        );
    }
    #[test]
    fn successful_empty_year_is_cached_and_years_are_isolated() {
        let mut connection = db();
        get_year(&mut connection, 2026, 2026, 100, || Ok(vec![]));
        assert!(get_year(&mut connection, 2026, 2026, 200, || panic!(
            "valid empty cache"
        ))
        .is_empty());
        assert_eq!(
            get_year(&mut connection, 2027, 2026, 200, || Ok(sample(2027))),
            sample(2027)
        );
    }
    #[test]
    fn migration_is_idempotent_and_preserves_existing_data() {
        let mut connection = db();
        connection.execute_batch("CREATE TABLE existing_data (value TEXT); INSERT INTO existing_data VALUES ('keep');").unwrap();
        get_year(&mut connection, 2026, 2026, 100, || Ok(sample(2026)));
        migrate(&connection).unwrap();
        assert_eq!(cached(&connection, 2026).unwrap(), sample(2026));
        let preserved: String = connection
            .query_row("SELECT value FROM existing_data", [], |row| row.get(0))
            .unwrap();
        assert_eq!(preserved, "keep");
    }
    #[test]
    fn failed_cache_write_rolls_back_previous_year_data() {
        let mut connection = db();
        get_year(&mut connection, 2026, 2026, 100, || Ok(sample(2026)));
        connection.execute_batch("CREATE TRIGGER block_cache BEFORE INSERT ON holiday_cache BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert_eq!(
            get_year(&mut connection, 2026, 2026, 100 + CACHE_TTL_SECONDS, || Ok(
                vec![Holiday {
                    date: "2026-10-05".into(),
                    name: "replacement".into()
                }]
            )),
            sample(2026)
        );
        assert_eq!(cached(&connection, 2026).unwrap(), sample(2026));
    }

    #[test]
    #[ignore = "uses the configured local key and official provider; run explicitly"]
    fn live_provider_round_trip() {
        let key =
            provider::load_key(std::path::Path::new(".")).expect("configure local holiday key");
        let mut connection = db();
        let holidays = get_year(&mut connection, 2026, 2026, Utc::now().timestamp(), || {
            provider::fetch(2026, &key)
        });
        assert!(
            !holidays.is_empty(),
            "live provider did not return holidays"
        );
        assert_eq!(cached(&connection, 2026).unwrap(), holidays);
        assert_eq!(
            get_year(
                &mut connection,
                2026,
                2026,
                Utc::now().timestamp(),
                || panic!("cache must avoid second request")
            ),
            holidays
        );
    }
}
