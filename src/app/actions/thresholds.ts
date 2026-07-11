"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { athleteThresholds } from "@/db/schema";
import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { recomputeTimeInZonesForAthlete } from "@/lib/time-in-zones";

async function authorize(athleteId: string) {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  if (!(await canAccessAthlete(actingUser, athleteId))) {
    throw new Error("Not allowed to manage thresholds for this athlete");
  }
  return actingUser;
}

const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(max).optional(),
  );

const thresholdsSchema = z.object({
  athleteId: z.uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  maxHr: optionalInt(260),
  ftpW: optionalInt(2000),
  bikeLthr: optionalInt(260),
  bikeLt1W: optionalInt(2000),
  runThresholdPaceSecPerKm: optionalInt(3600),
  runLthr: optionalInt(260),
  runThresholdPowerW: optionalInt(2000),
  runLt1PaceSecPerKm: optionalInt(3600),
  cssPaceSecPer100m: optionalInt(1200),
  swimLthr: optionalInt(260),
  notes: z.string().trim().max(1000).optional(),
});

export type SaveThresholdsInput = z.input<typeof thresholdsSchema>;

// Saves a manual snapshot. One snapshot per athlete+effectiveDate for manual
// entries: saving on an existing date updates that snapshot in place, so the
// edit dialog behaves like editing the current profile.
export async function saveThresholds(input: SaveThresholdsInput) {
  const data = thresholdsSchema.parse(input);
  const actingUser = await authorize(data.athleteId);

  const values = {
    maxHr: data.maxHr ?? null,
    ftpW: data.ftpW ?? null,
    bikeLthr: data.bikeLthr ?? null,
    bikeLt1W: data.bikeLt1W ?? null,
    runThresholdPaceSecPerKm: data.runThresholdPaceSecPerKm ?? null,
    runLthr: data.runLthr ?? null,
    runThresholdPowerW: data.runThresholdPowerW ?? null,
    runLt1PaceSecPerKm: data.runLt1PaceSecPerKm ?? null,
    cssPaceSecPer100m: data.cssPaceSecPer100m ?? null,
    swimLthr: data.swimLthr ?? null,
    notes: data.notes || null,
  };

  const [existing] = await db
    .select({ id: athleteThresholds.id })
    .from(athleteThresholds)
    .where(
      and(
        eq(athleteThresholds.athleteId, data.athleteId),
        eq(athleteThresholds.effectiveDate, data.effectiveDate),
        eq(athleteThresholds.source, "manual"),
        isNull(athleteThresholds.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(athleteThresholds)
      .set({ ...values, setById: actingUser.id })
      .where(eq(athleteThresholds.id, existing.id));
  } else {
    await db.insert(athleteThresholds).values({
      ...values,
      athleteId: data.athleteId,
      setById: actingUser.id,
      source: "manual",
      effectiveDate: data.effectiveDate,
    });
  }

  await recomputeTimeInZonesForAthlete(data.athleteId);

  revalidatePath(`/athletes/${data.athleteId}`);
  revalidatePath("/calendar");
}

export async function deleteThresholdSnapshot(snapshotId: string) {
  const id = z.uuid().parse(snapshotId);
  const [row] = await db
    .select({
      id: athleteThresholds.id,
      athleteId: athleteThresholds.athleteId,
    })
    .from(athleteThresholds)
    .where(and(eq(athleteThresholds.id, id), isNull(athleteThresholds.deletedAt)))
    .limit(1);
  if (!row) return;
  await authorize(row.athleteId);
  await db
    .update(athleteThresholds)
    .set({ deletedAt: new Date() })
    .where(eq(athleteThresholds.id, row.id));
  await recomputeTimeInZonesForAthlete(row.athleteId);
  revalidatePath(`/athletes/${row.athleteId}`);
}
