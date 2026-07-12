import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Sparkles } from "lucide-react";

import { createPlan } from "@/app/actions/plans";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TrainingPlan } from "@/db/schema";
import { getActingUser } from "@/lib/acting-user";
import { getPlansForCoach } from "@/lib/plans";

function PlanLinkList({ plans }: { plans: TrainingPlan[] }) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="None yet"
        description="Create one with the form below."
        className="py-8"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Link
            href={`/plans/${plan.id}`}
            className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium">{plan.name}</p>
              {plan.description && (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {plan.description}
                </p>
              )}
            </div>
            {plan.isTemplate && <Badge variant="outline">template</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PlansPage() {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  const allPlans = await getPlansForCoach(actingUser.id);
  const plans = allPlans.filter((p) => !p.isTemplate);
  const templates = allPlans.filter((p) => p.isTemplate);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Training plans
          </h1>
          <p className="text-muted-foreground">
            Build week-by-week plans and assign them to athletes.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/plans/generate" />}
        >
          <Sparkles className="size-4" />
          Generate from race date
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPlan} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. Olympic distance build block"
              />
            </div>
            <div className="w-28 space-y-2">
              <Label htmlFor="numWeeks">Weeks</Label>
              <Input
                id="numWeeks"
                name="numWeeks"
                type="number"
                min="1"
                max="52"
                defaultValue="4"
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>{plans.length} active</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanLinkList plans={plans} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>{templates.length} reusable</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanLinkList plans={templates} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
