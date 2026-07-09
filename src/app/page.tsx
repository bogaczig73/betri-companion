import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Timer,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FitUploadButton } from "@/components/fit-upload-button";
import { WorkoutList } from "@/components/workout-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { formatDuration } from "@/lib/format";
import { thisWeekSeconds } from "@/lib/stats";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center justify-between px-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4.5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

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
          <EmptyState
            icon={Users}
            title="No athletes linked yet"
            description="Athletes appear here once they are linked to you as their coach."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {athletes.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  href={`/athletes/${athlete.id}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-accent"
                >
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                      {initials(athlete.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {athlete.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {athlete.email} · {athlete.timezone}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
  const weekSec = thisWeekSeconds(workouts);

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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Planned"
          value={String(planned.length)}
          icon={CalendarClock}
        />
        <StatTile
          label="Completed"
          value={String(completed.length)}
          icon={CalendarCheck}
        />
        <StatTile
          label="This week"
          value={weekSec > 0 ? formatDuration(weekSec) : "0min"}
          icon={Timer}
        />
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
