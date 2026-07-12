import { redirect } from "next/navigation";

import { PlanGeneratorForm } from "@/components/plan-generator-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActingUser } from "@/lib/acting-user";

export default async function GeneratePlanPage() {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  // Next Monday (UTC) — plans start on a Monday.
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + ((8 - now.getUTCDay()) % 7 || 7));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Generate a plan
        </h1>
        <p className="text-muted-foreground">
          Periodized backward from race day — base, build, peak, taper — for a
          quarter, half year, or a full season.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
          <CardDescription>
            Deterministic and editable: the generator drafts, you decide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanGeneratorForm
            defaultStartDate={monday.toISOString().slice(0, 10)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
