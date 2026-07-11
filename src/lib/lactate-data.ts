import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  lactateSteps,
  lactateTests,
  users,
  type LactateStep,
  type LactateTest,
  type User,
} from "@/db/schema";
import {
  analyzeLactate,
  milliToMmol,
  type LactateSport,
  type StepInput,
  type LactateBaseline,
} from "@/lib/lactate";

export type TestListItem = LactateTest & {
  athleteName: string;
  stepCount: number;
};

export async function getTestsForAthletes(
  athleteIds: string[],
): Promise<TestListItem[]> {
  if (athleteIds.length === 0) return [];
  const tests = await db
    .select({ test: lactateTests, athleteName: users.name })
    .from(lactateTests)
    .innerJoin(users, eq(users.id, lactateTests.athleteId))
    .where(
      and(
        inArray(lactateTests.athleteId, athleteIds),
        isNull(lactateTests.deletedAt),
      ),
    )
    .orderBy(desc(lactateTests.testDate), desc(lactateTests.createdAt));
  if (tests.length === 0) return [];

  const counts = await db
    .select({ testId: lactateSteps.testId })
    .from(lactateSteps)
    .where(
      and(
        inArray(
          lactateSteps.testId,
          tests.map((t) => t.test.id),
        ),
        isNull(lactateSteps.deletedAt),
      ),
    );
  const countByTest = new Map<string, number>();
  for (const { testId } of counts) {
    countByTest.set(testId, (countByTest.get(testId) ?? 0) + 1);
  }

  return tests.map(({ test, athleteName }) => ({
    ...test,
    athleteName,
    stepCount: countByTest.get(test.id) ?? 0,
  }));
}

// The lactate test attached to a workout (field samples), with its steps.
export async function getTestForWorkout(
  workoutId: string,
): Promise<{ test: LactateTest; steps: LactateStep[] } | null> {
  const [test] = await db
    .select()
    .from(lactateTests)
    .where(
      and(
        eq(lactateTests.workoutId, workoutId),
        isNull(lactateTests.deletedAt),
      ),
    )
    .limit(1);
  if (!test) return null;
  const steps = await db
    .select()
    .from(lactateSteps)
    .where(
      and(eq(lactateSteps.testId, test.id), isNull(lactateSteps.deletedAt)),
    )
    .orderBy(asc(lactateSteps.stageNumber));
  return { test, steps };
}

export type TestDetail = {
  test: LactateTest;
  athlete: User;
  steps: LactateStep[];
};

export async function getTestDetail(testId: string): Promise<TestDetail | null> {
  const [test] = await db
    .select()
    .from(lactateTests)
    .where(and(eq(lactateTests.id, testId), isNull(lactateTests.deletedAt)))
    .limit(1);
  if (!test) return null;

  const [athlete] = await db
    .select()
    .from(users)
    .where(eq(users.id, test.athleteId))
    .limit(1);

  const steps = await db
    .select()
    .from(lactateSteps)
    .where(and(eq(lactateSteps.testId, testId), isNull(lactateSteps.deletedAt)))
    .orderBy(asc(lactateSteps.stageNumber));

  return { test, athlete, steps };
}

// Convert stored rows into the engine's sport-native input shape.
export function stepsToInput(steps: LactateStep[]): StepInput[] {
  return steps.map((s) => ({
    value: s.intensityValue,
    lactate: milliToMmol(s.lactate),
    heartRate: s.heartRate,
  }));
}

export function testBaseline(test: LactateTest): LactateBaseline {
  return {
    value: test.baselineIntensityValue,
    lactate: milliToMmol(test.baselineLactate),
    includeBaseline: test.includeBaseline,
  };
}

export const testSport = (test: LactateTest) => test.sport as LactateSport;

// ---------------------------------------------------------------------------
// Threshold development over time (athlete card)
// ---------------------------------------------------------------------------

export type LactateTrendPoint = {
  testId: string;
  date: string;
  /** Engine intensity (ascending = better) for charting. */
  lt1Intensity: number | null;
  lt2Intensity: number | null;
  /** Native display labels, e.g. "245 W" / "4:12/km". */
  lt1Label: string | null;
  lt2Label: string | null;
  lt2HeartRate: number | null;
};

export type LactateTrend = Partial<Record<LactateSport, LactateTrendPoint[]>>;

// Consensus LT1/LT2 for every test of an athlete, grouped per sport and
// ordered by date — recomputed from stored steps like everywhere else.
export async function getLactateTrend(athleteId: string): Promise<LactateTrend> {
  const tests = await db
    .select()
    .from(lactateTests)
    .where(
      and(
        eq(lactateTests.athleteId, athleteId),
        isNull(lactateTests.deletedAt),
      ),
    )
    .orderBy(asc(lactateTests.testDate), asc(lactateTests.createdAt));
  if (tests.length === 0) return {};

  const steps = await db
    .select()
    .from(lactateSteps)
    .where(
      and(
        inArray(
          lactateSteps.testId,
          tests.map((t) => t.id),
        ),
        isNull(lactateSteps.deletedAt),
      ),
    )
    .orderBy(asc(lactateSteps.stageNumber));
  const stepsByTest = new Map<string, LactateStep[]>();
  for (const step of steps) {
    const list = stepsByTest.get(step.testId) ?? [];
    list.push(step);
    stepsByTest.set(step.testId, list);
  }

  const trend: LactateTrend = {};
  for (const test of tests) {
    const sport = testSport(test);
    const analysis = analyzeLactate(
      sport,
      stepsToInput(stepsByTest.get(test.id) ?? []),
      testBaseline(test),
    );
    if (!analysis.lt1 && !analysis.lt2) continue;
    const point: LactateTrendPoint = {
      testId: test.id,
      date: test.testDate,
      lt1Intensity: analysis.lt1?.intensity ?? null,
      lt2Intensity: analysis.lt2?.intensity ?? null,
      lt1Label: analysis.lt1?.valueLabel ?? null,
      lt2Label: analysis.lt2?.valueLabel ?? null,
      lt2HeartRate: analysis.lt2?.heartRate ?? null,
    };
    (trend[sport] ??= []).push(point);
  }
  return trend;
}
