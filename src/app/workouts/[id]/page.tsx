import { notFound, redirect } from "next/navigation";

import { SportBadge } from "@/components/sport-badge";
import { WorkoutForm } from "@/components/workout-form";
import { Badge } from "@/components/ui/badge";
import {
  canAccessAthlete,
  getUserById,
  getWorkoutById,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const workout = await getWorkoutById(id);
  if (!workout) notFound();
  if (!(await canAccessAthlete(actingUser, workout.athleteId))) redirect("/");

  const athlete = await getUserById(workout.athleteId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {workout.title}
          </h1>
          <SportBadge sport={workout.sport} />
          <Badge variant={workout.status === "completed" ? "default" : "outline"}>
            {workout.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {athlete?.name} · {workout.source}
        </p>
      </div>
      <WorkoutForm athleteId={workout.athleteId} workout={workout} />
    </div>
  );
}
