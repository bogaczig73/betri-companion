import Link from "next/link";

import { FitUploadButton } from "@/components/fit-upload-button";
import { WorkoutList } from "@/components/workout-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAthletesForCoach,
  getCoachesForAthlete,
  getWorkoutsForAthlete,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

async function CoachDashboard({ coachId }: { coachId: string }) {
  const athletes = await getAthletesForCoach(coachId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your athletes</CardTitle>
        <CardDescription>
          Open an athlete to manage their workouts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {athletes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody linked yet.</p>
        ) : (
          <ul className="space-y-2">
            {athletes.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  href={`/athletes/${athlete.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                >
                  <div>
                    <p className="text-sm font-medium">{athlete.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.email} · {athlete.timezone}
                    </p>
                  </div>
                  <Badge variant="secondary">athlete</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function AthleteDashboard({ athleteId }: { athleteId: string }) {
  const [coaches, workouts] = await Promise.all([
    getCoachesForAthlete(athleteId),
    getWorkoutsForAthlete(athleteId),
  ]);
  const planned = workouts.filter((w) => w.status === "planned");
  const completed = workouts.filter((w) => w.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Coach: {coaches.map((c) => c.name).join(", ") || "none"}
        </p>
        <div className="flex items-start gap-2">
          <FitUploadButton athleteId={athleteId} />
          <Button nativeButton={false} render={<Link href="/workouts/new" />}>
            Log workout
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

export default async function DashboardPage() {
  const actingUser = await getActingUser();

  if (!actingUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No users found</CardTitle>
          <CardDescription>
            Run <code>npm run db:seed</code> to create the test coach and
            athletes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hey, {actingUser.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          You are viewing the app as a{" "}
          <span className="font-medium">{actingUser.role}</span>.
        </p>
      </div>
      {actingUser.role === "coach" ? (
        <CoachDashboard coachId={actingUser.id} />
      ) : (
        <AthleteDashboard athleteId={actingUser.id} />
      )}
    </div>
  );
}
