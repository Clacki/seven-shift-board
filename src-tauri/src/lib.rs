mod commands;
mod backup;
mod db;
mod holidays;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("seven-work-manager.db");
            let db = db::initialize(path).map_err(std::io::Error::other)?;
            app.manage(db);
            app.manage(holidays::HolidayService::new(&app.path().app_config_dir()?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_employees,
            commands::create_employee,
            commands::update_employee,
            commands::list_shift_templates,
            commands::create_shift_template,
            commands::update_shift_template,
            commands::list_shifts,
            commands::save_shift,
            commands::delete_shift,
            commands::reset_data,
            commands::get_month_schedule,
            commands::get_holiday_api_key,
            commands::set_holiday_api_key,
            commands::get_my_employee_id,
            commands::set_my_employee_id,
            backup::export_database_backup,
            backup::restore_database_backup,
            holidays::get_holidays,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
