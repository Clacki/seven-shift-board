import { test } from "node:test";
import assert from "node:assert/strict";
import { getShiftCopyOptions, copyShiftToDate } from "../src/lib/shiftCopy.ts";

test("identical times remain distinct ID-based sources and copies preserve their data", () => {
  const base = { workDate: "2026-09-07", startTime: "08:00", endTime: "15:00", shiftType: "regular", memo: "", templateId: 1, employeeId: 1, shiftId: null };
  const rows = [base, { ...base, templateId: null, shiftId: 8, employeeId: 2, shiftType: "substitute", memo: "saved" }, { ...base, templateId: null, shiftId: 9, employeeId: 3 }];
  const options = getShiftCopyOptions(base.workDate, rows, []);
  assert.deepEqual(options.map((option) => [option.id, option.group]), [["template:1", "regular"], ["shift:8", "additional"], ["shift:9", "additional"]]);
  const source = options.find((option) => option.id === "shift:8").source;
  const copy = copyShiftToDate(source, "2026-09-08");
  assert.equal(copy.employeeId, 2);
  assert.equal(copy.shiftType, "substitute");
  assert.equal(copy.memo, "saved");
  assert.equal(copy.workDate, "2026-09-08");
  assert.equal(source.workDate, "2026-09-07");
  assert.equal(copy.templateId, null);
});

test("resolved actual replaces its default; absent active weekday templates remain available", () => {
  const template = { id: 1, active: true, daysOfWeek: [1], employeeId: 1, startTime: "08:00", endTime: "15:00" };
  const actual = { templateId: 1, shiftId: 10, workDate: "2026-09-07", employeeId: 2, startTime: "09:00", endTime: "15:00", shiftType: "substitute", memo: "" };
  const options = getShiftCopyOptions(actual.workDate, [actual], [template, { ...template, id: 2 }, { ...template, id: 3, active: false }, { ...template, id: 4, daysOfWeek: [2] }]);
  assert.deepEqual(options.map((option) => option.id), ["shift:10", "template:2"]);
  assert.equal(options[0].source.startTime, "09:00");
});
