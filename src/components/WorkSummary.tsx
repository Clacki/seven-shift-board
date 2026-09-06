import { useMemo, useState } from "react";
import type { Employee, ScheduleItem, ShiftTemplate } from "../types";
import { employeeStyle } from "../lib/colors";
import { getShiftDisplayStatuses } from "../lib/shiftDisplay";
import {
  formatWorkMinutes,
  formatSettlementForClipboard,
  getEmployeeMonthlySummaries,
  type EmployeeMonthlySummary,
} from "../lib/workSummary";
import { ShiftStatusBadges } from "./ShiftStatusBadges";
import { MonthPicker } from "./MonthPicker";

export function WorkSummary({
  month,
  items,
  employees,
  templates,
  onMove,
}: {
  month: string;
  items: ScheduleItem[];
  employees: Employee[];
  templates: ShiftTemplate[];
  onMove: (delta: number) => void;
}) {
  const summaries = useMemo(
    () => getEmployeeMonthlySummaries(month, items, employees),
    [month, items, employees]
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    summaries.find((summary) => summary.employee.id === selectedId) ??
    summaries.find((summary) => summary.employee.active) ??
    summaries[0];
  const hasShifts = summaries.some((summary) => summary.shiftCount > 0);
  const [message, setMessage] = useState("");
  async function copy() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(formatSettlementForClipboard(selected)); setMessage("정산 내용이 복사되었습니다."); }
    catch { setMessage("정산 내용을 복사하지 못했습니다."); }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>근무 집계</h2>
          <p>
            월간 근무표의 최종 일정 기준입니다. 야간 근무는 시작일이 속한 월에
            포함합니다.
          </p>
        </div>
        <button onClick={() => void copy()} disabled={!selected || selected.shiftCount === 0}>정산 내용 복사</button>
      </div>
      <MonthPicker month={month} onMove={onMove} />
      {message && <p className="notice">{message}</p>}
      {!hasShifts && <p className="notice">이 달에 등록된 근무가 없습니다.</p>}
      <div className="summary-layout">
        <div className="summary-list" role="group" aria-label="직원별 집계">
          <h3>직원별 집계</h3>
          {summaries.map((summary) => (
            <button
              key={summary.employee.id}
              className="employee-summary"
              style={employeeStyle(summary.employee.color)}
              aria-pressed={selected?.employee.id === summary.employee.id}
              onClick={() => setSelectedId(summary.employee.id)}
            >
              <strong>
                {summary.employee.name}
                {!summary.employee.active && <small> · 비활성</small>}
              </strong>
              <span>
                {summary.shiftCount}회 ·{" "}
                {formatWorkMinutes(summary.totalMinutes)}
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <EmployeeShiftDetail
            summary={selected}
            month={month}
            templates={templates}
          />
        ) : (
          <p className="summary-empty">집계할 직원이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function EmployeeShiftDetail({
  summary,
  month,
  templates,
}: {
  summary: EmployeeMonthlySummary;
  month: string;
  templates: ShiftTemplate[];
}) {
  const templatesById = new Map(
    templates.map((template) => [template.id, template])
  );
  const monthLabel = month.replace("-", "년 ") + "월";
  return (
    <div className="summary-detail" aria-label="직원 상세">
      <div
        className="summary-detail-heading"
        style={employeeStyle(summary.employee.color)}
      >
        <h3>{summary.employee.name}</h3>
        <p>{monthLabel}</p>
        <dl className="summary-totals">
          <div>
            <dt>총 근무 횟수</dt>
            <dd>{summary.shiftCount}회</dd>
          </div>
          <div>
            <dt>총 근무시간</dt>
            <dd>{formatWorkMinutes(summary.totalMinutes)}</dd>
          </div>
        </dl>
      </div>
      {summary.shiftCount === 0 ? (
        <p className="summary-empty">
          이 직원의 {monthLabel} 근무 기록이 없습니다.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">
              {summary.employee.name} {monthLabel} 근무 내역
            </caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">근무 시간</th>
                <th scope="col">근무시간</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {summary.shifts.map((item) => {
                const statuses = getShiftDisplayStatuses(
                  item,
                  templatesById.get(item.templateId ?? -1)
                );
                const weekday = ["일", "월", "화", "수", "목", "금", "토"][
                  new Date(item.workDate + "T00:00:00").getDay()
                ];
                return (
                  <tr
                    key={
                      item.workDate + "-" + item.templateId + "-" + item.shiftId
                    }
                  >
                    <td>
                      <time dateTime={item.workDate}>
                        {item.workDate.slice(5).replace("-", ".")} ({weekday})
                      </time>
                    </td>
                    <td>
                      {item.startTime}–{item.endTime}
                      {item.memo.trim() && <small className="shift-memo">{item.memo}</small>}
                    </td>
                    <td>{formatWorkMinutes(item.durationMinutes)}</td>
                    <td>
                      <ShiftStatusBadges statuses={statuses} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
