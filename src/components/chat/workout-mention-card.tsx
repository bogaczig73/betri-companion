import Link from "next/link";

import { SportBadge } from "@/components/sport-badge";
import { Badge } from "@/components/ui/badge";
import { metricsSummary } from "@/components/workout-list";
import type { Workout } from "@/db/schema";
import { formatDate } from "@/lib/format";

// Rich inline card for a workout @-mentioned in a chat message. Links through
// to the workout detail page.
export function WorkoutMentionCard({ workout }: { workout: Workout }) {
  const summary = metricsSummary(workout);
  return (
    <Link
      href={`/workouts/${workout.id}`}
      className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SportBadge sport={workout.sport} />
          <p className="truncate text-sm font-medium">{workout.title}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(workout.date)}
          {summary && <> · {summary}</>}
        </p>
      </div>
      <Badge variant={workout.status === "completed" ? "default" : "outline"}>
        {workout.status}
      </Badge>
    </Link>
  );
}
