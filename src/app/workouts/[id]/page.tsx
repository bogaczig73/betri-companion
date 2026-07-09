import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { CompleteWorkoutButton } from "@/components/complete-workout-button";
import { AddLactateButton } from "@/components/lactate/add-lactate-button";
import { LactateTestDetail } from "@/components/lactate/lactate-test-detail";
import { SportBadge } from "@/components/sport-badge";
import { WorkoutForm } from "@/components/workout-form";
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

  const [athlete, lactate, analyses, analysisDisabledReason] =
    await Promise.all([
      getUserById(workout.athleteId),
      isLactateSport(workout.sport)
        ? getTestForWorkout(workout.id)
        : Promise.resolve(null),
      getAnalysesForWorkout(workout.id),
      getAnalysisDisabledReason(),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        {workout.status === "planned" && (
          <CompleteWorkoutButton workoutId={workout.id} />
        )}
      </div>
      <div className="mx-auto w-full max-w-2xl">
        <WorkoutForm athleteId={workout.athleteId} workout={workout} />
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
  );
}
