import type { ScheduleItem, ShiftTemplate } from "../types";

export const SHIFT_STATUS_LABELS = {
  added: "추가",
  substitute: "대타",
  "early-start": "조기출근",
  late: "출근 시간 조정",
  "early-leave": "조기퇴근",
  extended: "연장",
} as const;
export type ShiftDisplayStatus = keyof typeof SHIFT_STATUS_LABELS;

/** Minutes from workDate midnight. Mirrors Rust duration_minutes: end <= start is next day. */
function shiftTimeline(startTime: string, endTime: string) {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return { start, end: end <= start ? end + 1440 : end };
}

/** Compare the final row with its active template occurrence. No stored status flags needed. */
export function getShiftDisplayStatuses(
  item: ScheduleItem,
  template?: ShiftTemplate
): ShiftDisplayStatus[] {
  const weekday = new Date(item.workDate + "T00:00:00").getDay();
  if (
    !template ||
    template.id !== item.templateId ||
    !template.active ||
    !template.daysOfWeek.includes(weekday)
  )
    return ["added"];
  const statuses: ShiftDisplayStatus[] = [];
  if (item.employeeId !== template.employeeId) statuses.push("substitute");
  const planned = shiftTimeline(template.startTime, template.endTime);
  const actual = shiftTimeline(item.startTime, item.endTime);
  if (actual.start < planned.start) statuses.push("early-start");
  else if (actual.start > planned.start) statuses.push("late");
  if (actual.end < planned.end) statuses.push("early-leave");
  else if (actual.end > planned.end) statuses.push("extended");
  return statuses;
}
