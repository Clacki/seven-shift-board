export function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function calendarDates(month: string): string[] {
  const [year, value] = month.split("-").map(Number);
  const first = new Date(year, value - 1, 1);
  const count =
    Math.ceil((first.getDay() + new Date(year, value, 0).getDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) =>
    localDate(new Date(year, value - 1, 1 - first.getDay() + index))
  );
}
