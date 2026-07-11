import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { WorkoutForm } from "@/components/workout-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  canAccessAthlete,
  getAthletesForCoach,
  getUserById,
} from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { getTemplatesForUser } from "@/lib/templates";
import { getCurrentThresholds } from "@/lib/thresholds";

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ athlete?: string; date?: string }>;
}) {
  const { athlete: athleteParam, date: dateParam } = await searchParams;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  // Coaches create for an athlete (?athlete=); athletes log for themselves.
  const athleteId =
    actingUser.role === "athlete" ? actingUser.id : athleteParam;
  if (!athleteId) {
    // No athlete picked yet — let the coach choose here.
    const athletes = await getAthletesForCoach(actingUser.id);
    const dateQS = dateParam ? `&date=${dateParam}` : "";
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New workout
          </h1>
          <p className="text-muted-foreground">Who is this session for?</p>
        </div>
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {athletes.map((a) => (
              <Link
                key={a.id}
                href={`/workouts/new?athlete=${a.id}${dateQS}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-accent"
              >
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                    {a.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {a.name}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!(await canAccessAthlete(actingUser, athleteId))) redirect("/");

  const athlete = await getUserById(athleteId);
  if (!athlete) redirect("/");

  const [templates, thresholds] = await Promise.all([
    getTemplatesForUser(actingUser.id),
    getCurrentThresholds(athleteId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New workout</h1>
        <p className="text-muted-foreground">for {athlete.name}</p>
      </div>
      <WorkoutForm
        athleteId={athleteId}
        templates={templates}
        thresholds={thresholds}
        defaultDate={
          dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : undefined
        }
      />
    </div>
  );
}
