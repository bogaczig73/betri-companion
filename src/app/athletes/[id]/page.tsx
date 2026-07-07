import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FitUploadButton } from "@/components/fit-upload-button";
import { WorkoutList } from "@/components/workout-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canAccessAthlete,
  getUserById,
  getWorkoutsForAthlete,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

export default async function AthleteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");
  if (!(await canAccessAthlete(actingUser, id))) redirect("/");

  const athlete = await getUserById(id);
  if (!athlete || athlete.role !== "athlete") notFound();

  const allWorkouts = await getWorkoutsForAthlete(id);
  const planned = allWorkouts.filter((w) => w.status === "planned");
  const completed = allWorkouts.filter((w) => w.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {athlete.name}
          </h1>
          <p className="text-muted-foreground">
            {athlete.email} · {athlete.timezone}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/chat/${athlete.id}`} />}
          >
            Chat
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/lactate/new?athlete=${athlete.id}`} />}
          >
            Lactate test
          </Button>
          <FitUploadButton athleteId={athlete.id} />
          <Button
            nativeButton={false}
            render={<Link href={`/workouts/new?athlete=${athlete.id}`} />}
          >
            Add workout
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Planned</CardTitle>
            <CardDescription>
              {planned.length} upcoming or unfinished sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkoutList workouts={planned} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
            <CardDescription>
              {completed.length} finished sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkoutList workouts={completed} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
