import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { UserManager } from "@/components/users/user-manager";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAllCoachLinks, getAthletesForCoach } from "@/lib/access";
import { getActingUser, getAllUsers } from "@/lib/acting-user";

export default async function AthletesPage() {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  const [athletes, users, links] = await Promise.all([
    getAthletesForCoach(actingUser.id),
    getAllUsers(),
    getAllCoachLinks(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Athletes</h1>
        <p className="text-muted-foreground">
          Your roster, accounts, and coach–athlete links.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{athletes.length} linked</CardTitle>
          <CardDescription>
            Open an athlete to see and manage their workouts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletes.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No athletes linked yet"
              description="Athletes appear here once they are linked to you as their coach."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {athletes.map((athlete) => (
                <li key={athlete.id} className="min-w-0">
                  <Link
                    href={`/athletes/${athlete.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-accent"
                  >
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {athlete.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {athlete.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {athlete.email} · {athlete.timezone}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <UserManager users={users} links={links} actingUserId={actingUser.id} />
    </div>
  );
}
