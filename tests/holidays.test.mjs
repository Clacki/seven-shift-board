import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getVisibleHolidayYears,
  groupHolidayNames,
} from "../src/lib/holidays/calendarHolidays.ts";
test("same-year adjacent months use one year request", () => {
  assert.deepEqual(getVisibleHolidayYears("2026-09"), [2026]);
});
test("December and January include only visible boundary years", () => {
  assert.deepEqual(getVisibleHolidayYears("2026-12"), [2026, 2027]);
  assert.deepEqual(getVisibleHolidayYears("2027-01"), [2026, 2027]);
});
test("holiday metadata includes adjacent dates and multiple names without duplication", () => {
  const grouped = groupHolidayNames([
    { date: "2026-10-03", name: "개천절" },
    { date: "2026-10-03", name: "개천절" },
    { date: "2026-10-03", name: "다른 공휴일" },
  ]);
  assert.equal(grouped.get("2026-10-03"), "개천절 · 다른 공휴일");
  assert.equal(grouped.get("2026-09-01"), undefined);
});
