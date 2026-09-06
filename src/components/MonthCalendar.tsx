import { useMemo } from "react";
import type { Employee, ScheduleItem, ShiftTemplate } from "../types";
import { calendarDates, localDate } from "../lib/calendar";
import { employeeStyle } from "../lib/colors";
import {
  getShiftDisplayStatuses,
  SHIFT_STATUS_LABELS,
  type ShiftDisplayStatus,
} from "../lib/shiftDisplay";

import type { Holiday } from "../lib/holidays/types";
import { groupHolidayNames } from "../lib/holidays/calendarHolidays";
import { ShiftStatusBadges } from "./ShiftStatusBadges";

export function MonthCalendar({
  holidays,
  templates,
  month,
  items,
  employees,
  onEdit,
}: {
  holidays: Holiday[];
  templates: ShiftTemplate[];
  month: string;
  items: ScheduleItem[];
  employees: Employee[];
  onEdit: (item: ScheduleItem) => void;
}) {
  const grouped = useMemo(() => {
    const result = new Map<string, ScheduleItem[]>();
    for (const item of items)
      result.set(item.workDate, [...(result.get(item.workDate) ?? []), item]);
    return result;
  }, [items]);
  const colors = new Map(
    employees.map((employee) => [employee.id, employee.color])
  );
  const templatesById = new Map(
    templates.map((template) => [template.id, template])
  );
  const holidayNames = useMemo(() => groupHolidayNames(holidays), [holidays]);
  const today = localDate(new Date());
  return (
    <div className="month-calendar" aria-label={month + " 근무 달력"}>
      {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
        <div key={day} className={"calendar-weekday weekday-" + index}>
          {day}
        </div>
      ))}
      {calendarDates(month).map((date, index) => {
        const holidayName = holidayNames.get(date);
        return (
          <div
            key={date}
            className={
              "calendar-day " +
              (date.startsWith(month) ? "" : "outside-month ") +
              (date === today ? "is-today " : "") +
              (holidayName ? "is-holiday" : "")
            }
          >
            <div className="calendar-date-header">
              <time
                dateTime={date}
                aria-current={date === today ? "date" : undefined}
                className={"calendar-date weekday-" + (index % 7)}
              >
                {Number(date.slice(-2))}
                {date === today && <small>오늘</small>}
              </time>
              <span className="calendar-holiday" title={holidayName}>
                {holidayName}
              </span>
            </div>
            <div className="calendar-shifts">
              {(grouped.get(date) ?? []).map((item) => (
                <ShiftItem
                  key={
                    String(item.templateId) + "-" + item.shiftId + "-" + date
                  }
                  item={item}
                  statuses={getShiftDisplayStatuses(
                    item,
                    templatesById.get(item.templateId ?? -1)
                  )}
                  color={colors.get(item.employeeId) ?? ""}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function ShiftItem({
  item,
  color,
  statuses,
  onEdit,
}: {
  item: ScheduleItem;
  color: string;
  statuses: ShiftDisplayStatus[];
  onEdit: (item: ScheduleItem) => void;
}) {
  const label =
    item.employeeName +
    " " +
    item.startTime +
    "–" +
    item.endTime +
    " " +
    statuses.map((status) => SHIFT_STATUS_LABELS[status]).join(" · ");
  return (
    <button
      className="calendar-shift"
      style={employeeStyle(color)}
      onClick={() => onEdit(item)}
      aria-label={item.workDate + " " + label + " 편집"}
      title={
        label +
        " · " +
        item.templateName +
        " · " +
        item.durationMinutes / 60 +
        "시간"
      }
    >
      <span className="shift-heading">
        <strong>{item.employeeName}</strong>
        <ShiftStatusBadges statuses={statuses} compact />
      </span>
      <span className="shift-time">
        {item.startTime}–{item.endTime}
      </span>
    </button>
  );
}
