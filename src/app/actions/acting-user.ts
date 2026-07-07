"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { ACTING_USER_COOKIE } from "@/lib/acting-user";

export async function setActingUser(userId: string) {
  const id = z.uuid().parse(userId);
  const cookieStore = await cookies();
  cookieStore.set(ACTING_USER_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
