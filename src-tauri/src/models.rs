use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub color: String,
    pub id: i64,
    pub name: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeInput {
    pub color: String,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftTemplate {
    pub id: i64,
    pub name: String,
    pub employee_id: i64,
    pub employee_name: String,
    pub days_of_week: Vec<u32>,
    pub start_time: String,
    pub end_time: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftTemplateInput {
    pub name: String,
    pub employee_id: i64,
    pub days_of_week: Vec<u32>,
    pub start_time: String,
    pub end_time: String,
    pub active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub id: i64,
    pub template_id: Option<i64>,
    pub employee_id: i64,
    pub employee_name: String,
    pub work_date: String,
    pub start_time: String,
    pub end_time: String,
    pub shift_type: String,
    pub memo: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftInput {
    pub template_id: Option<i64>,
    pub employee_id: i64,
    pub work_date: String,
    pub start_time: String,
    pub end_time: String,
    pub shift_type: String,
    pub memo: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleItem {
    pub shift_id: Option<i64>,
    pub template_id: Option<i64>,
    pub template_name: String,
    pub employee_id: i64,
    pub employee_name: String,
    pub work_date: String,
    pub start_time: String,
    pub end_time: String,
    pub shift_type: String,
    pub memo: String,
    pub duration_minutes: i64,
}
