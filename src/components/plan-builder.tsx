"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";

import {
  addSession,
  addWeek,
  assignPlan,
  deletePlan,
  deleteSession,
  duplicatePlan,
  removeWeek,
  setWeekPhase,
  updateSession,
} from "@/app/actions/plans";
import { StructureBuilder } from "@/components/structure-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlannedSession, Sport } from "@/db/schema";
import { formatDuration } from "@/lib/format";
import type { PlanDetail } from "@/lib/plans";
import { SPORTS } from "@/lib/sports";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PHASES = ["base", "build", "peak", "taper", "recovery", "race"] as const;

const selectClassName =
  "border-input bg-transparent h-8 rounded-md border px-2 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

type SessionDialogState =
  | { mode: "add"; weekId: string; dayOfWeek: number }
  | { mode: "edit"; session: PlannedSession }
  | null;

function SessionChip({
  session,
  onClick,
}: {
  session: PlannedSession;
  onClick: () => void;
}) {
  const { icon: Icon, className } = SPORTS[session.sport];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs font-medium transition-opacity hover:opacity-80",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{session.title}</span>
      {session.plannedDurationSec && (
        <span className="ml-auto shrink-0 opacity-70">
          {formatDuration(session.plannedDurationSec)}
        </span>
      )}
    </button>
  );
}

function SessionDialog({
  state,
  onClose,
}: {
  state: SessionDialogState;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const session =
    state && state.mode === "edit" ? state.session : undefined;
  const [sport, setSport] = useState<Sport>(session?.sport ?? "run");
  if (!state) return null;

  const submit = (formData: FormData) => {
    startTransition(async () => {
      if (state.mode === "add") {
        await addSession(state.weekId, state.dayOfWeek, formData);
      } else {
        await updateSession(state.session.id, formData);
      }
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "add" ? "Add session" : "Edit session"}
          </DialogTitle>
          <DialogDescription>
            {state.mode === "add"
              ? `${DAY_LABELS[state.dayOfWeek]} — what should the athlete do?`
              : "Adjust the prescription."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-sport">Sport</Label>
              <select
                id="s-sport"
                name="sport"
                value={sport}
                onChange={(e) => setSport(e.target.value as Sport)}
                className={cn(selectClassName, "h-9 w-full text-sm")}
              >
                {Object.entries(SPORTS).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-title">Title</Label>
              <Input
                id="s-title"
                name="title"
                required
                defaultValue={session?.title ?? ""}
                placeholder="e.g. Tempo run"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-duration">Duration (min)</Label>
              <Input
                id="s-duration"
                name="plannedDurationMin"
                type="number"
                min="0"
                step="1"
                defaultValue={
                  session?.plannedDurationSec
                    ? Math.round(session.plannedDurationSec / 60)
                    : ""
                }
              />
            </div>
            {sport !== "strength" && (
              <div className="space-y-2">
                <Label htmlFor="s-distance">Distance (km)</Label>
                <Input
                  id="s-distance"
                  name="plannedDistanceKm"
                  type="number"
                  min="0"
                  step="0.1"
                  defaultValue={
                    session?.plannedDistanceM
                      ? session.plannedDistanceM / 1000
                      : ""
                  }
                />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="s-description">Instructions</Label>
              <Textarea
                id="s-description"
                name="description"
                rows={3}
                defaultValue={session?.description ?? ""}
                placeholder="Intervals, zones, exercises…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Structure (optional)</Label>
              <StructureBuilder
                name="structureJson"
                initial={session?.structure}
                sport={sport}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            {state.mode === "edit" && (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  if (confirm("Remove this session from the plan?")) {
                    startTransition(async () => {
                      await deleteSession(state.session.id);
                      onClose();
                    });
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  planId,
  athletes,
  onClose,
}: {
  planId: string;
  athletes: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const nextMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      await assignPlan(planId, formData);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign plan</DialogTitle>
          <DialogDescription>
            Creates the planned workouts on the athlete&apos;s calendar,
            starting from the chosen date (week 1, Monday).
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="a-athlete">Athlete</Label>
            <select
              id="a-athlete"
              name="athleteId"
              required
              className={cn(selectClassName, "h-9 w-full text-sm")}
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-start">Start date</Label>
            <Input
              id="a-start"
              name="startDate"
              type="date"
              required
              defaultValue={nextMonday}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Assigning…" : "Assign"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanBuilder({
  plan,
  athletes,
}: {
  plan: PlanDetail;
  athletes: { id: string; name: string }[];
}) {
  const [sessionDialog, setSessionDialog] = useState<SessionDialogState>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {plan.name}
            </h1>
            {plan.isTemplate && <Badge variant="outline">template</Badge>}
          </div>
          {plan.description && (
            <p className="text-muted-foreground">{plan.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!plan.isTemplate && athletes.length > 0 && (
            <Button onClick={() => setAssignOpen(true)}>Assign</Button>
          )}
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(() => duplicatePlan(plan.id, !plan.isTemplate))
            }
          >
            {plan.isTemplate ? "New plan from template" : "Save as template"}
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete this plan? Assigned workouts stay.")) {
                startTransition(() => deletePlan(plan.id));
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div
          className="grid min-w-[980px]"
          style={{ gridTemplateColumns: "110px repeat(7, minmax(120px, 1fr))" }}
        >
          <div className="border-b bg-muted/50 p-2" />
          {DAY_LABELS.map((day) => (
            <div
              key={day}
              className="border-b bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {plan.weeks.map((week) => (
            <div key={week.id} className="contents">
              <div className="space-y-1 border-b border-r p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Week {week.weekNumber}
                  </span>
                  <button
                    type="button"
                    title="Remove week"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove week ${week.weekNumber} and its sessions?`,
                        )
                      ) {
                        startTransition(() => removeWeek(week.id));
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                <select
                  value={week.phase ?? ""}
                  className={cn(selectClassName, "w-full")}
                  onChange={(e) =>
                    startTransition(() =>
                      setWeekPhase(week.id, e.target.value || null),
                    )
                  }
                >
                  <option value="">phase…</option>
                  {PHASES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              {DAY_LABELS.map((_, day) => {
                const daySessions = week.sessions.filter(
                  (s) => s.dayOfWeek === day,
                );
                return (
                  <div
                    key={day}
                    className="min-h-20 space-y-1 border-b border-r p-1.5 last:border-r-0"
                  >
                    {daySessions.map((session) => (
                      <SessionChip
                        key={session.id}
                        session={session}
                        onClick={() =>
                          setSessionDialog({ mode: "edit", session })
                        }
                      />
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center justify-center rounded border border-dashed border-transparent py-1 text-muted-foreground/50 transition-colors hover:border-muted-foreground/30 hover:text-muted-foreground"
                      onClick={() =>
                        setSessionDialog({
                          mode: "add",
                          weekId: week.id,
                          dayOfWeek: day,
                        })
                      }
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => addWeek(plan.id))}
      >
        Add week
      </Button>

      {plan.assignments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Assignments</h2>
          <ul className="space-y-1">
            {plan.assignments.map((a) => (
              <li key={a.id} className="text-sm text-muted-foreground">
                {a.athleteName} — starts {a.startDate}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SessionDialog
        key={
          sessionDialog === null
            ? "closed"
            : sessionDialog.mode === "edit"
              ? sessionDialog.session.id
              : `${sessionDialog.weekId}-${sessionDialog.dayOfWeek}`
        }
        state={sessionDialog}
        onClose={() => setSessionDialog(null)}
      />
      {assignOpen && (
        <AssignDialog
          planId={plan.id}
          athletes={athletes}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
