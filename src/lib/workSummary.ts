import type { Employee, ScheduleItem } from "../types";
export type EmployeeMonthlySummary = {
  employee: Employee;
  shiftCount: number;
  totalMinutes: number;
  shifts: ScheduleItem[];
};

/** Aggregate resolved schedule rows; workDate (the start date) owns overnight hours. */
export function getEmployeeMonthlySummaries(
  month: string,
  items: ScheduleItem[],
  employees: Employee[]
): EmployeeMonthlySummary[] {
  const grouped = new Map<number, ScheduleItem[]>();
  for (const item of items) {
    if (!item.workDate.startsWith(month + "-")) continue;
    const shifts = grouped.get(item.employeeId) ?? [];
    shifts.push(item);
    grouped.set(item.employeeId, shifts);
  }
  return employees
    .filter((employee) => employee.active || grouped.has(employee.id))
    .map((employee) => {
      const shifts = (grouped.get(employee.id) ?? []).sort(
        (a, b) =>
          a.workDate.localeCompare(b.workDate) ||
          a.startTime.localeCompare(b.startTime) ||
          (a.shiftId ?? 0) - (b.shiftId ?? 0)
      );
      return {
        employee,
        shifts,
        shiftCount: shifts.length,
        totalMinutes: shifts.reduce(
          (total, shift) => total + shift.durationMinutes,
          0
        ),
      };
    });
}

/** Display integer minutes without decimal-hour rounding loss. */
export function formatWorkMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? hours + "시간 " + remainder + "분" : hours + "시간";
}

export function formatSettlementForClipboard(summary: EmployeeMonthlySummary): string {
  const lines = summary.shifts.flatMap((shift) => {
    const date = shift.workDate.slice(5).split("-").map(Number).join("/");
    const name = shift.templateName || "추가 근무";
    const row = `${date} ${name} ${shift.startTime}-${shift.endTime} ${formatWorkMinutes(shift.durationMinutes)}`;
    return [row];
  });
  return [...lines, "", `총 근무 ${formatWorkMinutes(summary.totalMinutes)}`].join("\n");
}
