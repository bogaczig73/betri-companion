import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  chatThreads,
  coachAthletes,
  messages,
  messageWorkoutMentions,
  users,
  workouts,
  type ChatThread,
  type Message,
  type User,
  type Workout,
} from "@/db/schema";

export type Conversation = {
  counterpart: User;
  lastMessage: Message | null;
};

export type MessageWithMentions = Message & {
  sender: Pick<User, "id" | "name">;
  mentionedWorkouts: Workout[];
};

// The people the acting user can chat with: a coach chats with their linked
// athletes, an athlete with their linked coaches.
export async function getConversations(user: User): Promise<Conversation[]> {
  const links = await db
    .select({ user: users })
    .from(coachAthletes)
    .innerJoin(
      users,
      user.role === "coach"
        ? eq(users.id, coachAthletes.athleteId)
        : eq(users.id, coachAthletes.coachId),
    )
    .where(
      and(
        user.role === "coach"
          ? eq(coachAthletes.coachId, user.id)
          : eq(coachAthletes.athleteId, user.id),
        isNull(coachAthletes.deletedAt),
      ),
    );

  const counterparts = links.map((l) => l.user);
  if (counterparts.length === 0) return [];

  const threads = await db
    .select()
    .from(chatThreads)
    .where(
      user.role === "coach"
        ? eq(chatThreads.coachId, user.id)
        : eq(chatThreads.athleteId, user.id),
    );
  const threadByCounterpart = new Map(
    threads.map((t) => [user.role === "coach" ? t.athleteId : t.coachId, t]),
  );

  return Promise.all(
    counterparts.map(async (counterpart) => {
      const thread = threadByCounterpart.get(counterpart.id);
      if (!thread) return { counterpart, lastMessage: null };
      const [lastMessage] = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.threadId, thread.id), isNull(messages.deletedAt)),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return { counterpart, lastMessage: lastMessage ?? null };
    }),
  );
}

// Returns the thread for a coach–athlete pair, creating it on first use.
// Callers must have verified the pair is linked (see resolveChatPair).
export async function getOrCreateThread(
  coachId: string,
  athleteId: string,
): Promise<ChatThread> {
  const [existing] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.coachId, coachId),
        eq(chatThreads.athleteId, athleteId),
      ),
    );
  if (existing) return existing;

  // onConflictDoNothing + re-select covers the concurrent-create race.
  await db
    .insert(chatThreads)
    .values({ coachId, athleteId })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.coachId, coachId),
        eq(chatThreads.athleteId, athleteId),
      ),
    );
  return created;
}

// Maps acting user + counterpart id to the (coachId, athleteId) pair, or null
// if the two are not linked. This is the chat authorization check.
export async function resolveChatPair(
  actingUser: User,
  counterpartId: string,
): Promise<{ coach: User; athlete: User } | null> {
  if (counterpartId === actingUser.id) return null;
  const [counterpart] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, counterpartId), isNull(users.deletedAt)));
  if (!counterpart || counterpart.role === actingUser.role) return null;

  const coach = actingUser.role === "coach" ? actingUser : counterpart;
  const athlete = actingUser.role === "athlete" ? actingUser : counterpart;

  const [link] = await db
    .select()
    .from(coachAthletes)
    .where(
      and(
        eq(coachAthletes.coachId, coach.id),
        eq(coachAthletes.athleteId, athlete.id),
        isNull(coachAthletes.deletedAt),
      ),
    );
  return link ? { coach, athlete } : null;
}

export async function getThreadById(
  threadId: string,
): Promise<ChatThread | null> {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId));
  return thread ?? null;
}

const MESSAGE_PAGE_SIZE = 100;

export async function getMessagesWithMentions(
  threadId: string,
): Promise<MessageWithMentions[]> {
  const rows = await db
    .select({ message: messages, senderName: users.name })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.threadId, threadId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(MESSAGE_PAGE_SIZE);
  rows.reverse(); // chronological, keeping only the newest page

  if (rows.length === 0) return [];

  const mentionRows = await db
    .select({ messageId: messageWorkoutMentions.messageId, workout: workouts })
    .from(messageWorkoutMentions)
    .innerJoin(workouts, eq(workouts.id, messageWorkoutMentions.workoutId))
    .where(
      and(
        inArray(
          messageWorkoutMentions.messageId,
          rows.map((r) => r.message.id),
        ),
        isNull(workouts.deletedAt),
      ),
    );
  const mentionsByMessage = new Map<string, Workout[]>();
  for (const { messageId, workout } of mentionRows) {
    const list = mentionsByMessage.get(messageId) ?? [];
    list.push(workout);
    mentionsByMessage.set(messageId, list);
  }

  return rows.map(({ message, senderName }) => ({
    ...message,
    sender: { id: message.senderId, name: senderName },
    mentionedWorkouts: mentionsByMessage.get(message.id) ?? [],
  }));
}

const MENTIONABLE_LIMIT = 50;

// Workouts either side can @-mention in a thread: the athlete's most recent
// ones (planned and completed).
export async function getMentionableWorkouts(
  athleteId: string,
): Promise<Workout[]> {
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.athleteId, athleteId), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.date), desc(workouts.createdAt))
    .limit(MENTIONABLE_LIMIT);
}
