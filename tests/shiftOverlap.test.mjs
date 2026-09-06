import { test } from "node:test";
import assert from "node:assert/strict";
import { hasNewOrExpandedOverlap, needsOverlapConfirmation, overlapMinutes } from "../src/lib/shiftOverlap.ts";

const shift = (changes = {}) => ({
  shiftId: 1, templateId: 1, employeeId: 1, employeeName: "A", templateName: "Night",
  workDate: "2026-09-06", startTime: "22:00", endTime: "08:00", durationMinutes: 600,
  shiftType: "regular", memo: "", ...changes,
});
const input = (changes = {}) => {
  const item = shift(changes);
  return { templateId: item.templateId, employeeId: item.employeeId, workDate: item.workDate, startTime: item.startTime, endTime: item.endTime, shiftType: item.shiftType, memo: item.memo };
};

test("compares overnight shifts with the following calendar date", () => {
  assert.equal(overlapMinutes(shift(), shift({ shiftId: 2, workDate: "2026-09-07", startTime: "08:00", endTime: "15:00" })), 0);
  assert.equal(overlapMinutes(input({ endTime: "09:00" }), shift({ shiftId: 2, workDate: "2026-09-07", startTime: "08:00", endTime: "15:00" })), 60);
});

test("schedule save flow warns when 9/6 22:00-08:00 becomes 22:00-10:00 beside 9/7 08:00-15:00", () => {
  const night = shift({ shiftId: null, templateId: 11, workDate: "2026-09-06", startTime: "22:00", endTime: "08:00" });
  const morning = shift({ shiftId: null, templateId: 12, workDate: "2026-09-07", startTime: "08:00", endTime: "15:00" });
  const savedInput = input({ templateId: 11, workDate: "2026-09-06", startTime: "22:00", endTime: "10:00" });
  assert.equal(overlapMinutes(night, morning), 0);
  assert.equal(overlapMinutes(savedInput, morning), 120);
  const warnings = needsOverlapConfirmation([night, morning], savedInput, null);
  assert.equal(warnings.length, 1);
  assert.deepEqual([
    warnings[0].item.employeeName,
    warnings[0].overlapStart.toISOString(),
    warnings[0].overlapEnd.toISOString(),
  ], ["A", "2026-09-07T08:00:00.000Z", "2026-09-07T10:00:00.000Z"]);
});

test("warns only when an overlap is new or larger", () => {
  const original = shift({ startTime: "08:00", endTime: "15:00" });
  const other = shift({ shiftId: 2, templateId: 2, employeeId: 2, workDate: "2026-09-06", startTime: "14:00", endTime: "21:00" });
  assert.equal(hasNewOrExpandedOverlap(original, input({ startTime: "08:00", endTime: "16:00" }), [original, other], 1), true);
  assert.equal(hasNewOrExpandedOverlap(original, input({ startTime: "08:00", endTime: "15:00" }), [original, other], 1), false);
  assert.equal(hasNewOrExpandedOverlap(original, input({ startTime: "08:00", endTime: "14:30" }), [original, other], 1), false);
});

test("excludes the saved occurrence itself but compares all employees and shift kinds", () => {
  const original = shift({ shiftId: 7, templateId: null, shiftType: "substitute", startTime: "08:00", endTime: "15:00" });
  const other = shift({ shiftId: 8, templateId: null, employeeId: 2, shiftType: "regular", startTime: "15:00", endTime: "22:00" });
  assert.equal(hasNewOrExpandedOverlap(original, input({ shiftId: 7, templateId: null, shiftType: "substitute", startTime: "08:00", endTime: "16:00" }), [original, other], 7), true);
  assert.equal(hasNewOrExpandedOverlap(original, input({ shiftId: 7, templateId: null, shiftType: "substitute", startTime: "08:00", endTime: "15:00" }), [original], 7), false);
});
