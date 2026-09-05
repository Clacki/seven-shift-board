export function MonthPicker({
  month,
  onMove,
}: {
  month: string;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="month-picker">
      <button onClick={() => onMove(-1)}>← 이전 달</button>
      <strong>{month.replace("-", "년 ")}월</strong>
      <button onClick={() => onMove(1)}>다음 달 →</button>
    </div>
  );
}
