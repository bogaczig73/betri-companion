import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  analysisResults,
  type AnalysisResult,
  type LactateStep,
  type LactateTest,
  type User,
  type Workout,
} from "@/db/schema";
import {
  getUserById,
  getWorkoutById,
  getWorkoutsInRange,
} from "@/lib/access";
import { AI_MODEL, isAiConfigured } from "@/lib/ai";
import { addDaysISO } from "@/lib/calendar";
import type { AnalysisView } from "@/lib/citations";
import { formatDateTime, formatDistance, formatDuration, formatPace } from "@/lib/format";
import {
  analyzeLactate,
  isLactateSport,
  milliToMmol,
  sportIntensity,
  type Consensus,
} from "@/lib/lactate";
import {
  getTestDetail,
  getTestForWorkout,
  getTestsForAthletes,
  stepsToInput,
  testBaseline,
  testSport,
} from "@/lib/lactate-data";
import { answerGrounded, getPaperCatalog } from "@/lib/paper-qa";
import { describeStructure } from "@/lib/structure";

// ---------------------------------------------------------------------------
// Phase 7: grounded AI analysis of a workout or a lactate test.
//
// The subject's data is serialized into a plain-text context, the paper
// library is attached via paper-qa's grounded call (catalog triage → PDFs with
// citations), and the full answer is stored as an analysis_results row.
// ---------------------------------------------------------------------------

const ANALYSIS_SYSTEM = `You are a sports-science analyst inside a triathlon coaching app. You are given one athlete's training data and relevant research papers; produce an analysis the coach can act on.

Rules:
- Base every scientific claim on the attached papers so it carries a citation. Reference the athlete's actual numbers and compare them to values from the papers where possible.
- End with one paragraph starting with "**Beyond the papers:**" for practical interpretation the papers don't support — that section is understood to be model inference, so never put uncited claims elsewhere.
- If the papers don't cover an aspect of the data, say so plainly instead of speculating.
- Keep it compact: 3-6 short paragraphs or bullet groups a busy coach can absorb.
- Format with simple Markdown only: short paragraphs, "- " bullet lists, numbered lists, **bold** and \`inline code\`. No tables, no headings, no nested lists, no links.`;

function fmtMmol(milli: number | null): string {
  const v = milliToMmol(milli);
  return v == null ? "—" : `${v.toFixed(2)} mmol/L`;
}

function consensusLine(label: string, c: Consensus | null): string | null {
  if (!c) return null;
  return `- ${label} consensus (median of methods): ${c.valueLabel}, lactate ${c.lactate.toFixed(2)} mmol/L${c.heartRate ? `, HR ${c.heartRate} bpm` : ""}`;
}

// Steps + engine output for a lactate test, shared between the two subjects
// (a standalone test, or field samples attached to a workout).
function describeLactateData(test: LactateTest, steps: LactateStep[]): string {
  const sport = testSport(test);
  const si = sportIntensity(sport);
  const lines: string[] = [];

  if (test.baselineLactate != null) {
    lines.push(
      `Baseline (rest/warm-up): lactate ${fmtMmol(test.baselineLactate)}${test.baselineIntensityValue != null ? ` at ${si.formatValue(test.baselineIntensityValue)}` : ""}${test.includeBaseline ? " (included in the curve fit)" : ""}`,
    );
  }

  lines.push(`Recorded steps (${si.valueLabel.toLowerCase()} · heart rate · lactate):`);
  for (const s of steps) {
    lines.push(
      `- stage ${s.stageNumber}: ${s.intensityValue != null ? si.formatValue(s.intensityValue) : "—"}, HR ${s.heartRate ?? "—"}, lactate ${fmtMmol(s.lactate)}`,
    );
  }

  const analysis = analyzeLactate(sport, stepsToInput(steps), testBaseline(test));
  if (analysis.results.length > 0) {
    lines.push("");
    lines.push(
      "Threshold estimates from the app's engine (multiple methods — they disagree by design):",
    );
    for (const r of analysis.results) {
      lines.push(
        `- ${r.method} (${r.estimates}, ${r.fitting}): ${r.valueLabel}, lactate ${r.lactate.toFixed(2)} mmol/L${r.heartRate ? `, HR ${r.heartRate} bpm` : ""}`,
      );
    }
    const lt1 = consensusLine("LT1", analysis.lt1);
    const lt2 = consensusLine("LT2", analysis.lt2);
    if (lt1) lines.push(lt1);
    if (lt2) lines.push(lt2);
  }
  for (const w of analysis.warnings) lines.push(`Engine warning: ${w}`);

  return lines.join("\n");
}

