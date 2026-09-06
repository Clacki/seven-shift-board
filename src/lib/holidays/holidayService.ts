import { invoke } from "@tauri-apps/api/core";
import type { Holiday } from "./types";
import { getVisibleHolidayYears } from "./calendarHolidays";

// Only coalesce in-flight requests here. SQLite owns all freshness/TTL decisions.
const pending = new Map<number, Promise<Holiday[]>>();
function getHolidays(year: number): Promise<Holiday[]> {
  let request = pending.get(year);
  if (!request) {
    request = invoke<Holiday[]>("get_holidays", { year })
      .catch(() => [] as Holiday[])
      .finally(() => pending.delete(year));
    pending.set(year, request);
  }
  return request;
}
export async function getCalendarHolidays(month: string): Promise<Holiday[]> {
  return (
    await Promise.all(getVisibleHolidayYears(month).map(getHolidays))
  ).flat();
}
