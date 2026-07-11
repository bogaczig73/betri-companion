import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LactateTrendCard } from "@/components/athlete/lactate-trend";
import { ThresholdsCard } from "@/components/athlete/thresholds-card";
import { FitUploadButton } from "@/components/fit-upload-button";
import { WorkoutList } from "@/components/workout-list";
import { primaryZoneSeconds, ZoneBar, zoneTooltip } from "@/components/zone-bar";
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
  canAccessAthlete,
  getUserById,
  getWorkoutsForAthlete,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { formatDuration } from "@/lib/format";
import { getLactateTrend } from "@/lib/lactate-data";
import { currentWeekBounds, weekSummary } from "@/lib/stats";
import { getCurrentThresholds, getThresholdHistory } from "@/lib/thresholds";
import { buildTssMap } from "@/lib/tss";

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

  const [allWorkouts, thresholds, thresholdHistory, lactateTrend] =
    await Promise.all([
      getWorkoutsForAthlete(id),
      getCurrentThresholds(id),
      getThresholdHistory(id),
      getLactateTrend(id),
    ]);

  const { start, end } = currentWeekBounds();
  const week = allWorkouts
    .filter((w) => w.date >= start && w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const summary = weekSummary(allWorkouts);
  const tss = buildTssMap(week, thresholdHistory);
  let load = 0;
  let plannedLoad = 0;
  const zoneSeconds: number[] = [];
  for (const w of week) {
    load += tss[w.id]?.actual ?? 0;
    plannedLoad += tss[w.id]?.planned ?? 0;
    const zones = w.timeInZones ? primaryZoneSeconds(w.timeInZones) : null;
    zones?.seconds.forEach((sec, i) => {
      zoneSeconds[i] = (zoneSeconds[i] ?? 0) + sec;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
              {athlete.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {athlete.name}
            </h1>
            <p className="text-muted-foreground">
              {athlete.email} · {athlete.timezone}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/calendar?athlete=${athlete.id}`} />}
          >
            Calendar
          </Button>
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

      <ThresholdsCard athleteId={athlete.id} current={thresholds} />

      <LactateTrendCard trend={lactateTrend} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>This week</CardTitle>
              <CardDescription>
                {summary.completedCount}/{summary.count} sessions done — full
                history lives in the calendar.
              </CardDescription>
            </div>
            <Link
              href={`/calendar?athlete=${athlete.id}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              Open calendar →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Hours
              </p>
              <p className="text-2xl font-semibold">
                {formatDuration(summary.doneSec)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatDuration(summary.plannedSec)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Load
              </p>
              <p className="text-2xl font-semibold">
                {load}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {plannedLoad} planned
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Time in zones
              </p>
              {zoneSeconds.some((s) => s > 0) ? (
                <ZoneBar
                  seconds={zoneSeconds}
                  size="sm"
                  title={zoneTooltip(zoneSeconds)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recorded sessions yet
                </p>
              )}
            </div>
          </div>
          <WorkoutList workouts={week} />
        </CardContent>
      </Card>
    </div>
  );
}