function describeWorkout(workout: Workout, athlete: User): string {
  const lines: string[] = [];
  lines.push(`Athlete: ${athlete.name}`);
  lines.push(`Sport: ${workout.sport}`);
  lines.push(`Date: ${workout.date} (status: ${workout.status})`);
  lines.push(`Title: ${workout.title}`);
  if (workout.description) lines.push(`Prescription notes: ${workout.description}`);
  if (workout.plannedDurationSec) {
    lines.push(`Planned duration: ${formatDuration(workout.plannedDurationSec)}`);
  }
  if (workout.plannedDistanceM) {
    lines.push(
      `Planned distance: ${formatDistance(workout.plannedDistanceM, workout.sport)}`,
    );
  }
  if (workout.structure) {
    lines.push(
      `Structured prescription (targets are % of the athlete's threshold):\n${describeStructure(workout.structure)}`,
    );
  }

  const actuals: string[] = [];
  if (workout.actualDurationSec) {
    actuals.push(`duration ${formatDuration(workout.actualDurationSec)}`);
  }
  if (workout.actualDistanceM) {
    actuals.push(`distance ${formatDistance(workout.actualDistanceM, workout.sport)}`);
  }
  if (workout.actualDurationSec && workout.actualDistanceM) {
    const pace = formatPace(
      workout.actualDurationSec,
      workout.actualDistanceM,
      workout.sport,
    );
    if (pace) actuals.push(`average ${pace}`);
  }
  if (workout.avgHr) actuals.push(`avg HR ${workout.avgHr} bpm`);
  if (workout.maxHr) actuals.push(`max HR ${workout.maxHr} bpm`);
  if (workout.avgPowerW) actuals.push(`avg power ${workout.avgPowerW} W`);
  if (workout.rpe) actuals.push(`RPE ${workout.rpe}/10`);
  if (workout.load) actuals.push(`training load ${workout.load}`);
  if (actuals.length > 0) lines.push(`Recorded actuals: ${actuals.join(", ")}`);
  if (workout.notes) lines.push(`Post-workout notes: ${workout.notes}`);

  return lines.join("\n");
}

// The athlete's other sessions in the 3 weeks up to the workout, so the
// analysis can consider load context rather than the session in isolation.
async function describeRecentTraining(
  athleteId: string,
  uptoDate: string,
  excludeWorkoutId: string,
): Promise<string | null> {
  const rows = await getWorkoutsInRange(
    athleteId,
    addDaysISO(uptoDate, -21),
    uptoDate,
  );
  const lines = rows
    .filter((w) => w.id !== excludeWorkoutId)
    .map((w) => {
      const bits: string[] = [w.status];
      const dur = w.actualDurationSec ?? w.plannedDurationSec;
      if (dur) bits.push(formatDuration(dur));
      if (w.load) bits.push(`load ${w.load}`);
      return `- ${w.date} ${w.sport} "${w.title}" (${bits.join(", ")})`;
    });
  return lines.length > 0 ? lines.join("\n") : null;
}

// LT1/LT2 consensus from the athlete's most recent analyzable lactate test in
// this sport — anchors intensity interpretation. Checks the newest few tests
// only; skips ones without computable thresholds.
async function describeCurrentThresholds(
  athleteId: string,
  sport: Workout["sport"],
  excludeTestId?: string,
): Promise<string | null> {
  if (!isLactateSport(sport)) return null;
  const tests = (await getTestsForAthletes([athleteId]))
    .filter((t) => t.sport === sport && t.id !== excludeTestId)
    .slice(0, 3);
  for (const t of tests) {
    const detail = await getTestDetail(t.id);
    if (!detail) continue;
    const analysis = analyzeLactate(
      testSport(detail.test),
      stepsToInput(detail.steps),
      testBaseline(detail.test),
    );
    const lt1 = consensusLine("LT1", analysis.lt1);
    const lt2 = consensusLine("LT2", analysis.lt2);
    if (!lt1 && !lt2) continue;
    return [
      `From the athlete's most recent lactate test in this sport (${detail.test.testDate}):`,
      ...(lt1 ? [lt1] : []),
      ...(lt2 ? [lt2] : []),
    ].join("\n");
  }
  return null;
}

async function storeAnalysis(fields: {
  subjectType: "workout" | "lactate_test";
  workoutId?: string;
  lactateTestId?: string;
  athleteId: string;
  requestedById: string;
  retrievalQuery: string;
  prompt: string;
}): Promise<AnalysisResult> {
  const content = await answerGrounded({
    retrievalQuery: fields.retrievalQuery,
    system: ANALYSIS_SYSTEM,
    prompt: fields.prompt,
  });
  const [row] = await db
    .insert(analysisResults)
    .values({
      subjectType: fields.subjectType,
      workoutId: fields.workoutId,
      lactateTestId: fields.lactateTestId,
      athleteId: fields.athleteId,
      requestedById: fields.requestedById,
      model: AI_MODEL,
      content,
    })
    .returning();
  return row;
}

