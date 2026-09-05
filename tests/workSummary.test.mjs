import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEmployeeMonthlySummaries,
  formatWorkMinutes,
} from "../src/lib/workSummary.ts";
const employees = [
  { id: 1, name: "A", active: true, color: "#2563EB", createdAt: "" },
  { id: 2, name: "B", active: true, color: "#16A34A", createdAt: "" },
  { id: 3, name: "C", active: false, color: "#EA580C", createdAt: "" },
  { id: 4, name: "D", active: false, color: "#7C3AED", createdAt: "" },
];
const row = (changes = {}) => ({
  employeeId: 1,
  employeeName: "A",
  templateId: 1,
  templateName: "Day",
  shiftId: null,
  workDate: "2026-09-09",
  startTime: "08:00",
  endTime: "15:00",
  durationMinutes: 420,
  shiftType: "regular",
  memo: "",
  ...changes,
});
const summarize = (items) =>
  getEmployeeMonthlySummaries("2026-09", items, employees);
test("regular rows sum authoritative duration minutes", () => {
  const result = summarize([row(), row({ workDate: "2026-09-10" })])[0];
  assert.equal(result.shiftCount, 2);
  assert.equal(result.totalMinutes, 840);
});
test("overnight duration from the existing API is ten hours", () => {
  const result = summarize([
    row({ startTime: "22:00", endTime: "08:00", durationMinutes: 600 }),
  ])[0];
  assert.equal(result.totalMinutes, 600);
  assert.equal(formatWorkMinutes(result.totalMinutes), "10시간");
});
test("final substitute belongs only to replacement employee", () => {
  const result = summarize([
    row({
      employeeId: 2,
      employeeName: "B",
      shiftId: 1,
      shiftType: "substitute",
      durationMinutes: 600,
    }),
  ]);
  assert.equal(result[0].shiftCount, 0);
  assert.equal(result[0].totalMinutes, 0);
  assert.equal(result[1].shiftCount, 1);
  assert.equal(result[1].totalMinutes, 600);
});
test("changed time uses final duration", () => {
  assert.equal(
    summarize([row({ shiftId: 1, endTime: "17:00", durationMinutes: 540 })])[0]
      .totalMinutes,
    540
  );
});
test("extra shift contributes count and minutes", () => {
  const result = summarize([
    row({
      templateId: null,
      shiftId: 8,
      durationMinutes: 240,
      startTime: "18:00",
      endTime: "22:00",
    }),
  ])[0];
  assert.equal(result.shiftCount, 1);
  assert.equal(result.totalMinutes, 240);
});
test("two rows on the same day count as two shifts", () => {
  const result = summarize([
    row(),
    row({
      templateId: null,
      shiftId: 8,
      durationMinutes: 240,
      startTime: "18:00",
      endTime: "22:00",
    }),
  ])[0];
  assert.equal(result.shiftCount, 2);
  assert.equal(result.totalMinutes, 660);
});
test("active employees with zero work remain visible", () => {
  assert.deepEqual(
    summarize([]).map((s) => [s.employee.id, s.shiftCount, s.totalMinutes]),
    [
      [1, 0, 0],
      [2, 0, 0],
    ]
  );
});
test("inactive employees with work remain visible", () => {
  const result = summarize([row({ employeeId: 3, employeeName: "C" })]);
  assert.equal(result.find((s) => s.employee.id === 3).totalMinutes, 420);
  assert(!result.some((s) => s.employee.id === 4));
});
test("adjacent months excluded and month-end overnight stays in starting month", () => {
  const result = summarize([
    row({ workDate: "2026-08-31", durationMinutes: 600 }),
    row({
      workDate: "2026-09-30",
      startTime: "22:00",
      endTime: "08:00",
      durationMinutes: 600,
    }),
    row({ workDate: "2026-10-01" }),
  ])[0];
  assert.equal(result.shiftCount, 1);
  assert.equal(result.totalMinutes, 600);
});
test("details sort by date and time without mutating source", () => {
  const items = [
    row({ workDate: "2026-09-10" }),
    row({ startTime: "18:00" }),
    row(),
  ];
  const before = items.map((item) => ({ ...item }));
  assert.deepEqual(
    summarize(items)[0].shifts.map((s) => s.workDate + " " + s.startTime),
    ["2026-09-09 08:00", "2026-09-09 18:00", "2026-09-10 08:00"]
  );
  assert.deepEqual(items, before);
});
test("minutes are displayed without rounding away partial hours", () => {
  assert.equal(formatWorkMinutes(0), "0시간");
  assert.equal(formatWorkMinutes(435), "7시간 15분");
});
test("recomputed final source reflects edits and restored defaults", () => {
  assert.equal(
    summarize([row({ employeeId: 2, durationMinutes: 540 })])[1].totalMinutes,
    540
  );
  const restored = summarize([row()]);
  assert.equal(restored[0].totalMinutes, 420);
  assert.equal(restored[1].totalMinutes, 0);
});
