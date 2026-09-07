import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { WorkSummary } from "./components/WorkSummary";
import { MonthPicker } from "./components/MonthPicker";
import { MonthCalendar } from "./components/MonthCalendar";
import { TimeInput } from "./components/TimeInput";
import { calendarDates, localDate } from "./lib/calendar";
import {
  EMPLOYEE_COLOR_PRESETS,
  getDefaultEmployeeColor,
  employeeStyle,
} from "./lib/colors";
import { getCalendarHolidays } from "./lib/holidays/holidayService";
import { copyShiftToDate, getShiftCopyOptions } from "./lib/shiftCopy";
import { needsOverlapConfirmation, type OverlapWarning } from "./lib/shiftOverlap";
import type { Holiday } from "./lib/holidays/types";
import { api } from "./lib/api";
import type {
  Employee,
  EmployeeInput,
  ScheduleItem,
  ShiftInput,
  ShiftTemplate,
  ShiftTemplateInput,
} from "./types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const todayMonth = () => localDate(new Date()).slice(0, 7);
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function App() {
  const [tab, setTab] = useState<
    "schedule" | "summary" | "templates" | "employees" | "settings"
  >("schedule");
  const [month, setMonth] = useState(todayMonth);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [holidayReload, setHolidayReload] = useState(0);
  const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
  const [myEmployeeLoaded, setMyEmployeeLoaded] = useState(false);
  const [savingMyEmployee, setSavingMyEmployee] = useState(false);
  const selectedEmployeeId = employees.some((employee) => employee.id === myEmployeeId && employee.active)
    ? myEmployeeId : null;
  useEffect(() => {
    void api.getMyEmployeeId().then(setMyEmployeeId)
      .catch(() => undefined)
      .finally(() => setMyEmployeeLoaded(true));
  }, []);

  async function selectMyEmployee(employeeId: number | null) {
    setSavingMyEmployee(true);
    try {
      await api.setMyEmployeeId(employeeId);
      setMyEmployeeId(employeeId);
      setError("");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSavingMyEmployee(false);
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextEmployees, nextTemplates, nextSchedule] = await Promise.all([
        api.listEmployees(),
        api.listTemplates(),
        Promise.all(
          [
            ...new Set(calendarDates(month).map((date) => date.slice(0, 7))),
          ].map(api.getMonthSchedule)
        ).then((months) => months.flat()),
      ]);
      setEmployees(nextEmployees);
      setTemplates(nextTemplates);
      setSchedule(nextSchedule);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, [month, holidayReload]);

  async function resetData() {
    try {
      await api.resetData();
      setHolidays([]);
      setHolidayReload((value) => value + 1);
      await reload();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  useEffect(() => {
    // Tauri 데이터 로딩은 화면 진입/월 변경 시 수행하는 외부 시스템 동기화다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  useEffect(() => {
    let cancelled = false;
    // This optional request never participates in the schedule loading/error state.
    void getCalendarHolidays(month).then((result) => {
      if (!cancelled) setHolidays(result);
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  function moveMonth(delta: number) {
    const [year, value] = month.split("-").map(Number);
    const next = new Date(year, value - 1 + delta, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
    );
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>세븐 근무관리</h1>
          <p>정규 스케줄과 실제 근무 기록을 로컬에서 관리합니다.</p>
        </div>
        <div className="header-actions">
          <span className="local-badge">로컬 SQLite</span>
        </div>
      </header>
      <nav>
        <button
          className={tab === "schedule" ? "active" : ""}
          onClick={() => setTab("schedule")}
        >
          월간 근무표
        </button>
        <button
          className={tab === "summary" ? "active" : ""}
          onClick={() => setTab("summary")}
        >
          근무 집계
        </button>
        <button
          className={tab === "templates" ? "active" : ""}
          onClick={() => setTab("templates")}
        >
          기본 근무 설정
        </button>
        <button
          className={tab === "employees" ? "active" : ""}
          onClick={() => setTab("employees")}
        >
          직원 관리
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          설정
        </button>
      </nav>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="loading">데이터를 불러오는 중...</div>
      ) : (
        <main>
          {tab === "schedule" && (
            <ScheduleView
              holidays={holidays}
              month={month}
              templates={templates}
              items={schedule}
              employees={employees}
              onMove={moveMonth}
              onReload={reload}
              myEmployeeId={selectedEmployeeId}
              onMyEmployeeChange={selectMyEmployee}
              myEmployeeDisabled={!myEmployeeLoaded || savingMyEmployee}
            />
          )}
          {tab === "summary" && (
            <WorkSummary
              month={month}
              items={schedule}
              employees={employees}
              templates={templates}
              onMove={moveMonth}
            />
          )}
          {tab === "templates" && (
            <TemplateView
              templates={templates}
              employees={employees}
              onReload={reload}
            />
          )}
          {tab === "employees" && (
            <EmployeeView employees={employees} onReload={reload} />
          )}
          {tab === "settings" && <SettingsView onReset={resetData} onReload={reload} />}
        </main>
      )}
      <footer className="app-footer">Developed by 김광욱</footer>
    </div>
  );
}

function ScheduleView({
  holidays,
  templates,
  month,
  items,
  employees,
  onMove,
  onReload,
  myEmployeeId,
  onMyEmployeeChange,
  myEmployeeDisabled,
}: {
  month: string;
  templates: ShiftTemplate[];
  holidays: Holiday[];
  items: ScheduleItem[];
  employees: Employee[];
  onMove: (delta: number) => void;
  onReload: () => Promise<void>;
  myEmployeeId: number | null;
  onMyEmployeeChange: (value: number | null) => Promise<void>;
  myEmployeeDisabled: boolean;
}) {
  const [editing, setEditing] = useState<ShiftInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pendingOverlapSave, setPendingOverlapSave] = useState<{ input: ShiftInput; warnings: OverlapWarning[] } | null>(null);
  const [copyDate, setCopyDate] = useState(`${month}-01`);
  const copyOptions = getShiftCopyOptions(copyDate, items, templates);
  function edit(item: ScheduleItem) {
    setEditingId(item.shiftId);
    setEditing({
      templateId: item.templateId,
      employeeId: item.employeeId,
      workDate: item.workDate,
      startTime: item.startTime,
      endTime: item.endTime,
      shiftType: item.shiftType,
      memo: item.memo,
    });
  }
  function add() {
    const employee = employees.find((item) => item.active) ?? employees[0];
    if (employee) {
      setEditingId(null);
      setEditing({
        templateId: null,
        employeeId: employee.id,
        workDate: `${month}-01`,
        startTime: "08:00",
        endTime: "15:00",
        shiftType: "regular",
        memo: "",
      });
    }
  }
  async function persist(editing: ShiftInput) {
    const template = templates.find((item) => item.id === editing.templateId);
    const saved = template
      ? { ...editing, shiftType: editing.employeeId === template.employeeId ? "regular" as const : "substitute" as const }
      : { ...editing, shiftType: "regular" as const };
    try {
      await api.saveShift(saved, editingId);
      setPendingOverlapSave(null);
      setEditing(null);
      setMessage("실제 근무 기록을 저장했습니다.");
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const warnings = needsOverlapConfirmation(items, editing, editingId);
    if (warnings.length) {
      setPendingOverlapSave({ input: editing, warnings });
      return;
    }
    void persist(editing);
  }
  async function remove() {
    if (
      !editingId ||
      !confirm("저장된 실제 근무 기록을 삭제하고 기본 일정으로 되돌릴까요?")
    )
      return;
    try {
      await api.deleteShift(editingId);
      setEditing(null);
      setMessage("실제 기록을 삭제했습니다.");
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>월간 근무표</h2>
          <p>항목을 선택해 실제 담당자나 시간을 변경할 수 있습니다.</p>
        </div>
        <button onClick={add}>+ 추가 근무</button>
      </div>
      <MonthPicker month={month} onMove={onMove} />
      <label className="calendar-filter">
        내 근무 보기
        <select
          value={myEmployeeId ?? ""}
          disabled={myEmployeeDisabled}
          onChange={(event) => void onMyEmployeeChange(event.target.value === "" ? null : Number(event.target.value))}
        >
          <option value="">전체 근무</option>
          {employees.filter((employee) => employee.active).map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </select>
      </label>
      {message && <p className="notice">{message}</p>}
      <MonthCalendar
        holidays={holidays}
        templates={templates}
        month={month}
        items={myEmployeeId !== null ? items.filter((item) => item.employeeId === myEmployeeId) : items}
        employees={employees}
        onEdit={edit}
      />
      {editing && (
        <Modal
          title={editing.templateId ? "실제 근무 수정" : "추가 근무 등록"}
          onClose={() => { setPendingOverlapSave(null); setEditing(null); }}
        >
          <form onSubmit={save} className="form-grid">
            {editing.templateId === null && editingId === null && (
              <fieldset className="full shift-copy">
                <legend>근무 복사</legend>
                <label>복사할 근무 날짜
                  <input type="date" value={copyDate} min={`${month}-01`} max={localDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0))} onChange={(event) => setCopyDate(event.target.value)} />
                </label>
                {([ ["regular", "정규 근무"], ["additional", "대타 / 추가 근무"] ] as const).map(([group, label]) => (
                  <div key={group}>
                    <h4>{label}</h4>
                    <div className="shift-copy-options">
                    {copyOptions.filter((option) => option.group === group).map((option) => (
                      <button type="button" key={option.id} onClick={() => {
                        const selected = copyOptions.find((candidate) => candidate.id === option.id);
                        if (selected) setEditing(copyShiftToDate(selected.source, editing.workDate));
                      }}>{option.source.startTime} ~ {option.source.endTime}</button>
                    ))}
                    </div>
                    {!copyOptions.some((option) => option.group === group) && <p>등록된 근무가 없습니다.</p>}
                  </div>
                ))}
              </fieldset>
            )}
            <p className="full notice">
              {items.find(
                (item) =>
                  item.shiftId === editingId &&
                  item.templateId === editing.templateId &&
                  item.workDate === editing.workDate
              )?.templateName ?? "추가 근무"}{" "}
              · 총{" "}
              {((Number(editing.endTime.slice(0, 2)) * 60 +
                Number(editing.endTime.slice(3)) -
                Number(editing.startTime.slice(0, 2)) * 60 -
                Number(editing.startTime.slice(3)) +
                1440) %
                1440 || 1440) / 60}
              시간
            </p>
            <label>
              근무 날짜
              <input
                type="date"
                disabled={editing.templateId !== null}
                value={editing.workDate}
                onChange={(e) =>
                  setEditing({ ...editing, workDate: e.target.value })
                }
                required
              />
            </label>
            <label>
              실제 담당
              <select
                value={editing.employeeId}
                onChange={(e) =>
                  setEditing({ ...editing, employeeId: Number(e.target.value) })
                }
              >
                {employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? "" : " (비활성)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작 시간
              <TimeInput
                value={editing.startTime}
                onChange={(startTime) => setEditing({ ...editing, startTime })}
              />
            </label>
            <label>
              종료 시간
              <TimeInput
                value={editing.endTime}
                allowEndOfDay
                onChange={(endTime) => setEditing({ ...editing, endTime })}
              />
            </label>
            <label className="full">
              메모
              <textarea
                value={editing.memo}
                onChange={(e) =>
                  setEditing({ ...editing, memo: e.target.value })
                }
              />
            </label>
            <div className="form-actions full">
              {editingId && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove()}
                >
                  실제 기록 삭제
                </button>
              )}
              <span />
              <button type="button" onClick={() => setEditing(null)}>
                취소
              </button>
              <button className="primary">저장</button>
            </div>
          </form>
        </Modal>
      )}
      {pendingOverlapSave && (
        <Modal title="다른 근무와 시간이 겹칩니다." onClose={() => setPendingOverlapSave(null)}>
          <div className="overlap-warning-list">
            {pendingOverlapSave.warnings.map((warning) => (
              <p key={`${warning.item.shiftId}-${warning.item.templateId}-${warning.item.workDate}-${warning.item.startTime}`}>
                {formatOverlapDate(warning.overlapStart)} {warning.item.employeeName} {warning.item.startTime}~{warning.item.endTime}
                <span> · 중복 {formatOverlapTime(warning.overlapStart)}~{formatOverlapTime(warning.overlapEnd)}</span>
              </p>
            ))}
          </div>
          <p className="confirm-message">그래도 저장하시겠습니까?</p>
          <div className="confirm-actions">
            <button type="button" autoFocus onClick={() => setPendingOverlapSave(null)}>취소</button>
            <button type="button" className="primary" onClick={() => void persist(pendingOverlapSave.input)}>저장</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function formatOverlapDate(value: Date) {
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}`;
}
function formatOverlapTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function TemplateView({
  templates,
  employees,
  onReload,
}: {
  templates: ShiftTemplate[];
  employees: Employee[];
  onReload: () => Promise<void>;
}) {
  const blank = (): ShiftTemplateInput => ({
    name: "",
    employeeId: employees.find((item) => item.active)?.id ?? 0,
    daysOfWeek: [],
    startTime: "08:00",
    endTime: "15:00",
    active: true,
  });
  const [form, setForm] = useState<ShiftTemplateInput | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  function edit(item: ShiftTemplate) {
    setId(item.id);
    setForm({
      name: item.name,
      employeeId: item.employeeId,
      daysOfWeek: item.daysOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      active: item.active,
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      if (id) await api.updateTemplate(id, form);
      else await api.createTemplate(form);
      setForm(null);
      setMessage("기본 근무를 저장했습니다.");
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  async function toggle(item: ShiftTemplate) {
    try {
      await api.updateTemplate(item.id, {
        name: item.name,
        employeeId: item.employeeId,
        daysOfWeek: item.daysOfWeek,
        startTime: item.startTime,
        endTime: item.endTime,
        active: !item.active,
      });
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>기본 근무 설정</h2>
          <p>변경 사항은 계산 일정에 적용되며 저장된 실제 기록은 유지됩니다.</p>
        </div>
        <button
          onClick={() => {
            setId(null);
            setForm(blank());
          }}
        >
          + 기본 근무
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>근무명</th>
              <th>요일</th>
              <th>시간</th>
              <th>담당</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((item) => (
              <tr className={item.active ? "" : "muted"} key={item.id}>
                <td>{item.name}</td>
                <td>{item.daysOfWeek.map((day) => DAYS[day]).join(", ")}</td>
                <td>
                  {item.startTime}~{item.endTime}
                </td>
                <td>{item.employeeName}</td>
                <td>{item.active ? "활성" : "비활성"}</td>
                <td className="actions">
                  <button onClick={() => edit(item)}>수정</button>
                  <button onClick={() => void toggle(item)}>
                    {item.active ? "비활성화" : "활성화"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal
          title={id ? "기본 근무 수정" : "기본 근무 추가"}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save} className="form-grid">
            <label className="full">
              근무명
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              담당 직원
              <select
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: Number(e.target.value) })
                }
              >
                {employees.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.active ? "" : " (비활성)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              상태
              <select
                value={String(form.active)}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "true" })
                }
              >
                <option value="true">활성</option>
                <option value="false">비활성</option>
              </select>
            </label>
            <fieldset className="full">
              <legend>요일</legend>
              <div className="days">
                {DAYS.map((day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={form.daysOfWeek.includes(index)}
                      onChange={() =>
                        setForm({
                          ...form,
                          daysOfWeek: form.daysOfWeek.includes(index)
                            ? form.daysOfWeek.filter((value) => value !== index)
                            : [...form.daysOfWeek, index],
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              시작 시간
              <TimeInput
                value={form.startTime}
                onChange={(startTime) => setForm({ ...form, startTime })}
              />
            </label>
            <label>
              종료 시간
              <TimeInput
                value={form.endTime}
                allowEndOfDay
                onChange={(endTime) => setForm({ ...form, endTime })}
              />
            </label>
            <div className="form-actions full">
              <span />
              <button type="button" onClick={() => setForm(null)}>
                취소
              </button>
              <button className="primary">저장</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function SettingsView({ onReset, onReload }: { onReset: () => Promise<void>; onReload: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  async function exportBackup() {
    setExporting(true);
    setMessage("");
    try {
      const path = await api.exportDatabaseBackup();
      setMessage(path ? `백업 파일을 저장했습니다: ${path}` : "백업 내보내기를 취소했습니다.");
    } catch (error) {
      setMessage(`백업 파일 저장 실패: ${errorText(error)}`);
    } finally {
      setExporting(false);
    }
  }
  async function restoreBackup() {
    setRestoring(true);
    setMessage("");
    try {
      const safetyPath = await api.restoreDatabaseBackup();
      if (safetyPath) {
        await onReload();
        setMessage(`백업을 복원했습니다. 복원 전 데이터는 다음 파일에 저장되었습니다: ${safetyPath}`);
      } else {
        setMessage("백업 복원을 취소했습니다.");
      }
    } catch (error) {
      setMessage(`백업 복원 실패: ${errorText(error)}`);
    } finally {
      setRestoring(false);
      setConfirmingRestore(false);
    }
  }
  const [key, setKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void api.getHolidayApiKey().then((saved) => {
      setKey(saved ?? "");
      setLoaded(true);
    }).catch((error) => setMessage(errorText(error)));
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.setHolidayApiKey(key);
      setMessage(key.trim() ? "공휴일 API 키를 저장했습니다." : "저장된 공휴일 API 키를 제거했습니다.");
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  async function reset() {
    await onReset();
    setConfirmingReset(false);
  }
  return <section className="settings-page">
    <div className="section-heading"><div><h2>설정</h2></div></div>
    {message && <p className="notice">{message}</p>}
    <div className="settings-card">
      <h3>데이터 관리</h3>
      <div className="settings-item">
        <strong>데이터 백업</strong>
        <p>직원, 근무 기록, 앱 설정을 포함한 전체 데이터를 백업합니다.</p>
        <div className="settings-actions settings-actions-start">
          <button type="button" disabled={exporting} onClick={() => void exportBackup()}>
            {exporting ? "백업 내보내는 중..." : "백업 파일 내보내기"}
          </button>
          <button type="button" disabled={restoring} onClick={() => setConfirmingRestore(true)}>
            {restoring ? "백업 복원 중..." : "백업 파일 복원"}
          </button>
        </div>
      </div>
      <div className="danger-zone">
        <strong>위험 영역</strong>
        <p>모든 로컬 데이터를 삭제하고 초기 상태로 되돌립니다.</p>
        <div className="settings-actions settings-actions-start">
          <button type="button" className="reset-button" onClick={() => setConfirmingReset(true)}>
            데이터 초기화
          </button>
        </div>
      </div>
    </div>
    {loaded && <div className="settings-card">
      <h3>공휴일 설정</h3>
      <form onSubmit={save} className="settings-form">
        <label>
          <strong>공공데이터포털 API 서비스 키</strong>
          <span>공휴일 정보를 불러오기 위해 사용하는 서비스 키입니다.</span>
          <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="서비스 키를 입력하세요" autoComplete="off" />
        </label>
        <p>키를 비워 저장하면 공휴일 API 요청을 건너뜁니다.</p>
        <div className="settings-actions">
          <button className="primary">저장</button>
        </div>
      </form>
    </div>}
    {confirmingReset && (
      <Modal title="데이터를 초기화하시겠습니까?" onClose={() => setConfirmingReset(false)}>
        <p className="confirm-message">
          직원, 근무 기록, 앱 설정 등 현재 저장된 로컬 데이터가 삭제되고 초기 상태로 돌아갑니다.
        </p>
        <p className="confirm-warning">이 작업은 되돌릴 수 없습니다.</p>
        <div className="confirm-actions">
          <button type="button" autoFocus onClick={() => setConfirmingReset(false)}>취소</button>
          <button type="button" className="danger" onClick={() => void reset()}>초기화</button>
        </div>
      </Modal>
    )}
    {confirmingRestore && (
      <Modal title="백업 파일을 복원할까요?" onClose={() => setConfirmingRestore(false)}>
        <p className="confirm-message">
          백업 파일을 선택하면 현재 데이터가 해당 시점의 데이터로 바뀝니다. 복원 전 현재 데이터는 자동으로 별도 백업 파일에 저장됩니다.
        </p>
        <p className="confirm-warning">복원 후에는 화면을 새로 불러옵니다.</p>
        <div className="confirm-actions">
          <button type="button" autoFocus onClick={() => setConfirmingRestore(false)}>취소</button>
          <button type="button" className="danger" onClick={() => void restoreBackup()}>백업 파일 선택</button>
        </div>
      </Modal>
    )}
  </section>;
}

function EmployeeView({
  employees,
  onReload,
}: {
  employees: Employee[];
  onReload: () => Promise<void>;
}) {
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      if (id) await api.updateEmployee(id, form);
      else await api.createEmployee(form);
      setForm(null);
      setMessage("직원 정보를 저장했습니다.");
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  async function toggle(item: Employee) {
    try {
      await api.updateEmployee(item.id, {
        name: item.name,
        color: item.color,
        active: !item.active,
      });
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>직원 관리</h2>
          <p>과거 기록 보호를 위해 직원은 삭제하지 않고 비활성화합니다.</p>
        </div>
        <button
          onClick={() => {
            setId(null);
            setForm({
              name: "",
              active: true,
              color: getDefaultEmployeeColor(employees),
            });
          }}
        >
          + 직원 추가
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="employee-grid">
        {employees.map((item) => (
          <article className={item.active ? "" : "muted"} key={item.id}>
            <div>
              <strong>
                <span
                  className="color-dot"
                  style={{ background: item.color }}
                />
                {item.name}
              </strong>
              <small>{item.active ? "근무 가능" : "비활성"}</small>
            </div>
            <div className="actions">
              <button
                onClick={() => {
                  setId(item.id);
                  setForm({
                    name: item.name,
                    active: item.active,
                    color: item.color,
                  });
                }}
              >
                이름 / 색상
              </button>
              <button onClick={() => void toggle(item)}>
                {item.active ? "비활성화" : "활성화"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {form && (
        <Modal
          title={id ? "직원 수정" : "직원 추가"}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save} className="form-grid">
            <label className="full">
              이름
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <div className="full color-field">
              <label htmlFor="employee-color">표시 색상</label>
              <input
                id="employee-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <span className="color-options">
                {EMPLOYEE_COLOR_PRESETS.map(({ name, color }) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`${name} ${color}`}
                    aria-pressed={form.color.toUpperCase() === color}
                    onClick={() => setForm({ ...form, color })}
                  >
                    <span className="color-dot" style={{ background: color }} />
                    {name}
                  </button>
                ))}
              </span>
              <span>선택 색상: {form.color.toUpperCase()}</span>
              <span className="color-preview" style={employeeStyle(form.color)}>
                {form.name || "직원"} 08:00–15:00
              </span>
            </div>
            <label className="check full">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              활성 직원
            </label>
            <div className="form-actions full">
              <span />
              <button type="button" onClick={() => setForm(null)}>
                취소
              </button>
              <button className="primary">저장</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="modal-title">
          <h3>{title}</h3>
          <button aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default App;
