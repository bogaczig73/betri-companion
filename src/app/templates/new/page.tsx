import { redirect } from "next/navigation";

import { TemplateForm } from "@/components/template-form";
import { getActingUser } from "@/lib/acting-user";

export default async function NewTemplatePage() {
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
      <TemplateForm />
    </div>
  );
}
