// Pure calendar-grid math shared by the /calendar page and its client
// components. Client-safe: no db imports (see the lactate units gotcha).
// All dates are ISO strings (YYYY-MM-DD) computed in UTC so the grid never
// shifts with the server or browser timezone. Weeks start on Monday,
// matching planned_sessions.day_of_week (0 = Monday).

export type CalendarMonth = {
  year: number;
  month: number; // 1-based
  /** Monday-to-Sunday rows of ISO dates covering the whole month. */
  weeks: string[][];
};

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function monthGrid(year: number, month: number): CalendarMonth {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay: 0 = Sunday; shift so 0 = Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - lead);

  const weeks: string[][] = [];
  const cursor = new Date(start);
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toISO(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getUTCMonth() === month - 1);

  return { year, month, weeks };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-07" ⇄ {year, month}; falls back to the current month when invalid. */
export function parseMonthParam(param?: string): { year: number; month: number } {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function monthParam(year: number, month: number): string {
  return `${year}-${month.toString().padStart(2, "0")}`;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function isoMonthMatches(iso: string, year: number, month: number): boolean {
  return iso.slice(0, 7) === monthParam(year, month);
}
