import { StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { DeleteTestButton } from "@/components/lactate/delete-test-button";
import { LactateTestDetail } from "@/components/lactate/lactate-test-detail";
import { SportBadge } from "@/components/sport-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import {
  getAnalysesForTest,
  getAnalysisDisabledReason,
  toAnalysisView,
} from "@/lib/analysis";
import { formatDate } from "@/lib/format";
import { isLactateSport } from "@/lib/lactate";
import { getTestDetail, testBaseline, testSport } from "@/lib/lactate-data";
import type { Sport } from "@/db/schema";

export default async function LactateTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const detail = await getTestDetail(id);
  if (!detail) notFound();
  if (!(await canAccessAthlete(actingUser, detail.test.athleteId))) redirect("/");
  if (!isLactateSport(detail.test.sport)) notFound();

  const { test, athlete, steps } = detail;
  const [analyses, analysisDisabledReason] = await Promise.all([
    getAnalysesForTest(test.id),
    getAnalysisDisabledReason(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/lactate" className="hover:underline">
              ← All tests
            </Link>
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {test.title || `${athlete.name} · lactate test`}
            </h1>
            <SportBadge sport={test.sport as Sport} />
          </div>
          <p className="text-muted-foreground">
            {athlete.name} · {formatDate(test.testDate)}
            {test.workoutId && (
              <>
                {" · "}
                <Link
                  href={`/workouts/${test.workoutId}`}
                  className="hover:underline"
                >
                  from workout →
                </Link>
              </>
            )}
          </p>
        </div>
        <DeleteTestButton testId={test.id} />
      </div>

      {test.notes && (
        <div className="flex gap-2.5 rounded-r-lg border-l-2 border-primary bg-muted/60 p-3 text-sm">
          <StickyNote size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="whitespace-pre-wrap text-foreground/90">{test.notes}</p>
        </div>
      )}

      <LactateTestDetail
        testId={test.id}
        sport={testSport(test)}
        steps={steps}
        baseline={testBaseline(test)}
      />

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
            subject={{ lactateTestId: test.id }}
            initialAnalyses={analyses.map(toAnalysisView)}
            disabledReason={analysisDisabledReason}
          />
        </CardContent>
      </Card>
    </div>
  );
}
