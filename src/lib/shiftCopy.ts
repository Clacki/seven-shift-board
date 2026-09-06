import type { ScheduleItem, ShiftInput, ShiftTemplate } from "../types";

export function getWorkCategory(item: ShiftInput) {
  if (item.shiftType === "substitute") return "substitute";
  return item.templateId === null ? "additional" : "regular";
}

export function getShiftCopyOptions(date: string, items: ScheduleItem[], templates: ShiftTemplate[]) {
  const rows = items.filter((item) => item.workDate === date);
  const weekday = new Date(date + "T00:00:00").getDay();
  const actual = rows.map((item) => ({
    id: item.shiftId !== null ? `shift:${item.shiftId}` : `template:${item.templateId}`,
    group: getWorkCategory(item) === "regular" ? "regular" : "additional",
    source: item as ShiftInput,
  }));
  const defaults = templates
    .filter((template) => template.active && template.daysOfWeek.includes(weekday) && !rows.some((item) => item.templateId === template.id))
    .map((template) => ({
      id: `template:${template.id}`,
      group: "regular",
      source: { templateId: template.id, employeeId: template.employeeId, workDate: date, startTime: template.startTime, endTime: template.endTime, shiftType: "regular", memo: "" } as ShiftInput,
    }));
  return [...actual, ...defaults];
}

/** Copy into a new independent record; never overwrite the source occurrence. */
export function copyShiftToDate(source: ShiftInput, workDate: string): ShiftInput {
  return {
    templateId: null,
    employeeId: source.employeeId,
    workDate,
    startTime: source.startTime,
    endTime: source.endTime,
    shiftType: source.shiftType,
    memo: source.memo,
  };
}
