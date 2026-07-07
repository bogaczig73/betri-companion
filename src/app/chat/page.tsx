import Link from "next/link";
import { redirect } from "next/navigation";

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
            <p className="text-sm text-muted-foreground">
              Nobody to chat with yet —{" "}
              {actingUser.role === "coach"
                ? "link an athlete first."
                : "ask a coach to add you to their roster."}
            </p>
          ) : (
            <ul className="space-y-2">
              {conversations.map(({ counterpart, lastMessage }) => (
                <li key={counterpart.id}>
                  <Link
                    href={`/chat/${counterpart.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
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
