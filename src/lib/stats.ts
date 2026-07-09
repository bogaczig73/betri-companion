import type { Workout } from "@/db/schema";

// Monday-start ISO week containing `now`, as YYYY-MM-DD bounds (inclusive).
export function currentWeekBounds(now = new Date()): {
  start: string;
  end: string;
} {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(monday), end: iso(sunday) };
}

export function thisWeekSeconds(workouts: Workout[], now = new Date()): number {
  const { start, end } = currentWeekBounds(now);
  return workouts.reduce((sum, w) => {
    if (w.date < start || w.date > end) return sum;
    return sum + (w.actualDurationSec ?? w.plannedDurationSec ?? 0);
  }, 0);
}
