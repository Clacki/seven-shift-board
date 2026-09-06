import {
  SHIFT_STATUS_LABELS,
  type ShiftDisplayStatus,
} from "../lib/shiftDisplay";

export function ShiftStatusBadges({
  statuses,
  compact = false,
}: {
  statuses: ShiftDisplayStatus[];
  compact?: boolean;
}) {
  if (statuses.length === 0) return null;
  const visible = compact ? statuses.slice(0, 2) : statuses;
  const hiddenCount = statuses.length - visible.length;
  const label = statuses
    .map((status) => SHIFT_STATUS_LABELS[status])
    .join(" · ");
  return (
    <span
      className={"shift-statuses" + (compact ? " shift-statuses-compact" : "")}
      title={label}
      aria-label={label}
    >
      {visible.map((status) => (
        <span
          key={status}
          className={
            "shift-status" +
            (status === "added" || status === "substitute"
              ? " shift-status-emphasis"
              : "")
          }
        >
          {SHIFT_STATUS_LABELS[status]}
        </span>
      ))}
      {hiddenCount > 0 && <span className="shift-status">+{hiddenCount}</span>}
    </span>
  );
}
