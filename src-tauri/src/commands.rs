use crate::{
    db::{connect, DbPath},
    models::*,
};
use chrono::{Datelike, Duration, NaiveDate, NaiveTime, Timelike};
use rusqlite::{params, OptionalExtension, Row};
use std::collections::HashSet;
use tauri::State;

fn validate_color(color: &str) -> Result<(), String> {
    if color.len() == 7
        && color.starts_with('#')
        && color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
        Ok(())
    } else {
        Err("색상은 #RRGGBB 형식이어야 합니다.".into())
    }
}

fn clean_name(value: String) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err("이름을 입력해주세요.".into())
    } else {
        Ok(value)
    }
}

fn time_minutes(value: &str) -> Result<i64, String> {
    if value == "24:00" {
        return Ok(24 * 60);
    }
    NaiveTime::parse_from_str(value, "%H:%M")
        .map(|time| i64::from(time.num_seconds_from_midnight() / 60))
        .map_err(|_| format!("시간 형식이 올바르지 않습니다: {value}"))
}

fn validate_time(value: &str) -> Result<(), String> {
    time_minutes(value).map(|_| ())
}

fn encode_days(days: &[u32]) -> Result<String, String> {
    if days.is_empty() || days.iter().any(|day| *day > 6) {
        return Err("요일을 하나 이상 선택해주세요.".into());
    }
    let mut values = days.to_vec();
    values.sort_unstable();
    values.dedup();
    Ok(values
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(","))
}

fn decode_days(value: String) -> Vec<u32> {
    value
        .split(',')
        .filter_map(|day| day.parse().ok())
        .collect()
}

