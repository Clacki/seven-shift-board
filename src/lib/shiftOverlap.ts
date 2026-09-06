import type { ScheduleItem, ShiftInput } from "../types";

type TimedShift = Pick<ShiftInput, "workDate" | "startTime" | "endTime">;

function timeValue(workDate: string, time: string) {
  const [year, month, day] = workDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

function interval(shift: TimedShift) {
  const start = timeValue(shift.workDate, shift.startTime);
  let end = timeValue(shift.workDate, shift.endTime);
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return { start, end };
}

function overlapInterval(first: TimedShift, second: TimedShift) {
  const a = interval(first);
  const b = interval(second);
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

export function overlapMinutes(first: TimedShift, second: TimedShift) {
  const overlap = overlapInterval(first, second);
  return overlap ? (overlap.end - overlap.start) / 60000 : 0;
}

function isCurrentOccurrence(item: ScheduleItem, input: ShiftInput, editingId: number | null) {
  if (editingId !== null) return item.shiftId === editingId;
  return input.templateId !== null && item.templateId === input.templateId && item.workDate === input.workDate;
}

/** An overlap needs confirmation only if this save creates it or makes it longer. */
export function hasNewOrExpandedOverlap(
  original: ScheduleItem | undefined,
  proposed: ShiftInput,
  items: ScheduleItem[],
  editingId: number | null
) {
  return items.some((item) => {
    if (isCurrentOccurrence(item, proposed, editingId)) return false;
    return overlapMinutes(proposed, item) > (original ? overlapMinutes(original, item) : 0);
  });
}

export type OverlapWarning = {
  item: ScheduleItem;
  overlapStart: Date;
  overlapEnd: Date;
};

export function getNewOrExpandedOverlaps(
  original: ScheduleItem,
  proposed: ShiftInput,
  items: ScheduleItem[],
  editingId: number | null
): OverlapWarning[] {
  return items.flatMap((item) => {
    if (isCurrentOccurrence(item, proposed, editingId)) return [];
    if (overlapMinutes(proposed, item) <= overlapMinutes(original, item)) return [];
    const overlap = overlapInterval(proposed, item);
    return overlap ? [{ item, overlapStart: new Date(overlap.start), overlapEnd: new Date(overlap.end) }] : [];
  });
}

/** Mirrors the schedule editor's saved/default occurrence lookup before saving. */
export function needsOverlapConfirmation(
  items: ScheduleItem[],
  proposed: ShiftInput,
  editingId: number | null
): OverlapWarning[] {
  const original = items.find((item) =>
    editingId !== null
      ? item.shiftId === editingId
      : proposed.templateId !== null &&
        item.templateId === proposed.templateId &&
        item.workDate === proposed.workDate
  );
  return original ? getNewOrExpandedOverlaps(original, proposed, items, editingId) : [];
}
