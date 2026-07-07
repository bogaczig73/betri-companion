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
