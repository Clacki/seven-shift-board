import type { CSSProperties } from "react";
import palette from "./employeePalette.json" with { type: "json" };
import type { Employee } from "../types";

export const EMPLOYEE_COLOR_PRESETS = palette;
export const EMPLOYEE_COLORS = palette.map(({ color }) => color);

/** Prefer unused colors among active employees; reuse the least used only when exhausted. */
export function getDefaultEmployeeColor(
  employees: Pick<Employee, "active" | "color">[]
): string {
  const counts = new Map<string, number>();
  for (const employee of employees) {
    if (!employee.active) continue;
    const color = employee.color.toUpperCase();
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return EMPLOYEE_COLORS.reduce((best, color) =>
    (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best
  );
}

export function employeeStyle(color: string): CSSProperties {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : EMPLOYEE_COLORS[0];
  const mix = (weight: number) =>
    "rgb(" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          255 * (1 - weight) +
            parseInt(safe.slice(offset, offset + 2), 16) * weight
        )
      )
      .join(",") +
    ")";
  return {
    "--employee-bg": mix(0.28),
    "--employee-hover": mix(0.38),
    "--employee-border": safe,
  } as CSSProperties;
}
