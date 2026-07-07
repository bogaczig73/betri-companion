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
import { getAthletesForCoach } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

export default async function AthletesPage() {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  const athletes = await getAthletesForCoach(actingUser.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Athletes</h1>
        <p className="text-muted-foreground">Your roster.</p>
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
            <p className="text-sm text-muted-foreground">
              No athletes linked yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {athletes.map((athlete) => (
                <li key={athlete.id}>
                  <Link
                    href={`/athletes/${athlete.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{athlete.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {athlete.email} · {athlete.timezone}
                      </p>
                    </div>
                    <Badge variant="secondary">athlete</Badge>
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
