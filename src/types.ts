export type Employee = {
  id: number;
  name: string;
  color: string;
  active: boolean;
  createdAt: string;
};
export type EmployeeInput = Pick<Employee, "name" | "active" | "color">;
export type ShiftTemplate = {
  id: number;
  name: string;
  employeeId: number;
  employeeName: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ShiftTemplateInput = Pick<
  ShiftTemplate,
  "name" | "employeeId" | "daysOfWeek" | "startTime" | "endTime" | "active"
>;
export type ShiftInput = {
  templateId: number | null;
  employeeId: number;
  workDate: string;
  startTime: string;
  endTime: string;
  shiftType: "regular" | "substitute";
  memo: string;
};
export type ScheduleItem = ShiftInput & {
  shiftId: number | null;
  templateName: string;
  employeeName: string;
  durationMinutes: number;
};
