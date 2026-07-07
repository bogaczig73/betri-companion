import { notFound, redirect } from "next/navigation";

import { PlanBuilder } from "@/components/plan-builder";
import { getAthletesForCoach } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { getPlanDetail } from "@/lib/plans";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") redirect("/");

  const plan = await getPlanDetail(id);
  if (!plan) notFound();
  if (plan.createdById !== actingUser.id) redirect("/plans");

  const athletes = await getAthletesForCoach(actingUser.id);

  return (
    <PlanBuilder
      plan={plan}
      athletes={athletes.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
