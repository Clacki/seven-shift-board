import type { ScheduleItem, ShiftTemplate } from "../types";

export type WorkCategory = "regular" | "substitute" | "additional";
export type WorkSegment = {
  category: WorkCategory;
  workDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  source: ScheduleItem;
};

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
function timeline(startTime: string, endTime: string) {
  const start = minutes(startTime);
  let end = minutes(endTime);
  if (end <= start) end += 1440;
  return { start, end };
}
function dateAt(workDate: string, minute: number) {
  const [year, month, day] = workDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Math.floor(minute / 1440)));
  return date.toISOString().slice(0, 10);
}
function timeAt(minute: number) {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
function segment(category: WorkCategory, source: ScheduleItem, start: number, end: number): WorkSegment | null {
  if (end <= start) return null;
  return { category, workDate: dateAt(source.workDate, start), startTime: timeAt(start), endTime: timeAt(end), durationMinutes: end - start, source };
}

/** Split only for settlement; the persisted actual work record remains unchanged. */
export function classifyWork(item: ScheduleItem, template?: ShiftTemplate): WorkSegment[] {
  const actual = timeline(item.startTime, item.endTime);
  if (!template) {
    const category: WorkCategory = item.templateId === null
      ? "additional"
      : item.shiftType === "substitute" ? "substitute" : "regular";
    return [segment(category, item, actual.start, actual.end)!];
  }
  const planned = timeline(template.startTime, template.endTime);
  const coreStart = Math.max(actual.start, planned.start);
  const coreEnd = Math.min(actual.end, planned.end);
  const coreCategory: WorkCategory = item.employeeId === template.employeeId ? "regular" : "substitute";
  return [
    segment("additional", item, actual.start, Math.min(actual.end, planned.start)),
    segment(coreCategory, item, coreStart, coreEnd),
    segment("additional", item, Math.max(actual.start, planned.end), actual.end),
  ].filter((value): value is WorkSegment => value !== null);
}