export async function runWorkoutAnalysis(
  workoutId: string,
  requestedById: string,
): Promise<AnalysisResult> {
  const workout = await getWorkoutById(workoutId);
  if (!workout) throw new Error("Workout not found");
  const athlete = await getUserById(workout.athleteId);
  if (!athlete) throw new Error("Athlete not found");

  const [fieldTest, thresholds, history] = await Promise.all([
    isLactateSport(workout.sport)
      ? getTestForWorkout(workout.id)
      : Promise.resolve(null),
    describeCurrentThresholds(workout.athleteId, workout.sport),
    describeRecentTraining(workout.athleteId, workout.date, workout.id),
  ]);

  const sections: string[] = [`<workout>\n${describeWorkout(workout, athlete)}\n</workout>`];
  if (fieldTest && fieldTest.steps.length > 0) {
    sections.push(
      `<lactate_samples>\nLactate samples taken during this session:\n${describeLactateData(fieldTest.test, fieldTest.steps)}\n</lactate_samples>`,
    );
  }
  if (thresholds) sections.push(`<thresholds>\n${thresholds}\n</thresholds>`);
  if (history) {
    sections.push(
      `<recent_training>\nOther sessions in the 3 weeks up to this workout:\n${history}\n</recent_training>`,
    );
  }
  sections.push(
    `Analyze this ${workout.sport} session: how the execution compares to the prescription, what the physiological signals suggest, and what the coach should consider next.`,
  );

  return storeAnalysis({
    subjectType: "workout",
    workoutId: workout.id,
    athleteId: workout.athleteId,
    requestedById,
    retrievalQuery: `${workout.sport} training session analysis: ${workout.title}. ${workout.description ?? ""} Training intensity, physiological adaptations, load and recovery.`,
    prompt: sections.join("\n\n"),
  });
}

export async function runLactateTestAnalysis(
  testId: string,
  requestedById: string,
): Promise<AnalysisResult> {
  const detail = await getTestDetail(testId);
  if (!detail) throw new Error("Lactate test not found");
  const { test, athlete, steps } = detail;

  const header = [
    `Athlete: ${athlete.name}`,
    `Sport: ${test.sport}`,
    `Test date: ${test.testDate}`,
    ...(test.title ? [`Title: ${test.title}`] : []),
    ...(test.notes ? [`Notes: ${test.notes}`] : []),
  ].join("\n");

  const prompt = [
    `<lactate_test>\n${header}\n\n${describeLactateData(test, steps)}\n</lactate_test>`,
    "Interpret this incremental lactate test: quality of the protocol and curve, where the methods agree or diverge and which estimates deserve trust here, what LT1/LT2 the coach should adopt, and what that implies for the athlete's training intensities.",
  ].join("\n\n");

  return storeAnalysis({
    subjectType: "lactate_test",
    lactateTestId: test.id,
    athleteId: test.athleteId,
    requestedById,
    retrievalQuery: `Incremental lactate threshold test interpretation (${test.sport}): LT1, LT2, OBLA, Dmax, log-log methods; setting training intensities from lactate thresholds.`,
    prompt,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getAnalysisById(
  id: string,
): Promise<AnalysisResult | null> {
  const [row] = await db
    .select()
    .from(analysisResults)
    .where(and(eq(analysisResults.id, id), isNull(analysisResults.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getAnalysesForWorkout(
  workoutId: string,
): Promise<AnalysisResult[]> {
  return db
    .select()
    .from(analysisResults)
    .where(
      and(
        eq(analysisResults.workoutId, workoutId),
        isNull(analysisResults.deletedAt),
      ),
    )
    .orderBy(desc(analysisResults.createdAt));
}

export async function getAnalysesForTest(
  testId: string,
): Promise<AnalysisResult[]> {
  return db
    .select()
    .from(analysisResults)
    .where(
      and(
        eq(analysisResults.lactateTestId, testId),
        isNull(analysisResults.deletedAt),
      ),
    )
    .orderBy(desc(analysisResults.createdAt));
}

export async function removeAnalysis(id: string): Promise<void> {
  await db
    .update(analysisResults)
    .set({ deletedAt: new Date() })
    .where(eq(analysisResults.id, id));
}

// Why the run button would be disabled right now, or null if it can run.
// Rendered next to the button so the fix (env var / uploads) is obvious.
export async function getAnalysisDisabledReason(): Promise<string | null> {
  if (!isAiConfigured()) return "ANTHROPIC_API_KEY is not configured";
  const catalog = await getPaperCatalog();
  if (catalog.length === 0) {
    return "Upload papers to the library first — analysis is grounded in them";
  }
  return null;
}

// Client-facing shape (dates preformatted; content is already plain JSON).
export function toAnalysisView(row: AnalysisResult): AnalysisView {
  return {
    id: row.id,
    model: row.model,
    createdAt: formatDateTime(row.createdAt),
    content: row.content,
  };
}
