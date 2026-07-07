import { createHash } from "node:crypto";

import { Decoder, Stream } from "@garmin/fitsdk";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { rawActivities, workouts, type Sport } from "@/db/schema";
import { SPORTS } from "@/lib/sports";

// FIT sport → our sport enum. Anything unmapped is stored as a raw activity
// but not normalized into a workout.
const SPORT_MAP: Record<string, Sport> = {
  running: "run",
  cycling: "bike",
  eBiking: "bike",
  swimming: "swim",
  training: "strength",
  fitnessEquipment: "strength",
};

// Shape of the FIT session message fields we consume (SDK returns camelCase
// with types converted to strings/Dates).
type FitSession = {
  sport?: string;
  subSport?: string;
  startTime?: Date;
  totalTimerTime?: number; // seconds
  totalElapsedTime?: number; // seconds
  totalDistance?: number; // meters
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  trainingStressScore?: number;
};

export type FitImportResult = {
  fileName: string;
  status: "imported" | "duplicate" | "error";
  message: string;
  workouts: { id: string; reconciled: boolean }[];
};

function sessionTitle(sport: Sport, session: FitSession): string {
  const label = SPORTS[sport].label;
  if (session.totalDistance && sport !== "strength") {
    const km = session.totalDistance / 1000;
    return `${label} ${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  const duration = session.totalTimerTime ?? session.totalElapsedTime;
  return duration ? `${label} ${Math.round(duration / 60)}min` : label;
}

export async function processFitFile(input: {
  bytes: ArrayBuffer;
  fileName: string;
  athleteId: string;
  uploadedById: string;
}): Promise<FitImportResult> {
  const { bytes, fileName, athleteId, uploadedById } = input;
  const base: Omit<FitImportResult, "status" | "message"> = {
    fileName,
    workouts: [],
  };

  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");

  const existing = await db
    .select({ id: rawActivities.id })
    .from(rawActivities)
    .where(
      and(
        eq(rawActivities.athleteId, athleteId),
        eq(rawActivities.provider, "fit_upload"),
        eq(rawActivities.externalId, hash),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { ...base, status: "duplicate", message: "Already imported" };
  }

  const stream = Stream.fromArrayBuffer(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) {
    return { ...base, status: "error", message: "Not a FIT file" };
  }
  const { messages, errors } = decoder.read();
  const sessions = (messages.sessionMesgs ?? []) as FitSession[];
  if (sessions.length === 0) {
    return {
      ...base,
      status: "error",
      message:
        errors.length > 0
          ? `Could not decode: ${String(errors[0])}`
          : "No session data in file",
    };
  }

  // Keep summary-level messages for reprocessing; drop per-second records to
  // stay lean until we need streams (they can be re-read from the file if we
  // later persist originals to Blob storage).
  const [rawActivity] = await db
    .insert(rawActivities)
    .values({
      athleteId,
      uploadedById,
      provider: "fit_upload",
      externalId: hash,
      fileName,
      payload: JSON.parse(
        JSON.stringify({
          fileIdMesgs: messages.fileIdMesgs ?? [],
          sessionMesgs: messages.sessionMesgs ?? [],
          lapMesgs: messages.lapMesgs ?? [],
        }),
      ),
    })
    .returning();

  const created: { id: string; reconciled: boolean }[] = [];
  const skippedSports: string[] = [];

  for (const session of sessions) {
    const sport = session.sport ? SPORT_MAP[session.sport] : undefined;
    if (!sport) {
      skippedSports.push(session.sport ?? "unknown");
      continue;
    }

    // Workout date from the session start (UTC calendar date).
    const date = (session.startTime ?? new Date()).toISOString().slice(0, 10);
    const actuals = {
      actualDurationSec: session.totalTimerTime
        ? Math.round(session.totalTimerTime)
        : session.totalElapsedTime
          ? Math.round(session.totalElapsedTime)
          : null,
      actualDistanceM: session.totalDistance
        ? Math.round(session.totalDistance)
        : null,
      avgHr: session.avgHeartRate ?? null,
      maxHr: session.maxHeartRate ?? null,
      avgPowerW: session.avgPower ? Math.round(session.avgPower) : null,
      load: session.trainingStressScore
        ? Math.round(session.trainingStressScore)
        : null,
    };

    // Reconcile: if a planned workout exists for this athlete on the same
    // date and sport, complete it with the recorded actuals instead of
    // creating a duplicate entry.
    const [planned] = await db
      .select()
      .from(workouts)
      .where(
        and(
          eq(workouts.athleteId, athleteId),
          eq(workouts.date, date),
          eq(workouts.sport, sport),
          eq(workouts.status, "planned"),
          isNull(workouts.deletedAt),
        ),
      )
      .limit(1);

    if (planned) {
      await db
        .update(workouts)
        .set({ ...actuals, status: "completed", externalId: hash })
        .where(eq(workouts.id, planned.id));
      created.push({ id: planned.id, reconciled: true });
    } else {
      const [workout] = await db
        .insert(workouts)
        .values({
          athleteId,
          createdById: uploadedById,
          sport,
          status: "completed",
          source: "fit_upload",
          externalId: hash,
          title: sessionTitle(sport, session),
          date,
          ...actuals,
        })
        .returning();
      created.push({ id: workout.id, reconciled: false });
    }
  }

  if (created.length > 0) {
    await db
      .update(rawActivities)
      .set({ workoutId: created[0].id })
      .where(eq(rawActivities.id, rawActivity.id));
  }

  if (created.length === 0) {
    return {
      ...base,
      status: "error",
      message: `Unsupported sport${skippedSports.length > 1 ? "s" : ""}: ${skippedSports.join(", ")} (raw data kept)`,
    };
  }

  const reconciledCount = created.filter((c) => c.reconciled).length;
  return {
    ...base,
    status: "imported",
    workouts: created,
    message:
      reconciledCount > 0
        ? `Imported and matched ${reconciledCount} planned workout${reconciledCount > 1 ? "s" : ""}`
        : `Imported ${created.length} workout${created.length > 1 ? "s" : ""}`,
  };
}
