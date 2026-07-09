"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  coachAthletes,
  unitSystemEnum,
  userRoleEnum,
  users,
  type User,
} from "@/db/schema";
import { getActingUser } from "@/lib/acting-user";

async function requireCoach(): Promise<User> {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") {
    throw new Error("Only coaches manage users");
  }
  return actingUser;
}

const emailField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.email().max(320).optional(),
);

const timezoneField = z
  .string()
  .trim()
  .refine(
    (tz) => tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz),
    "Unknown timezone",
  );

const baseUserInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: emailField,
  timezone: timezoneField,
  units: z.enum(unitSystemEnum.enumValues),
  coachIds: z.array(z.uuid()).default([]),
});

const createUserInput = baseUserInput.extend({
  role: z.enum(userRoleEnum.enumValues),
});

// Emails are globally unique, including on soft-deleted rows. Drizzle wraps
// the NeonDbError, so the Postgres error code sits on the cause chain.
function isUniqueViolation(err: unknown): boolean {
  for (
    let e = err;
    typeof e === "object" && e !== null;
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

// Bring the athlete's active links in sync with coachIds. The unique index on
// (coach_id, athlete_id) also covers soft-deleted rows, so re-linking must
// revive the old row instead of inserting a new one.
async function reconcileCoachLinks(athleteId: string, coachIds: string[]) {
  const validCoaches =
    coachIds.length === 0
      ? []
      : await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.id, coachIds),
              eq(users.role, "coach"),
              isNull(users.deletedAt),
            ),
          );
  const desired = new Set(validCoaches.map((c) => c.id));

  const existing = await db
    .select()
    .from(coachAthletes)
    .where(eq(coachAthletes.athleteId, athleteId));

  for (const link of existing) {
    if (desired.has(link.coachId)) {
      if (link.deletedAt) {
        await db
          .update(coachAthletes)
          .set({ deletedAt: null })
          .where(eq(coachAthletes.id, link.id));
      }
      desired.delete(link.coachId);
    } else if (!link.deletedAt) {
      await db
        .update(coachAthletes)
        .set({ deletedAt: new Date() })
        .where(eq(coachAthletes.id, link.id));
    }
  }

  if (desired.size > 0) {
    await db
      .insert(coachAthletes)
      .values([...desired].map((coachId) => ({ coachId, athleteId })));
  }
}

// Users appear in the header switcher on every page, so revalidate the layout.
function revalidateUsers() {
  revalidatePath("/", "layout");
}

export async function createUser(
  formData: FormData,
): Promise<{ error?: string }> {
  await requireCoach();
  const input = createUserInput.parse({
    ...Object.fromEntries(formData),
    coachIds: formData.getAll("coachIds"),
  });

  try {
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email ?? null,
        role: input.role,
        timezone: input.timezone,
        units: input.units,
      })
      .returning();
    if (user.role === "athlete") {
      await reconcileCoachLinks(user.id, input.coachIds);
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A user with that email already exists." };
    }
    throw err;
  }

  revalidateUsers();
  return {};
}

// Role is intentionally not editable: flipping coach↔athlete would orphan
// plans, threads, and links created under the old role. Recreate instead.
export async function updateUser(
  userId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireCoach();
  const id = z.uuid().parse(userId);
  const input = baseUserInput.parse({
    ...Object.fromEntries(formData),
    coachIds: formData.getAll("coachIds"),
  });

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!user) throw new Error("User not found");

  try {
    await db
      .update(users)
      .set({
        name: input.name,
        email: input.email ?? null,
        timezone: input.timezone,
        units: input.units,
      })
      .where(eq(users.id, id));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A user with that email already exists." };
    }
    throw err;
  }

  if (user.role === "athlete") {
    await reconcileCoachLinks(id, input.coachIds);
  }

  revalidateUsers();
  return {};
}

export async function deleteUser(userId: string) {
  const actingUser = await requireCoach();
  const id = z.uuid().parse(userId);
  if (id === actingUser.id) {
    throw new Error("Switch to another user before removing yourself");
  }

  // Soft delete the user and their coach–athlete links (both sides). Their
  // workouts, tests, and messages stay attached for the historical record.
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  await db
    .update(coachAthletes)
    .set({ deletedAt: new Date() })
    .where(
      and(
        or(eq(coachAthletes.coachId, id), eq(coachAthletes.athleteId, id)),
        isNull(coachAthletes.deletedAt),
      ),
    );

  revalidateUsers();
}
