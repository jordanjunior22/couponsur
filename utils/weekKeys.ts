// Week helpers shared by the home page and the picks feed API. A "week" is
// Monday-Sunday, keyed by that Monday's date ("YYYY-MM-DD"), computed on the
// UTC calendar date - exactly the convention the home page has always used for
// "today" and for grouping (`match_date.split("T")[0]`), so server and screen
// always agree on which week a pick belongs to.

export function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr.split("T")[0] + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().split("T")[0];
}

export function weekKeyOfDate(date: Date): string {
  return getWeekKey(date.toISOString());
}

/** The moment a week starts (Monday 00:00 UTC). */
export function weekStart(weekKey: string): Date {
  return new Date(weekKey + "T00:00:00Z");
}

export function addWeeks(weekKey: string, weeks: number): string {
  const d = weekStart(weekKey);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}