fn map_template(row: &Row<'_>) -> rusqlite::Result<ShiftTemplate> {
    Ok(ShiftTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        employee_id: row.get(2)?,
        employee_name: row.get(3)?,
        days_of_week: decode_days(row.get(4)?),
        start_time: row.get(5)?,
        end_time: row.get(6)?,
        active: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_shift(row: &Row<'_>) -> rusqlite::Result<Shift> {
    Ok(Shift {
        id: row.get(0)?,
        template_id: row.get(1)?,
        employee_id: row.get(2)?,
        employee_name: row.get(3)?,
        work_date: row.get(4)?,
        start_time: row.get(5)?,
        end_time: row.get(6)?,
        shift_type: row.get(7)?,
        memo: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn db_error(error: rusqlite::Error) -> String {
    let message = error.to_string();
    if message.contains("UNIQUE constraint failed: employees.name") {
        "같은 이름의 직원이 이미 있습니다.".into()
    } else {
        message
    }
}

#[tauri::command]
pub fn list_employees(db: State<DbPath>) -> Result<Vec<Employee>, String> {
    let connection = connect(&db)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, active, created_at, color FROM employees ORDER BY active DESC, name",
        )
        .map_err(db_error)?;
    let employees = statement
        .query_map([], |row| {
            Ok(Employee {
                id: row.get(0)?,
                name: row.get(1)?,
                active: row.get(2)?,
                created_at: row.get(3)?,
                color: row.get(4)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    Ok(employees)
}

#[tauri::command]
pub fn create_employee(db: State<DbPath>, input: EmployeeInput) -> Result<Employee, String> {
    validate_color(&input.color)?;
    let name = clean_name(input.name)?;
    let connection = connect(&db)?;
    connection
        .execute(
            "INSERT INTO employees (name, active, color) VALUES (?1, ?2, ?3)",
            params![name, input.active, input.color],
        )
        .map_err(db_error)?;
    let id = connection.last_insert_rowid();
    connection
        .query_row(
            "SELECT id, name, active, created_at, color FROM employees WHERE id = ?1",
            [id],
            |row| {
                Ok(Employee {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    active: row.get(2)?,
                    created_at: row.get(3)?,
                    color: row.get(4)?,
                })
            },
        )
        .map_err(db_error)
}

#[tauri::command]
pub fn update_employee(db: State<DbPath>, id: i64, input: EmployeeInput) -> Result<(), String> {
    validate_color(&input.color)?;
    let name = clean_name(input.name)?;
    let connection = connect(&db)?;
    let changed = connection
        .execute(
            "UPDATE employees SET name = ?1, active = ?2, color = ?4 WHERE id = ?3",
            params![name, input.active, id, input.color],
        )
        .map_err(db_error)?;
    if changed == 0 {
        Err("직원을 찾을 수 없습니다.".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn list_shift_templates(db: State<DbPath>) -> Result<Vec<ShiftTemplate>, String> {
    let connection = connect(&db)?;
    let mut statement = connection.prepare("SELECT t.id, t.name, t.employee_id, e.name, t.days_of_week, t.start_time, t.end_time, t.active, t.created_at, t.updated_at FROM shift_templates t JOIN employees e ON e.id = t.employee_id ORDER BY t.active DESC, t.id").map_err(db_error)?;
    let templates = statement
        .query_map([], map_template)
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    Ok(templates)
}

fn validate_template(input: ShiftTemplateInput) -> Result<(String, String), String> {
    if input.start_time == "24:00" {
        return Err("시작 시간은 00:00부터 23:59까지 입력해주세요.".into());
    }
    validate_time(&input.start_time)?;
    validate_time(&input.end_time)?;
    Ok((clean_name(input.name)?, encode_days(&input.days_of_week)?))
}

#[tauri::command]
pub fn create_shift_template(db: State<DbPath>, input: ShiftTemplateInput) -> Result<(), String> {
    let (name, days) = validate_template(ShiftTemplateInput {
        name: input.name.clone(),
        employee_id: input.employee_id,
        days_of_week: input.days_of_week.clone(),
        start_time: input.start_time.clone(),
        end_time: input.end_time.clone(),
        active: input.active,
    })?;
    let connection = connect(&db)?;
    connection.execute("INSERT INTO shift_templates (name, employee_id, days_of_week, start_time, end_time, active) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![name, input.employee_id, days, input.start_time, input.end_time, input.active]).map_err(db_error)?;
    Ok(())
}

#[tauri::command]
pub fn update_shift_template(
    db: State<DbPath>,
    id: i64,
    input: ShiftTemplateInput,
) -> Result<(), String> {
    let (name, days) = validate_template(ShiftTemplateInput {
        name: input.name.clone(),
        employee_id: input.employee_id,
        days_of_week: input.days_of_week.clone(),
        start_time: input.start_time.clone(),
        end_time: input.end_time.clone(),
        active: input.active,
    })?;
    let mut connection = connect(&db)?;
    let previous: ShiftTemplate = connection.query_row("SELECT t.id, t.name, t.employee_id, e.name, t.days_of_week, t.start_time, t.end_time, t.active, t.created_at, t.updated_at FROM shift_templates t JOIN employees e ON e.id=t.employee_id WHERE t.id=?1", [id], map_template).map_err(|error| match error { rusqlite::Error::QueryReturnedNoRows => "기본 근무를 찾을 수 없습니다.".into(), other => db_error(other) })?;
    let transaction = connection.transaction().map_err(db_error)?;
    let changed = transaction.execute("UPDATE shift_templates SET name=?1, employee_id=?2, days_of_week=?3, start_time=?4, end_time=?5, active=?6, updated_at=CURRENT_TIMESTAMP WHERE id=?7", params![name, input.employee_id, days, input.start_time, input.end_time, input.active, id]).map_err(db_error)?;
    if changed == 0 {
        Err("기본 근무를 찾을 수 없습니다.".into())
    } else {
        // Only templates that were originally touching and share at least one weekday form a chain.
        // Saved `shifts` are deliberately never updated: they are user-owned actual records.
        let delta = time_minutes(&input.end_time)? - time_minutes(&previous.end_time)?;
        if delta != 0 {
            cascade_template_times(&transaction, &previous, delta)?;
        }
        transaction.commit().map_err(db_error)?;
        Ok(())
    }
}

#[tauri::command]
pub fn list_shifts(db: State<DbPath>, month: String) -> Result<Vec<Shift>, String> {
    parse_month(&month)?;
    let connection = connect(&db)?;
    let pattern = format!("{month}-%");
    let mut statement = connection.prepare("SELECT s.id, s.template_id, s.employee_id, e.name, s.work_date, s.start_time, s.end_time, s.shift_type, s.memo, s.created_at, s.updated_at FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.work_date LIKE ?1 ORDER BY s.work_date, s.start_time").map_err(db_error)?;
    let shifts = statement
        .query_map([pattern], map_shift)
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    Ok(shifts)
}

fn validate_shift(input: &ShiftInput) -> Result<(), String> {
    NaiveDate::parse_from_str(&input.work_date, "%Y-%m-%d")
        .map_err(|_| "근무 날짜가 올바르지 않습니다.".to_string())?;
    if input.start_time == "24:00" {
        return Err("시작 시간은 00:00부터 23:59까지 입력해주세요.".into());
    }
    validate_time(&input.start_time)?;
    validate_time(&input.end_time)?;
    if !matches!(input.shift_type.as_str(), "regular" | "substitute") {
        return Err("근무 구분이 올바르지 않습니다.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn save_shift(db: State<DbPath>, input: ShiftInput, id: Option<i64>) -> Result<i64, String> {
    validate_shift(&input)?;
    let connection = connect(&db)?;
    if let Some(id) = id {
        let changed = connection.execute("UPDATE shifts SET employee_id=?1, work_date=?2, start_time=?3, end_time=?4, shift_type=?5, memo=?6, updated_at=CURRENT_TIMESTAMP WHERE id=?7 AND template_id IS ?8", params![input.employee_id, input.work_date, input.start_time, input.end_time, input.shift_type, input.memo.trim(), id, input.template_id]).map_err(db_error)?;
        return if changed == 0 {
            Err("근무 기록을 찾을 수 없습니다.".into())
        } else {
            Ok(id)
        };
    }
    connection.execute(
        "INSERT INTO shifts (template_id, employee_id, work_date, start_time, end_time, shift_type, memo) VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(template_id, work_date) DO UPDATE SET employee_id=excluded.employee_id, start_time=excluded.start_time, end_time=excluded.end_time, shift_type=excluded.shift_type, memo=excluded.memo, updated_at=CURRENT_TIMESTAMP",
        params![input.template_id, input.employee_id, input.work_date, input.start_time, input.end_time, input.shift_type, input.memo.trim()],
    ).map_err(db_error)?;
    if input.template_id.is_some() {
        connection
            .query_row(
                "SELECT id FROM shifts WHERE template_id=?1 AND work_date=?2",
                params![input.template_id, input.work_date],
                |row| row.get(0),
            )
            .map_err(db_error)
    } else {
        Ok(connection.last_insert_rowid())
    }
}

#[tauri::command]
pub fn delete_shift(db: State<DbPath>, id: i64) -> Result<(), String> {
    let connection = connect(&db)?;
    connection
        .execute("DELETE FROM shifts WHERE id=?1", [id])
        .map_err(db_error)?;
    Ok(())
}

fn parse_month(month: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| "월 형식은 YYYY-MM이어야 합니다.".into())
}

pub fn duration_minutes(start: &str, end: &str) -> Result<i64, String> {
    let start = time_minutes(start).map_err(|_| "시작 시간이 올바르지 않습니다.".to_string())?;
    let end = time_minutes(end).map_err(|_| "종료 시간이 올바르지 않습니다.".to_string())?;
    let mut minutes = end - start;
    if end <= start {
        minutes += 24 * 60;
    }
    Ok(minutes)
}

fn format_shift_time(minutes: i64, end_time: bool) -> String {
    let normalized = minutes.rem_euclid(24 * 60);
    if end_time && normalized == 0 && minutes > 0 {
        "24:00".into()
    } else {
        format!("{:02}:{:02}", normalized / 60, normalized % 60)
    }
}

fn cascade_template_times(
    transaction: &rusqlite::Transaction<'_>,
    previous: &ShiftTemplate,
    delta: i64,
) -> Result<(), String> {
    let mut statement = transaction.prepare("SELECT t.id, t.name, t.employee_id, e.name, t.days_of_week, t.start_time, t.end_time, t.active, t.created_at, t.updated_at FROM shift_templates t JOIN employees e ON e.id=t.employee_id").map_err(db_error)?;
    let templates: Vec<ShiftTemplate> = statement.query_map([], map_template).map_err(db_error)?.collect::<Result<_, _>>().map_err(db_error)?;
    drop(statement);
    let mut pending = vec![previous.clone()];
    let mut moved = HashSet::new();
    while let Some(current) = pending.pop() {
        for candidate in templates.iter().filter(|candidate| {
            candidate.id != previous.id
                && !moved.contains(&candidate.id)
                && candidate.start_time == current.end_time
                && candidate.days_of_week.iter().any(|day| current.days_of_week.contains(day))
        }) {
            let start = format_shift_time(time_minutes(&candidate.start_time)? + delta, false);
            let end = format_shift_time(time_minutes(&candidate.end_time)? + delta, true);
            transaction.execute("UPDATE shift_templates SET start_time=?1, end_time=?2, updated_at=CURRENT_TIMESTAMP WHERE id=?3", params![start, end, candidate.id]).map_err(db_error)?;
            moved.insert(candidate.id);
            // Continue matching from the original timeline, not shifted values.
            pending.push(candidate.clone());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_holiday_api_key(db: State<DbPath>) -> Result<Option<String>, String> {
    let connection = connect(&db)?;
    connection.query_row("SELECT value FROM app_settings WHERE key='holiday_api_key'", [], |row| row.get(0)).optional().map_err(db_error)
}

#[tauri::command]
pub fn set_holiday_api_key(db: State<DbPath>, key: String) -> Result<(), String> {
    let connection = connect(&db)?;
    let key = key.trim();
    if key.is_empty() {
        connection.execute("DELETE FROM app_settings WHERE key='holiday_api_key'", []).map_err(db_error)?;
    } else {
        connection.execute("INSERT INTO app_settings (key,value,updated_at) VALUES ('holiday_api_key',?1,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", [key]).map_err(db_error)?;
        connection.execute("DELETE FROM holiday_cache_years WHERE fetched_at IS NULL", []).map_err(db_error)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_month_schedule(db: State<DbPath>, month: String) -> Result<Vec<ScheduleItem>, String> {
    let first = parse_month(&month)?;
    let next = if first.month() == 12 {
        NaiveDate::from_ymd_opt(first.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first.year(), first.month() + 1, 1)
    }
    .ok_or("날짜 범위를 계산할 수 없습니다.")?;
    let connection = connect(&db)?;
    let mut statement = connection.prepare("SELECT t.id,t.name,t.employee_id,e.name,t.days_of_week,t.start_time,t.end_time,t.active,t.created_at,t.updated_at FROM shift_templates t JOIN employees e ON e.id=t.employee_id WHERE t.active=1 ORDER BY t.start_time,t.id").map_err(db_error)?;
    let templates: Vec<ShiftTemplate> = statement
        .query_map([], map_template)
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    let mut items = Vec::new();
    let mut included_shift_ids = HashSet::new();
    let mut date = first;
    while date < next {
        let weekday = date.weekday().num_days_from_sunday();
        for template in templates
            .iter()
            .filter(|template| template.days_of_week.contains(&weekday))
        {
            let saved: Option<Shift> = connection.query_row("SELECT s.id,s.template_id,s.employee_id,e.name,s.work_date,s.start_time,s.end_time,s.shift_type,s.memo,s.created_at,s.updated_at FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.template_id=?1 AND s.work_date=?2", params![template.id, date.to_string()], map_shift).optional().map_err(db_error)?;
            if let Some(shift) = saved {
                included_shift_ids.insert(shift.id);
                items.push(ScheduleItem {
                    shift_id: Some(shift.id),
                    template_id: shift.template_id,
                    template_name: template.name.clone(),
                    employee_id: shift.employee_id,
                    employee_name: shift.employee_name,
                    work_date: shift.work_date,
                    start_time: shift.start_time.clone(),
                    end_time: shift.end_time.clone(),
                    shift_type: shift.shift_type,
                    memo: shift.memo,
                    duration_minutes: duration_minutes(&shift.start_time, &shift.end_time)?,
                });
            } else {
                items.push(ScheduleItem {
                    shift_id: None,
                    template_id: Some(template.id),
                    template_name: template.name.clone(),
                    employee_id: template.employee_id,
                    employee_name: template.employee_name.clone(),
                    work_date: date.to_string(),
                    start_time: template.start_time.clone(),
                    end_time: template.end_time.clone(),
                    shift_type: "regular".into(),
                    memo: String::new(),
                    duration_minutes: duration_minutes(&template.start_time, &template.end_time)?,
                });
            }
        }
        date += Duration::days(1);
    }
    let mut saved_statement = connection.prepare("SELECT s.id,s.template_id,s.employee_id,e.name,s.work_date,s.start_time,s.end_time,s.shift_type,s.memo,s.created_at,s.updated_at,COALESCE(t.name, '추가 근무') FROM shifts s JOIN employees e ON e.id=s.employee_id LEFT JOIN shift_templates t ON t.id=s.template_id WHERE s.work_date>=?1 AND s.work_date<?2 ORDER BY s.work_date,s.start_time").map_err(db_error)?;
    let saved_rows = saved_statement
        .query_map(params![first.to_string(), next.to_string()], |row| {
            Ok((map_shift(row)?, row.get::<_, String>(11)?))
        })
        .map_err(db_error)?;
    for saved in saved_rows {
        let (shift, template_name) = saved.map_err(db_error)?;
        if included_shift_ids.contains(&shift.id) {
            continue;
        }
        items.push(ScheduleItem {
            shift_id: Some(shift.id),
            template_id: shift.template_id,
            template_name,
            employee_id: shift.employee_id,
            employee_name: shift.employee_name,
            work_date: shift.work_date,
            start_time: shift.start_time.clone(),
            end_time: shift.end_time.clone(),
            shift_type: shift.shift_type,
            memo: shift.memo,
            duration_minutes: duration_minutes(&shift.start_time, &shift.end_time)?,
        });
    }
    items.sort_by(|a, b| (&a.work_date, &a.start_time).cmp(&(&b.work_date, &b.start_time)));
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::duration_minutes;
    #[test]
    fn calculates_day_shift() {
        assert_eq!(duration_minutes("08:00", "15:00").unwrap(), 420);
    }
    #[test]
    fn calculates_overnight_shift() {
        assert_eq!(duration_minutes("22:00", "08:00").unwrap(), 600);
    }
    #[test]
    fn treats_end_of_day_as_nine_hours() {
        assert_eq!(duration_minutes("15:00", "24:00").unwrap(), 540);
    }
}
