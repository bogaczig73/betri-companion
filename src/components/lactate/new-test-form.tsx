"use client";

import { useActionState } from "react";

import { createTest, type CreateTestState } from "@/app/actions/lactate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LACTATE_SPORTS } from "@/lib/lactate";
import { SPORTS } from "@/lib/sports";

export function NewTestForm({
  athletes,
  fixedAthleteId,
  today,
}: {
  athletes: { id: string; name: string }[];
  fixedAthleteId?: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<CreateTestState, FormData>(
    createTest,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {fixedAthleteId ? (
        <input type="hidden" name="athleteId" value={fixedAthleteId} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="athleteId">Athlete</Label>
          <select
            id="athleteId"
            name="athleteId"
            required
            defaultValue=""
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          >
            <option value="" disabled>
              Select an athlete…
            </option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor="sport">Sport</Label>
          <select
            id="sport"
            name="sport"
            defaultValue="run"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          >
            {LACTATE_SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORTS[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="testDate">Date</Label>
          <Input id="testDate" name="testDate" type="date" defaultValue={today} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input id="title" name="title" placeholder="e.g. Pre-season treadmill test" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Protocol, conditions, device…" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create test"}
      </Button>
    </form>
  );
}
