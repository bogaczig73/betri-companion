import Link from "next/link";

import { SportBadge } from "@/components/sport-badge";
import { Badge } from "@/components/ui/badge";
import type { Workout } from "@/db/schema";
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/format";

function metricsSummary(w: Workout): string {
  const parts: string[] = [];
  const duration = w.status === "completed" ? w.actualDurationSec : w.plannedDurationSec;
  const distance = w.status === "completed" ? w.actualDistanceM : w.plannedDistanceM;
  if (duration) parts.push(formatDuration(duration));
  if (distance) parts.push(formatDistance(distance, w.sport));
  if (duration && distance) {
    const pace = formatPace(duration, distance, w.sport);
    if (pace) parts.push(pace);
  }
  if (w.status === "completed") {
    if (w.avgHr) parts.push(`${w.avgHr} bpm`);
    if (w.avgPowerW) parts.push(`${w.avgPowerW} W`);
    if (w.rpe) parts.push(`RPE ${w.rpe}`);
  }
  return parts.join(" · ");
}

export function WorkoutList({ workouts }: { workouts: Workout[] }) {
  if (workouts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No workouts yet.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {workouts.map((w) => (
        <li key={w.id}>
          <Link
            href={`/workouts/${w.id}`}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SportBadge sport={w.sport} />
                <p className="truncate text-sm font-medium">{w.title}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(w.date)}
                {metricsSummary(w) && <> · {metricsSummary(w)}</>}
              </p>
            </div>
            <Badge variant={w.status === "completed" ? "default" : "outline"}>
              {w.status}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
