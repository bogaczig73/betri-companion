import { asc, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { users, type User } from "@/db/schema";

// Testing-phase stand-in for a session. When real auth lands, replace
// getActingUser() with a session lookup — everything downstream only depends
// on receiving a User.
export const ACTING_USER_COOKIE = "betri_acting_user";

export async function getAllUsers(): Promise<User[]> {
  return db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.role), asc(users.name));
}

export async function getActingUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const actingId = cookieStore.get(ACTING_USER_COOKIE)?.value;
  const all = await getAllUsers();
  return (
    all.find((u) => u.id === actingId) ??
    all.find((u) => u.role === "coach") ??
    all[0] ??
    null
  );
}
