import { calendarDates } from "../calendar.ts";
import type { Holiday } from "./types";

export function getVisibleHolidayYears(month: string): number[] {
  return [
    ...new Set(calendarDates(month).map((date) => Number(date.slice(0, 4)))),
  ];
}
export function groupHolidayNames(holidays: Holiday[]): Map<string, string> {
  const names = new Map<string, Set<string>>();
  for (const holiday of holidays) {
    const group = names.get(holiday.date) ?? new Set<string>();
    group.add(holiday.name);
    names.set(holiday.date, group);
  }
  return new Map(
    [...names].map(([date, group]) => [date, [...group].join(" · ")])
  );
}
