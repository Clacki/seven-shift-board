import console from "node:console";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getShiftDisplayStatuses } from "../src/lib/shiftDisplay.ts";
import {
  employeeStyle,
  EMPLOYEE_COLORS,
  getDefaultEmployeeColor,
} from "../src/lib/colors.ts";
import { calendarDates } from "../src/lib/calendar.ts";
const template = {
  id: 1,
  employeeId: 1,
  active: true,
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "15:00",
};
const shift = {
  templateId: 1,
  shiftId: null,
  employeeId: 1,
  workDate: "2026-09-07",
  startTime: "08:00",
  endTime: "15:00",
  shiftType: "regular",
};
for (const [name, changes, expected] of [
  ["identical regular", {}, []],
  ["employee only", { employeeId: 2 }, ["substitute"]],
  ["late start", { startTime: "09:00" }, ["late"]],
  ["early start", { startTime: "07:00" }, ["early-start"]],
  ["early leave", { endTime: "14:00" }, ["early-leave"]],
  ["extended end", { endTime: "17:00" }, ["extended"]],
  [
    "late and extended",
    { startTime: "09:00", endTime: "17:00" },
    ["late", "extended"],
  ],
  [
    "substitute late extended",
    { employeeId: 2, startTime: "09:00", endTime: "17:00" },
    ["substitute", "late", "extended"],
  ],
  ["added", { templateId: null }, ["added"]],
  [
    "added ignores employee and time differences",
    { templateId: null, employeeId: 2, startTime: "18:00", endTime: "22:00" },
    ["added"],
  ],
  ["saved identical actual", { shiftId: 5 }, []],
  [
    "legacy substitute flag cannot create status",
    { shiftId: 5, shiftType: "substitute" },
    [],
  ],
  ["inactive weekday occurrence", { workDate: "2026-09-06" }, ["added"]],
  [
    "stable order for all early states",
    { employeeId: 2, startTime: "07:00", endTime: "14:00" },
    ["substitute", "early-start", "early-leave"],
  ],
])
  test(name, () =>
    assert.deepEqual(
      getShiftDisplayStatuses({ ...shift, ...changes }, template),
      expected
    )
  );
for (const [name, changes, expected] of [
  [
    "night late extended",
    { startTime: "23:00", endTime: "09:00" },
    ["late", "extended"],
  ],
  [
    "night early start and leave",
    { startTime: "21:00", endTime: "07:00" },
    ["early-start", "early-leave"],
  ],
  [
    "night substitute and time changes",
    { employeeId: 2, startTime: "23:00", endTime: "09:00" },
    ["substitute", "late", "extended"],
  ],
  [
    "night ends before midnight",
    { startTime: "22:00", endTime: "23:00" },
    ["early-leave"],
  ],
  [
    "night ends at midnight",
    { startTime: "22:00", endTime: "00:00" },
    ["early-leave"],
  ],
  [
    "equal times mean next day",
    { startTime: "22:00", endTime: "22:00" },
    ["extended"],
  ],
  [
    "same next-day endpoint",
    { startTime: "23:00", endTime: "08:00" },
    ["late"],
  ],
])
  test(name, () =>
    assert.deepEqual(
      getShiftDisplayStatuses(
        { ...shift, ...changes },
        { ...template, startTime: "22:00", endTime: "08:00" }
      ),
      expected
    )
  );
test("missing or inactive template", () => {
  assert.deepEqual(getShiftDisplayStatuses(shift), ["added"]);
  assert.deepEqual(
    getShiftDisplayStatuses(shift, { ...template, active: false }),
    ["added"]
  );
});
test("color edits derive new background and preserve stored accent", () => {
  assert.notEqual(
    employeeStyle("#6485B5")["--employee-bg"],
    employeeStyle("#6B9475")["--employee-bg"]
  );
  assert.equal(employeeStyle("#123456")["--employee-border"], "#123456");
  assert.equal(employeeStyle("#000000")["--employee-bg"], "rgb(184,184,184)");
  assert.equal(employeeStyle("#FFFFFF")["--employee-bg"], "rgb(255,255,255)");
});
test("five/six weeks and adjacent months", () => {
  assert.equal(calendarDates("2026-09").length, 35);
  assert.equal(calendarDates("2026-05").length, 42);
  assert.equal(calendarDates("2026-09")[0], "2026-08-30");
  assert.equal(calendarDates("2026-09").at(-1), "2026-10-03");
});

test("automatic colors avoid active duplicates case-insensitively", () => {
  const employees = EMPLOYEE_COLORS.slice(0, 6).map((color) => ({
    active: true,
    color: color.toLowerCase(),
  }));
  assert.equal(getDefaultEmployeeColor(employees), EMPLOYEE_COLORS[6]);
  assert.equal(
    getDefaultEmployeeColor([{ active: false, color: EMPLOYEE_COLORS[0] }]),
    EMPLOYEE_COLORS[0]
  );
  const all = EMPLOYEE_COLORS.map((color) => ({ active: true, color }));
  assert.equal(getDefaultEmployeeColor([...all, all[0]]), EMPLOYEE_COLORS[1]);
});
test("preset backgrounds and hover retain readable neutral text contrast", () => {
  const luminance = (rgb) =>
    rgb
      .map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const text = luminance([39, 48, 60]);
  let minimum = Infinity;
  for (const color of EMPLOYEE_COLORS) {
    const style = employeeStyle(color);
    assert.equal(style["--employee-border"], color);
    for (const key of ["--employee-bg", "--employee-hover"]) {
      const contrast =
        (luminance(style[key].match(/\d+/g).map(Number)) + 0.05) /
        (text + 0.05);
      minimum = Math.min(minimum, contrast);
      assert(contrast >= 4.5, color + " " + key + " " + contrast);
    }
  }
  console.log("Minimum preset text contrast:", minimum.toFixed(2));
});
