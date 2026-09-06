const HOURS = Array.from({ length: 25 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

/** Locale-independent time picker. `24:00` is available only as an end-of-day value. */
export function TimeInput({
  value,
  onChange,
  allowEndOfDay = false,
}: {
  value: string;
  onChange: (value: string) => void;
  allowEndOfDay?: boolean;
}) {
  const [hour = "00", minute = "00"] = value.split(":");
  const hours = allowEndOfDay ? HOURS : HOURS.slice(0, -1);
  const setHour = (nextHour: string) =>
    onChange(`${nextHour}:${nextHour === "24" ? "00" : minute}`);
  return (
    <span className="time-input" aria-label="24시간제 시간 입력">
      <select aria-label="시" value={hour} onChange={(event) => setHour(event.target.value)}>
        {hours.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label="분"
        value={minute}
        disabled={hour === "24"}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
      >
        {MINUTES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </span>
  );
}
