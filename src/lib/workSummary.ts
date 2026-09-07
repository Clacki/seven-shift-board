import type { Employee, ScheduleItem, ShiftTemplate } from "../types";
import { classifyWork, type WorkSegment } from "./workClassification.ts";
export type EmployeeMonthlySummary = {
  employee: Employee;
  shiftCount: number;
  totalMinutes: number;
  regularMinutes: number;
  substituteMinutes: number;
  additionalMinutes: number;
  shifts: ScheduleItem[];
  segments: WorkSegment[];
};

/** Aggregate resolved schedule rows; workDate (the start date) owns overnight hours. */
export function getEmployeeMonthlySummaries(
  month: string,
  items: ScheduleItem[],
  employees: Employee[],
  templates: ShiftTemplate[] = []
): EmployeeMonthlySummary[] {
  const templatesById = new Map(templates.map((template) => [template.id, template]));
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
      const segments = shifts.flatMap((shift) => classifyWork(shift, templatesById.get(shift.templateId ?? -1)));
      return {
        employee,
        shifts,
        shiftCount: shifts.length,
        segments,
        regularMinutes: segments.filter((shift) => shift.category === "regular").reduce((total, shift) => total + shift.durationMinutes, 0),
        substituteMinutes: segments.filter((shift) => shift.category === "substitute").reduce((total, shift) => total + shift.durationMinutes, 0),
        additionalMinutes: segments.filter((shift) => shift.category === "additional").reduce((total, shift) => total + shift.durationMinutes, 0),
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
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const groups = [
    ["regular", "정규 근무", summary.regularMinutes],
    ["substitute", "대타 근무", summary.substituteMinutes],
    ["additional", "추가 근무", summary.additionalMinutes],
  ] as const;
  const sections = groups.flatMap(([category, label, minutes]) => {
    if (minutes === 0) return [];
    const shifts = summary.segments
      .filter((shift) => shift.category === category)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startTime.localeCompare(b.startTime));
    if (!shifts.length) return [];
    const lines = shifts.map((shift) => {
      const date = shift.workDate.slice(5).split("-").map(Number).join("/");
      const weekday = weekdays[new Date(`${shift.workDate}T00:00:00`).getDay()];
      return `${date} (${weekday}) ${shift.startTime}-${shift.endTime} ${formatWorkMinutes(shift.durationMinutes)}`;
    });
    return [[label, "", ...lines].join("\n")];
  });
  const totals = [
    ...groups.filter(([, , minutes]) => minutes !== 0).map(([, label, minutes]) => `${label} ${formatWorkMinutes(minutes)}`),
    `총 근무 ${formatWorkMinutes(summary.totalMinutes)}`,
  ].join("\n");
  return [...sections, totals].join("\n\n----------------\n\n");
}
