import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActingUser } from "@/lib/acting-user";
import { getConversations } from "@/lib/chat";
import { formatDateTime } from "@/lib/format";

export default async function ChatPage() {
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const conversations = await getConversations(actingUser);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
      <Card>
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>
            {actingUser.role === "coach"
              ? "One conversation per athlete on your roster."
              : "Your conversations with your coaches."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Nobody to chat with yet"
              description={
                actingUser.role === "coach"
                  ? "Link an athlete first to start a conversation."
                  : "Ask a coach to add you to their roster."
              }
            />
          ) : (
            <ul className="space-y-2">
              {conversations.map(({ counterpart, lastMessage }) => (
                <li key={counterpart.id}>
                  <Link
                    href={`/chat/${counterpart.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {counterpart.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{counterpart.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lastMessage
                          ? `${formatDateTime(lastMessage.createdAt)} — ${lastMessage.body}`
                          : "No messages yet"}
                      </p>
                    </div>
                    <Badge variant="secondary">{counterpart.role}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
