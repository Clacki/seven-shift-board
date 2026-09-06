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
import { getShiftDisplayStatuses } from "./lib/shiftDisplay";
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
  useEffect(() => { void api.getMyEmployeeId().then(setMyEmployeeId).catch(() => undefined); }, []);

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
    if (!confirm("모든 데이터를 초기 상태로 되돌리시겠습니까?")) return;
    if (!confirm("이 작업은 되돌릴 수 없습니다. 정말 초기화하시겠습니까?")) return;
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
          <button className="reset-button" onClick={() => void resetData()}>
            데이터 초기화
          </button>
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
              myEmployeeId={myEmployeeId}
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
          {tab === "settings" && <SettingsView employees={employees} myEmployeeId={myEmployeeId} onMyEmployeeChange={setMyEmployeeId} />}
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
}: {
  month: string;
  templates: ShiftTemplate[];
  holidays: Holiday[];
  items: ScheduleItem[];
  employees: Employee[];
  onMove: (delta: number) => void;
  onReload: () => Promise<void>;
  myEmployeeId: number | null;
}) {
  const [editing, setEditing] = useState<ShiftInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
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
        shiftType: "substitute",
        memo: "",
      });
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      await api.saveShift(editing, editingId);
      const original = items.find((item) => item.shiftId === editingId);
      if (original && original.endTime !== editing.endTime) {
        const delta = toMinutes(editing.endTime) - toMinutes(original.endTime);
        const cascade = actualCascade(original, items, templates);
        if (cascade.length && confirm(`다음 근무자 시작 시간도 ${Math.abs(delta) / 60}시간 ${delta > 0 ? "늦출" : "앞당길"}까요?`)) {
          for (const item of cascade) {
            await api.saveShift(
              { ...item, startTime: moveTime(item.startTime, delta, false), endTime: moveTime(item.endTime, delta, true) },
              item.shiftId
            );
          }
        }
      }
      setEditing(null);
      setMessage("실제 근무 기록을 저장했습니다.");
      await onReload();
    } catch (error) {
      setMessage(errorText(error));
    }
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
      <label className="check calendar-filter"><input type="checkbox" checked={onlyMine} onChange={(event) => { if (event.target.checked && myEmployeeId === null) { setMessage("설정에서 내 직원을 먼저 선택해주세요."); return; } setOnlyMine(event.target.checked); }} />내 근무만 보기</label>
      {message && <p className="notice">{message}</p>}
      <MonthCalendar
        holidays={holidays}
        templates={templates}
        month={month}
        items={onlyMine && myEmployeeId !== null ? items.filter((item) => item.employeeId === myEmployeeId) : items}
        employees={employees}
        onEdit={edit}
      />
      {editing && (
        <Modal
          title={editing.templateId ? "실제 근무 수정" : "추가 근무 등록"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="form-grid">
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
            <label>
              근무 구분
              <select
                value={editing.shiftType}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    shiftType: e.target.value as ShiftInput["shiftType"],
                  })
                }
              >
                <option value="regular">정규</option>
                <option value="substitute">대타</option>
              </select>
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
    </section>
  );
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
function moveTime(value: string, delta: number, end: boolean) {
  const total = toMinutes(value) + delta;
  const normalized = ((total % 1440) + 1440) % 1440;
  return end && normalized === 0 && total > 0 ? "24:00" : `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
function actualCascade(first: ScheduleItem, items: ScheduleItem[], templates: ShiftTemplate[]) {
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const result: ScheduleItem[] = [];
  let current = first;
  while (true) {
    const next = items.find((item) => item.workDate === current.workDate && item.shiftId !== null && item.templateId !== null && item.startTime === current.endTime && getShiftDisplayStatuses(item, templatesById.get(item.templateId)).length === 0);
    if (!next || result.some((item) => item.shiftId === next.shiftId)) break;
    result.push(next);
    current = next;
  }
  return result;
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

function SettingsView({ employees, myEmployeeId, onMyEmployeeChange }: { employees: Employee[]; myEmployeeId: number | null; onMyEmployeeChange: (id: number | null) => void }) {
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
  async function saveMyEmployee(value: string) {
    const employeeId = value ? Number(value) : null;
    try { await api.setMyEmployeeId(employeeId); onMyEmployeeChange(employeeId); setMessage("내 직원 설정을 저장했습니다."); }
    catch (error) { setMessage(errorText(error)); }
  }
  return <section>
    <div className="section-heading"><div><h2>설정</h2><p>공휴일 표시에 사용할 공공데이터포털 서비스 키를 이 PC의 로컬 SQLite에 저장합니다.</p></div></div>
    {message && <p className="notice">{message}</p>}
    {loaded && <form onSubmit={save} className="settings-form">
      <label>내 직원
        <select value={myEmployeeId ?? ""} onChange={(event) => void saveMyEmployee(event.target.value)}>
          <option value="">선택 안 함</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.active ? "" : " (비활성)"}</option>)}
        </select>
      </label>
      <label>공휴일 API 서비스 키
        <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="서비스 키를 입력하세요" autoComplete="off" />
      </label>
      <p>키를 비워 저장하면 공휴일 API 요청은 건너뛰며, 기존 캐시가 있으면 계속 표시됩니다.</p>
      <button className="primary">저장</button>
    </form>}
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
      <div className="modal" role="dialog" aria-modal="true">
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
