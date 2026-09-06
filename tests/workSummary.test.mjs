import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEmployeeMonthlySummaries,
  formatWorkMinutes,
  formatSettlementForClipboard,
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
test("settlement splits a changed template shift into slot work and additional extension", () => {
  const templates = [{ id: 1, name: "Day", employeeId: 1, employeeName: "A", daysOfWeek: [3], startTime: "08:00", endTime: "15:00", active: true, createdAt: "", updatedAt: "" }];
  const regular = getEmployeeMonthlySummaries("2026-09", [row({ endTime: "17:00", durationMinutes: 540 })], employees, templates)[0];
  const substitute = getEmployeeMonthlySummaries("2026-09", [row({ employeeId: 2, employeeName: "B", endTime: "17:00", durationMinutes: 540 })], employees, templates)[1];
  assert.deepEqual([regular.regularMinutes, regular.substituteMinutes, regular.additionalMinutes, regular.totalMinutes], [420, 0, 120, 540]);
  assert.deepEqual([substitute.regularMinutes, substitute.substituteMinutes, substitute.additionalMinutes, substitute.totalMinutes], [0, 420, 120, 540]);
  assert.match(formatSettlementForClipboard(regular), /정규 근무 7시간\n추가 근무 2시간\n총 근무 9시간/);
});
test("settlement groups regular/substitute/additional without row labels, names, weekdays, or memo", () => {
  const summary = summarize([
    row({ workDate: "2026-09-12", startTime: "14:00", endTime: "21:00", shiftType: "substitute", templateName: "주말 오후 B (토)" }),
    row({ workDate: "2026-09-08", templateId: null, templateName: "야간 B", memo: "대타 (일)" }),
    row({ workDate: "2026-09-12", templateName: "평일 오전 A" }),
    row({ workDate: "2026-09-01", startTime: "22:00", endTime: "08:00", durationMinutes: 600, shiftType: "substitute", templateId: null, templateName: "야간 A" }),
  ])[0];
  assert.equal(formatSettlementForClipboard(summary), [
    "정규 근무",
    "",
    "9/12 08:00-15:00 7시간",
    "",
    "----------------",
    "",
    "대타 근무",
    "",
    "9/12 14:00-21:00 7시간",
    "",
    "----------------",
    "",
    "추가 근무",
    "",
    "9/1 22:00-08:00 10시간",
    "9/8 08:00-15:00 7시간",
    "",
    "----------------",
    "",
    "정규 근무 7시간",
    "대타 근무 7시간",
    "추가 근무 17시간",
    "총 근무 31시간",
  ].join("\n"));
});
test("settlement omits each zero category, always prints total, and preserves minutes", () => {
  for (const [changes, label] of [
    [{}, "정규"],
    [{ shiftType: "substitute" }, "대타"],
    [{ templateId: null }, "추가"],
  ]) {
    const summary = summarize([row({ ...changes, endTime: "15:15", durationMinutes: 435 })])[0];
    assert.equal(formatSettlementForClipboard(summary), `${label} 근무\n\n9/9 08:00-15:15 7시간 15분\n\n----------------\n\n${label} 근무 7시간 15분\n총 근무 7시간 15분`);
  }
  assert.equal(formatSettlementForClipboard(summarize([])[0]), "총 근무 0시간");
});
test("clipboard sorts each section by date then start time without mutating records", () => {
  const summary = summarize([row({ workDate: "2026-09-10" }), row({ startTime: "15:00", endTime: "22:00" }), row()])[0];
  const before = { ...summary, shifts: summary.shifts.map((shift) => ({ ...shift })) };
  const lines = formatSettlementForClipboard(summary).split("\n").filter((line) => line.startsWith("9/"));
  assert.deepEqual(lines, ["9/9 08:00-15:00 7시간", "9/9 15:00-22:00 7시간", "9/10 08:00-15:00 7시간"]);
  assert.deepEqual(summary, before);
});
test("categories use stored type and template ID, never names or memo", () => {
  const result = summarize([
    row({ durationMinutes: 420, memo: "대타 추가", templateName: "추가" }),
    row({ shiftType: "substitute", startTime: "22:00", endTime: "08:00", durationMinutes: 600 }),
    row({ shiftType: "substitute", templateId: null, startTime: "22:00", endTime: "08:00", durationMinutes: 600 }),
    row({ templateId: null, endTime: "11:00", durationMinutes: 180, memo: "대타", templateName: "정규" }),
  ])[0];
  assert.equal(result.regularMinutes, 420);
  assert.equal(result.substituteMinutes, 600);
  assert.equal(result.additionalMinutes, 780);
  assert.equal(result.totalMinutes, 1800);
});
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
