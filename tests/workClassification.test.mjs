import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyWork } from "../src/lib/workClassification.ts";

const template = { id: 1, name: "Day", employeeId: 1, employeeName: "A", daysOfWeek: [1], startTime: "08:00", endTime: "15:00", active: true, createdAt: "", updatedAt: "" };
const item = (changes = {}) => ({ shiftId: 1, templateId: 1, templateName: "Day", employeeId: 1, employeeName: "A", workDate: "2026-09-07", startTime: "08:00", endTime: "15:00", durationMinutes: 420, shiftType: "substitute", memo: "", ...changes });

test("template owner is regular and replacement is substitute without using shiftType", () => {
  assert.deepEqual(classifyWork(item({ shiftType: "substitute" }), template).map((part) => [part.category, part.durationMinutes]), [["regular", 420]]);
  assert.deepEqual(classifyWork(item({ employeeId: 2, employeeName: "B", shiftType: "regular" }), template).map((part) => [part.category, part.durationMinutes]), [["substitute", 420]]);
});

test("extended template work keeps the slot category and counts only excess as additional", () => {
  assert.deepEqual(classifyWork(item({ endTime: "17:00", durationMinutes: 540 }), template).map((part) => [part.category, part.startTime, part.endTime, part.durationMinutes]), [["regular", "08:00", "15:00", 420], ["additional", "15:00", "17:00", 120]]);
  assert.deepEqual(classifyWork(item({ employeeId: 2, endTime: "17:00", durationMinutes: 540 }), template).map((part) => [part.category, part.durationMinutes]), [["substitute", 420], ["additional", 120]]);
});

test("unlinked work is additional and overnight extension uses the following date", () => {
  assert.deepEqual(classifyWork(item({ templateId: null, startTime: "18:00", endTime: "20:00", durationMinutes: 120 }), undefined).map((part) => [part.category, part.durationMinutes]), [["additional", 120]]);
  const night = { ...template, startTime: "22:00", endTime: "08:00" };
  assert.deepEqual(classifyWork(item({ workDate: "2026-09-06", startTime: "22:00", endTime: "10:00", durationMinutes: 720 }), night).map((part) => [part.category, part.workDate, part.startTime, part.endTime, part.durationMinutes]), [["regular", "2026-09-06", "22:00", "08:00", 600], ["additional", "2026-09-07", "08:00", "10:00", 120]]);
});
