import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessAthlete, getWorkoutById } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { isAiConfigured } from "@/lib/ai";
import {
  runLactateTestAnalysis,
  runWorkoutAnalysis,
  toAnalysisView,
} from "@/lib/analysis";
import { getTestDetail } from "@/lib/lactate-data";

// Two model calls (triage + grounded analysis over full PDFs) — allow time.
export const maxDuration = 300;

// Exactly one subject id.
const bodySchema = z
  .object({
    workoutId: z.uuid().optional(),
    lactateTestId: z.uuid().optional(),
  })
  .refine((b) => Boolean(b.workoutId) !== Boolean(b.lactateTestId), {
    message: "Pass exactly one of workoutId or lactateTestId",
  });

export async function POST(request: Request) {
  const actingUser = await getActingUser();
  if (!actingUser) {
    return NextResponse.json({ error: "No acting user" }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { workoutId, lactateTestId } = parsed.data;

  // Resolve the subject's athlete for the access check before doing any work.
  const athleteId = workoutId
    ? (await getWorkoutById(workoutId))?.athleteId
    : (await getTestDetail(lactateTestId!))?.test.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessAthlete(actingUser, athleteId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const row = workoutId
      ? await runWorkoutAnalysis(workoutId, actingUser.id)
      : await runLactateTestAnalysis(lactateTestId!, actingUser.id);
    return NextResponse.json({ analysis: toAnalysisView(row) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
