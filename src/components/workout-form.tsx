"use client";

import { useActionState, useState } from "react";

import {
  createWorkout,
  deleteWorkout,
  updateWorkout,
  type WorkoutFormState,
} from "@/app/actions/workouts";
import { StructureBuilder } from "@/components/structure-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Sport, Workout, WorkoutStatus } from "@/db/schema";
import { SPORTS } from "@/lib/sports";
import { cn } from "@/lib/utils";

const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function WorkoutForm({
  athleteId,
  workout,
  defaultDate,
}: {
  athleteId: string;
  workout?: Workout;
  defaultDate?: string;
}) {
  const action = workout ? updateWorkout.bind(null, workout.id) : createWorkout;
  const [state, formAction, isPending] = useActionState<
    WorkoutFormState,
    FormData
  >(action, {});
  const [status, setStatus] = useState<WorkoutStatus>(
    workout?.status ?? "planned",
  );
  const [sport, setSport] = useState<Sport>(workout?.sport ?? "run");

  const showDistance = sport !== "strength";
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={workout?.title ?? ""}
            placeholder="e.g. Long run, FTP intervals, Upper body"
          />
          <FieldError errors={errors.title} />
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
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={
              workout?.date ?? defaultDate ?? new Date().toISOString().slice(0, 10)
            }
          />
          <FieldError errors={errors.date} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            className={selectClassName}
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkoutStatus)}
          >
            <option value="planned">Planned</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <fieldset className="space-y-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Plan</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="plannedDurationMin">Duration (min)</Label>
            <Input
              id="plannedDurationMin"
              name="plannedDurationMin"
              type="number"
              step="1"
              min="0"
              defaultValue={
                workout?.plannedDurationSec
                  ? Math.round(workout.plannedDurationSec / 60)
                  : ""
              }
            />
            <FieldError errors={errors.plannedDurationMin} />
          </div>
          {showDistance && (
            <div className="space-y-2">
              <Label htmlFor="plannedDistanceKm">Distance (km)</Label>
              <Input
                id="plannedDistanceKm"
                name="plannedDistanceKm"
                type="number"
                step="0.1"
                min="0"
                defaultValue={
                  workout?.plannedDistanceM
                    ? workout.plannedDistanceM / 1000
                    : ""
                }
              />
              <FieldError errors={errors.plannedDistanceKm} />
            </div>
          )}
          <div
            className={cn(
              "space-y-2 sm:col-span-2",
              showDistance ? "lg:col-span-2" : "lg:col-span-3",
            )}
          >
            <Label htmlFor="description">Instructions</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              className="lg:h-full lg:min-h-9"
              defaultValue={workout?.description ?? ""}
              placeholder="Prescription: intervals, zones, exercises…"
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4">
            <Label>Structure (optional)</Label>
            <StructureBuilder
              name="structureJson"
              initial={workout?.structure}
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        className={cn(
          "space-y-4 rounded-md border p-4",
          status !== "completed" && "hidden",
        )}
      >
        <legend className="px-1 text-sm font-medium">Result</legend>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="actualDurationMin">Duration (min)</Label>
            <Input
              id="actualDurationMin"
              name="actualDurationMin"
              type="number"
              step="1"
              min="0"
              defaultValue={
                workout?.actualDurationSec
                  ? Math.round(workout.actualDurationSec / 60)
                  : ""
              }
            />
            <FieldError errors={errors.actualDurationMin} />
          </div>
          {showDistance && (
            <div className="space-y-2">
              <Label htmlFor="actualDistanceKm">Distance (km)</Label>
              <Input
                id="actualDistanceKm"
                name="actualDistanceKm"
                type="number"
                step="0.1"
                min="0"
                defaultValue={
                  workout?.actualDistanceM ? workout.actualDistanceM / 1000 : ""
                }
              />
              <FieldError errors={errors.actualDistanceKm} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="rpe">RPE (1–10)</Label>
            <Input
              id="rpe"
              name="rpe"
              type="number"
              min="1"
              max="10"
              defaultValue={workout?.rpe ?? ""}
            />
            <FieldError errors={errors.rpe} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avgHr">Avg HR</Label>
            <Input
              id="avgHr"
              name="avgHr"
              type="number"
              defaultValue={workout?.avgHr ?? ""}
            />
            <FieldError errors={errors.avgHr} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxHr">Max HR</Label>
            <Input
              id="maxHr"
              name="maxHr"
              type="number"
              defaultValue={workout?.maxHr ?? ""}
            />
            <FieldError errors={errors.maxHr} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avgPowerW">Avg power (W)</Label>
            <Input
              id="avgPowerW"
              name="avgPowerW"
              type="number"
              defaultValue={workout?.avgPowerW ?? ""}
            />
            <FieldError errors={errors.avgPowerW} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="load">Load (TSS-like)</Label>
            <Input
              id="load"
              name="load"
              type="number"
              defaultValue={workout?.load ?? ""}
            />
            <FieldError errors={errors.load} />
          </div>
          <div className="space-y-2 sm:col-span-3 lg:col-span-4">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={workout?.notes ?? ""}
              placeholder="How did it go?"
            />
          </div>
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : workout ? "Save changes" : "Create workout"}
        </Button>
        {workout && (
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete this workout?")) {
                void deleteWorkout(workout.id);
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
