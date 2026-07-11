import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SportBadge } from "@/components/sport-badge";
import { StructureProfile } from "@/components/structure-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActingUser } from "@/lib/acting-user";
import { formatDistance, formatDuration } from "@/lib/format";
import { getTemplatesForUser } from "@/lib/templates";

export default async function TemplatesPage() {
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const templates = await getTemplatesForUser(actingUser.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Workout templates
          </h1>
          <p className="text-muted-foreground">
            Reusable prescriptions — pick one when creating a training or from
            the calendar quick-add.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/templates/new" />}>
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create one here, or open any workout and use “Save as template”."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const parts: string[] = [];
            if (t.plannedDurationSec)
              parts.push(formatDuration(t.plannedDurationSec));
            if (t.plannedDistanceM)
              parts.push(formatDistance(t.plannedDistanceM, t.sport));
            return (
              <Link key={t.id} href={`/templates/${t.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-ring">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="truncate">{t.name}</CardTitle>
                      <SportBadge sport={t.sport} />
                    </div>
                    {parts.length > 0 && (
                      <CardDescription>{parts.join(" · ")}</CardDescription>
                    )}
                  </CardHeader>
                  {t.structure && (
                    <CardContent>
                      <StructureProfile structure={t.structure} />
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
