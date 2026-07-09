import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { ChatAutoRefresh } from "@/components/chat/chat-auto-refresh";
import { MessageComposer } from "@/components/chat/message-composer";
import { ScrollAnchor } from "@/components/chat/scroll-anchor";
import { WorkoutMentionCard } from "@/components/chat/workout-mention-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { getActingUser } from "@/lib/acting-user";
import {
  getMentionableWorkouts,
  getMessagesWithMentions,
  getOrCreateThread,
  resolveChatPair,
} from "@/lib/chat";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const pair = await resolveChatPair(actingUser, userId);
  if (!pair) redirect("/chat");

  const counterpart = pair.coach.id === actingUser.id ? pair.athlete : pair.coach;
  const thread = await getOrCreateThread(pair.coach.id, pair.athlete.id);
  const [threadMessages, mentionableWorkouts] = await Promise.all([
    getMessagesWithMentions(thread.id),
    getMentionableWorkouts(pair.athlete.id),
  ]);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4">
      <ChatAutoRefresh />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {counterpart.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/chat" className="hover:underline">
              ← All conversations
            </Link>
          </p>
        </div>
        <Badge variant="secondary">{counterpart.role}</Badge>
      </div>

      <div className="space-y-4">
        {threadMessages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            description="Say hi, and type @ to reference a workout."
          />
        ) : (
          threadMessages.map((m) => {
            const mine = m.senderId === actingUser.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-1.5",
                  mine ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted",
                  )}
                >
                  {m.body}
                </div>
                {m.mentionedWorkouts.length > 0 && (
                  <div className="w-full max-w-[85%] space-y-1.5">
                    {m.mentionedWorkouts.map((w) => (
                      <WorkoutMentionCard key={w.id} workout={w} />
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {m.sender.name.split(" ")[0]} · {formatDateTime(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
        <ScrollAnchor />
      </div>

      <div className="sticky bottom-0 bg-background pt-2 pb-2">
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <MessageComposer
            threadId={thread.id}
            mentionableWorkouts={mentionableWorkouts}
          />
        </div>
      </div>
    </div>
  );
}
