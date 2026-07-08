import { redirect } from "next/navigation";

import { WorkoutForm } from "@/components/workout-form";
import { canAccessAthlete, getUserById } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

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
  if (!athleteId) redirect("/athletes");
  if (!(await canAccessAthlete(actingUser, athleteId))) redirect("/");

  const athlete = await getUserById(athleteId);
  if (!athlete) redirect("/");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New workout</h1>
        <p className="text-muted-foreground">for {athlete.name}</p>
      </div>
      <WorkoutForm
        athleteId={athleteId}
        defaultDate={
          dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : undefined
        }
      />
    </div>
  );
}
