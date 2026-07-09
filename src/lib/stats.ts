import type { Workout } from "@/db/schema";

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Monday-start ISO week containing `now`, as YYYY-MM-DD bounds (inclusive).
export function currentWeekBounds(now = new Date()): {
  start: string;
  end: string;
} {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}

export function thisWeekSeconds(workouts: Workout[], now = new Date()): number {
  const { start, end } = currentWeekBounds(now);
  return workouts.reduce((sum, w) => {
    if (w.date < start || w.date > end) return sum;
    return sum + (w.actualDurationSec ?? w.plannedDurationSec ?? 0);
  }, 0);
}

export function weekSummary(workouts: Workout[], now = new Date()) {
  const { start, end } = currentWeekBounds(now);
  const week = workouts.filter((w) => w.date >= start && w.date <= end);
  const plannedSec = week.reduce(
    (sum, w) => sum + (w.plannedDurationSec ?? w.actualDurationSec ?? 0),
    0,
  );
  const doneSec = week.reduce(
    (sum, w) =>
      w.status === "completed"
        ? sum + (w.actualDurationSec ?? w.plannedDurationSec ?? 0)
        : sum,
    0,
  );
  return {
    count: week.length,
    completedCount: week.filter((w) => w.status === "completed").length,
    plannedSec,
    doneSec,
  };
}

// Planned sessions whose date has passed without being completed.
export function missedWorkouts(workouts: Workout[], todayIso: string) {
  return workouts
    .filter((w) => w.status === "planned" && w.date < todayIso)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
