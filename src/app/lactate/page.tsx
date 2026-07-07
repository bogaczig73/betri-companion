import Link from "next/link";
import { redirect } from "next/navigation";

import { SportBadge } from "@/components/sport-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActingUser } from "@/lib/acting-user";
import { getAthletesForCoach } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { getTestsForAthletes } from "@/lib/lactate-data";
import type { Sport } from "@/db/schema";

export default async function LactatePage() {
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const athleteIds =
    actingUser.role === "coach"
      ? (await getAthletesForCoach(actingUser.id)).map((a) => a.id)
      : [actingUser.id];
  const tests = await getTestsForAthletes(athleteIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lactate testing
          </h1>
          <p className="text-muted-foreground">
            Graded step tests with LT1 / LT2 estimates across methods.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/lactate/new" />}>
          New test
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tests</CardTitle>
          <CardDescription>{tests.length} recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lactate tests yet. Create one to start entering step data.
            </p>
          ) : (
            <ul className="space-y-2">
              {tests.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/lactate/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <SportBadge sport={t.sport as Sport} />
                        <p className="truncate text-sm font-medium">
                          {t.title || `${t.athleteName} · lactate test`}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.athleteName} · {formatDate(t.testDate)} · {t.stepCount}{" "}
                        steps
                      </p>
                    </div>
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
