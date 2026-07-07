"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { messages, messageWorkoutMentions, workouts } from "@/db/schema";
import { getThreadById } from "@/lib/chat";
import { getActingUser } from "@/lib/acting-user";

const sendMessageInput = z.object({
  threadId: z.uuid(),
  body: z.string().trim().min(1, "Message is empty").max(5000),
  mentionedWorkoutIds: z.array(z.uuid()).max(10).default([]),
});

export type SendMessageResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(
  input: z.infer<typeof sendMessageInput>,
): Promise<SendMessageResult> {
  const parsed = sendMessageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }
  const { threadId, body, mentionedWorkoutIds } = parsed.data;

  const actingUser = await getActingUser();
  if (!actingUser) return { ok: false, error: "No acting user" };

  const thread = await getThreadById(threadId);
  if (
    !thread ||
    (thread.coachId !== actingUser.id && thread.athleteId !== actingUser.id)
  ) {
    return { ok: false, error: "Not a member of this conversation" };
  }

  // Only the thread's athlete's workouts can be mentioned.
  const uniqueMentionIds = [...new Set(mentionedWorkoutIds)];
  if (uniqueMentionIds.length > 0) {
    const valid = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(
        and(
          inArray(workouts.id, uniqueMentionIds),
          eq(workouts.athleteId, thread.athleteId),
          isNull(workouts.deletedAt),
        ),
      );
    if (valid.length !== uniqueMentionIds.length) {
      return { ok: false, error: "Mentioned workout not found" };
    }
  }

  const [message] = await db
    .insert(messages)
    .values({ threadId, senderId: actingUser.id, body })
    .returning();
  if (uniqueMentionIds.length > 0) {
    await db.insert(messageWorkoutMentions).values(
      uniqueMentionIds.map((workoutId) => ({
        messageId: message.id,
        workoutId,
      })),
    );
  }

  revalidatePath("/chat", "layout");
  return { ok: true };
}
