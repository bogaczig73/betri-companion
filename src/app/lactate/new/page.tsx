import { redirect } from "next/navigation";

import { NewTestForm } from "@/components/lactate/new-test-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAthletesForCoach, getUserById } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";

export default async function NewLactateTestPage({
  searchParams,
}: {
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { athlete: athleteParam } = await searchParams;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const today = new Date().toISOString().slice(0, 10);

  if (actingUser.role === "athlete") {
    return (
      <FormShell>
        <NewTestForm athletes={[]} fixedAthleteId={actingUser.id} today={today} />
      </FormShell>
    );
  }

  const athletes = await getAthletesForCoach(actingUser.id);
  // If arriving from an athlete page, pre-lock to that athlete when linked.
  const preselect =
    athleteParam && athletes.some((a) => a.id === athleteParam)
      ? await getUserById(athleteParam)
      : null;

  return (
    <FormShell>
      <NewTestForm
        athletes={athletes.map((a) => ({ id: a.id, name: a.name }))}
        fixedAthleteId={preselect?.id}
        today={today}
      />
    </FormShell>
  );
}

function FormShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New lactate test</h1>
      <Card>
        <CardHeader>
          <CardTitle>Test details</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
