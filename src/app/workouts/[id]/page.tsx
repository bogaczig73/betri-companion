import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { CompleteWorkoutButton } from "@/components/complete-workout-button";
import { AddLactateButton } from "@/components/lactate/add-lactate-button";
import { LactateTestDetail } from "@/components/lactate/lactate-test-detail";
import { SaveTemplateButton } from "@/components/save-template-button";
import { SportBadge } from "@/components/sport-badge";
import { WorkoutForm } from "@/components/workout-form";
import { ZoneBreakdown } from "@/components/zone-bar";
import { Badge } from "@/components/ui/badge";
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
  getWorkoutById,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import {
  getAnalysesForWorkout,
  getAnalysisDisabledReason,
  toAnalysisView,
} from "@/lib/analysis";
import { isLactateSport } from "@/lib/lactate";
import { getTestForWorkout, testBaseline, testSport } from "@/lib/lactate-data";
import { getThresholdsForDate } from "@/lib/thresholds";

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

  const [athlete, lactate, analyses, analysisDisabledReason, thresholds] =
    await Promise.all([
      getUserById(workout.athleteId),
      isLactateSport(workout.sport)
        ? getTestForWorkout(workout.id)
        : Promise.resolve(null),
      getAnalysesForWorkout(workout.id),
      getAnalysisDisabledReason(),
      getThresholdsForDate(workout.athleteId, workout.date),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap gap-2">
          <SaveTemplateButton workoutId={workout.id} />
          {workout.status === "planned" && (
            <CompleteWorkoutButton workoutId={workout.id} />
          )}
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <WorkoutForm
            athleteId={workout.athleteId}
            workout={workout}
            thresholds={thresholds}
          />
        </div>

        <div className="space-y-6 xl:col-span-2">
          {workout.timeInZones && (
            <Card>
              <CardHeader>
                <CardTitle>Time in zones</CardTitle>
                <CardDescription>
                  {workout.timeInZones.source === "tp_csv"
                    ? "Imported from TrainingPeaks"
                    : "From the recorded activity, using the athlete's zones on this date"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                {workout.timeInZones.hr && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Heart rate
                    </p>
                    <ZoneBreakdown seconds={workout.timeInZones.hr} />
                  </div>
                )}
                {workout.timeInZones.power && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Power
                    </p>
                    <ZoneBreakdown seconds={workout.timeInZones.power} />
                  </div>
                )}
                {workout.timeInZones.pace && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pace
                    </p>
                    <ZoneBreakdown seconds={workout.timeInZones.pace} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>AI analysis</CardTitle>
              <CardDescription>
                Grounded in the science paper library: every [n] cites a paper
                passage; uncited interpretation is marked as model inference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalysisPanel
                subject={{ workoutId: workout.id }}
                initialAnalyses={analyses.map(toAnalysisView)}
                disabledReason={analysisDisabledReason}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {isLactateSport(workout.sport) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Lactate</CardTitle>
                <CardDescription>
                  {lactate
                    ? "Samples taken during this session, analyzed with the same methods as a full step test."
                    : "Took lactate samples during this session? Enter them here to analyze thresholds."}
                </CardDescription>
              </div>
              {lactate && (
                <Link
                  href={`/lactate/${lactate.test.id}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Open as test →
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {lactate ? (
              <LactateTestDetail
                testId={lactate.test.id}
                sport={testSport(lactate.test)}
                steps={lactate.steps}
                baseline={testBaseline(lactate.test)}
              />
            ) : (
              <AddLactateButton workoutId={workout.id} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
