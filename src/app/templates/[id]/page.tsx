import { notFound, redirect } from "next/navigation";

import { TemplateForm } from "@/components/template-form";
import { getActingUser } from "@/lib/acting-user";
import { getTemplateById } from "@/lib/templates";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const template = await getTemplateById(id);
  if (!template || template.createdById !== actingUser.id) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
      <TemplateForm template={template} />
    </div>
  );
}
