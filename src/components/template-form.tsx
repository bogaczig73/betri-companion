"use client";

import { useActionState, useState } from "react";

import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type TemplateFormState,
} from "@/app/actions/templates";
import { StructureBuilder } from "@/components/structure-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Sport, WorkoutTemplate } from "@/db/schema";
import { SPORTS } from "@/lib/sports";

const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

export function TemplateForm({ template }: { template?: WorkoutTemplate }) {
  const action = template
    ? updateTemplate.bind(null, template.id)
    : createTemplate;
  const [state, formAction, isPending] = useActionState<
    TemplateFormState,
    FormData
  >(action, {});
  const [sport, setSport] = useState<Sport>(template?.sport ?? "run");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={template?.name ?? ""}
            placeholder="e.g. 8×2min LT2, Long Z2 ride, CSS 10×100"
          />
          {errors.name?.[0] && (
            <p className="text-xs text-destructive">{errors.name[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sport">Sport</Label>
          <select
            id="sport"
            name="sport"
            className={selectClassName}
            value={sport}
            onChange={(e) => setSport(e.target.value as Sport)}
          >
            {Object.entries(SPORTS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="plannedDurationMin">Duration (min)</Label>
          <Input
            id="plannedDurationMin"
            name="plannedDurationMin"
            type="number"
            step="1"
            min="0"
            defaultValue={
              template?.plannedDurationSec
                ? Math.round(template.plannedDurationSec / 60)
                : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plannedDistanceKm">Distance (km)</Label>
          <Input
            id="plannedDistanceKm"
            name="plannedDistanceKm"
            type="number"
            step="0.1"
            min="0"
            defaultValue={
              template?.plannedDistanceM ? template.plannedDistanceM / 1000 : ""
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-6">
          <Label htmlFor="description">Instructions</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={template?.description ?? ""}
            placeholder="Prescription: intervals, zones, exercises…"
          />
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-6">
          <Label>Structure (optional)</Label>
          <StructureBuilder
            name="structureJson"
            initial={template?.structure}
            sport={sport}
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : template ? "Save changes" : "Create template"}
        </Button>
        {template && (
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete this template?")) {
                void deleteTemplate(template.id);
              }
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
