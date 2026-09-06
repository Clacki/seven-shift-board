import { invoke } from "@tauri-apps/api/core";
import type {
  Employee,
  EmployeeInput,
  ScheduleItem,
  ShiftInput,
  ShiftTemplate,
  ShiftTemplateInput,
} from "../types";

export const api = {
  listEmployees: () => invoke<Employee[]>("list_employees"),
  createEmployee: (input: EmployeeInput) =>
    invoke<Employee>("create_employee", { input }),
  updateEmployee: (id: number, input: EmployeeInput) =>
    invoke<void>("update_employee", { id, input }),
  listTemplates: () => invoke<ShiftTemplate[]>("list_shift_templates"),
  createTemplate: (input: ShiftTemplateInput) =>
    invoke<void>("create_shift_template", { input }),
  updateTemplate: (id: number, input: ShiftTemplateInput) =>
    invoke<void>("update_shift_template", { id, input }),
  getMonthSchedule: (month: string) =>
    invoke<ScheduleItem[]>("get_month_schedule", { month }),
  saveShift: (input: ShiftInput, id: number | null = null) =>
    invoke<number>("save_shift", { input, id }),
  deleteShift: (id: number) => invoke<void>("delete_shift", { id }),
  getHolidayApiKey: () => invoke<string | null>("get_holiday_api_key"),
  setHolidayApiKey: (key: string) =>
    invoke<void>("set_holiday_api_key", { key }),
};
