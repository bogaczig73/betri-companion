"use client";

import { AlertCircle, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  copyWorkoutToDate,
  moveWorkout,
  quickCreateWorkout,
} from "@/app/actions/workouts";
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
import type { Sport, Workout } from "@/db/schema";
import { isoMonthMatches } from "@/lib/calendar";
import { formatDistance, formatDuration } from "@/lib/format";
import { SPORTS } from "@/lib/sports";
import { cn } from "@/lib/utils";

export type RecentSession = {
  id: string;
  title: string;
  sport: Sport;
  durationSec: number | null;
  distanceM: number | null;
};

const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function chipMetrics(w: Workout): string {
  const duration =
    w.status === "completed"
      ? (w.actualDurationSec ?? w.plannedDurationSec)
      : w.plannedDurationSec;
  const distance =
    w.status === "completed"
      ? (w.actualDistanceM ?? w.plannedDistanceM)
      : w.plannedDistanceM;
  const parts: string[] = [];
  if (duration) parts.push(formatDuration(duration));
  if (distance) parts.push(formatDistance(distance, w.sport));
  return parts.join(" · ");
}

function WorkoutChip({ workout, today }: { workout: Workout; today: string }) {
  const { icon: Icon, className } = SPORTS[workout.sport];
  const missed = workout.status === "planned" && workout.date < today;
  const metrics = chipMetrics(workout);
  return (
    <Link
      href={`/workouts/${workout.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/workout-id", workout.id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      className={cn(
        "block cursor-grab rounded-md border border-black/5 px-1.5 py-1 text-xs leading-tight transition-opacity hover:opacity-80 active:cursor-grabbing dark:border-white/10",
        className,
        missed && "opacity-60",
      )}
      title={`${workout.title}${metrics ? ` — ${metrics}` : ""}`}
    >
      <span className="flex items-center gap-1">
        <Icon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {workout.title}
        </span>
        {workout.status === "completed" && (
          <Check
            className="size-3 shrink-0 text-(--success)"
            aria-label="Completed"
          />
        )}
        {missed && (
          <AlertCircle
            className="size-3 shrink-0 text-destructive"
            aria-label="Missed"
          />
        )}
      </span>
      {metrics && (
        <span className="mt-0.5 block truncate opacity-75">{metrics}</span>
      )}
    </Link>
  );
}

function WeekSummary({ workouts }: { workouts: Workout[] }) {
  const plannedSec = workouts.reduce(
    (sum, w) => sum + (w.plannedDurationSec ?? w.actualDurationSec ?? 0),
    0,
  );
  const doneSec = workouts.reduce(
    (sum, w) =>
      w.status === "completed"
        ? sum + (w.actualDurationSec ?? w.plannedDurationSec ?? 0)
        : sum,
    0,
  );
  const load = workouts.reduce(
    (sum, w) => (w.status === "completed" ? sum + (w.load ?? 0) : sum),
    0,
  );
  const completedCount = workouts.filter(
    (w) => w.status === "completed",
  ).length;
  const pct =
    plannedSec > 0 ? Math.min(100, Math.round((doneSec / plannedSec) * 100)) : 0;

  if (workouts.length === 0) {
    return (
      <div className="flex items-center justify-center p-2 text-xs text-muted-foreground">
        —
      </div>
    );
  }
  return (
    <div className="space-y-1.5 p-2 text-xs">
      <p className="font-medium">
        {formatDuration(doneSec)}
        <span className="font-normal text-muted-foreground">
          {" "}
          / {formatDuration(plannedSec)}
        </span>
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-(--success)"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground">
        {completedCount}/{workouts.length} done
        {load > 0 && <> · {load} load</>}
      </p>
    </div>
  );
}

function QuickAddDialog({
  athleteId,
  date,
  recent,
  newWorkoutQS,
  onClose,
}: {
  athleteId: string;
  date: string;
  recent: RecentSession[];
  newWorkoutQS: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sport, setSport] = useState<Sport>("run");
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await quickCreateWorkout({
        athleteId,
        sport,
        date,
        title: String(fd.get("title") ?? ""),
        plannedDurationMin: String(fd.get("plannedDurationMin") ?? ""),
        plannedDistanceKm: String(fd.get("plannedDistanceKm") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function repeat(sessionId: string) {
    startTransition(async () => {
      await copyWorkoutToDate(sessionId, date);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qa-sport">Sport</Label>
              <select
                id="qa-sport"
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
            <div className="space-y-1.5">
              <Label htmlFor="qa-duration">Duration (min)</Label>
              <Input
                id="qa-duration"
                name="plannedDurationMin"
                type="number"
                step="1"
                min="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-title">Title</Label>
            <Input
              id="qa-title"
              name="title"
              autoFocus
              placeholder="e.g. 2×20min threshold, Long ride, Technique swim"
            />
          </div>
          {sport !== "strength" && (
            <div className="space-y-1.5">
              <Label htmlFor="qa-distance">Distance (km)</Label>
              <Input
                id="qa-distance"
                name="plannedDistanceKm"
                type="number"
                step="0.1"
                min="0"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="qa-description">Instructions</Label>
            <Textarea
              id="qa-description"
              name="description"
              rows={2}
              placeholder="Prescription: intervals, zones, exercises…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/workouts/new?${newWorkoutQS}date=${date}`} />
              }
            >
              Full editor →
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add session"}
            </Button>
          </div>
        </form>

        {recent.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Or repeat a recent session
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {recent.map((s) => {
                const { icon: Icon, className } = SPORTS[s.sport];
                const parts: string[] = [];
                if (s.durationSec) parts.push(formatDuration(s.durationSec));
                if (s.distanceM)
                  parts.push(formatDistance(s.distanceM, s.sport));
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => repeat(s.id)}
                      className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 shrink-0 items-center justify-center rounded",
                          className,
                        )}
                      >
                        <Icon className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.title}
                      </span>
                      {parts.length > 0 && (
                        <span className="shrink-0 text-muted-foreground">
                          {parts.join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TrainingCalendar({
  athleteId,
  year,
  month,
  weeks,
  workouts,
  recent,
  today,
  newWorkoutQS,
}: {
  athleteId: string;
  year: number;
  month: number;
  weeks: string[][];
  workouts: Workout[];
  recent: RecentSession[];
  today: string;
  newWorkoutQS: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      const list = map.get(w.date);
      if (list) list.push(w);
      else map.set(w.date, [w]);
    }
    return map;
  }, [workouts]);

  function handleDrop(date: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverDate(null);
    const id = e.dataTransfer.getData("text/workout-id");
    if (!id) return;
    const copy = e.altKey;
    startTransition(async () => {
      if (copy) await copyWorkoutToDate(id, date);
      else await moveWorkout(id, date);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] border-b bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {DAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-1.5">
                {label}
              </div>
            ))}
            <div className="border-l px-2 py-1.5">Week</div>
          </div>

          {weeks.map((week) => {
            const weekWorkouts = week.flatMap((d) => byDate.get(d) ?? []);
            return (
              <div
                key={week[0]}
                className="grid grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] border-b last:border-b-0"
              >
                {week.map((day) => {
                  const inMonth = isoMonthMatches(day, year, month);
                  const isToday = day === today;
                  const dayWorkouts = byDate.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
                        setDragOverDate(day);
                      }}
                      onDragLeave={() =>
                        setDragOverDate((d) => (d === day ? null : d))
                      }
                      onDrop={(e) => handleDrop(day, e)}
                      className={cn(
                        "group min-h-28 space-y-1 border-r p-1.5 transition-colors last:border-r-0",
                        !inMonth && "bg-muted/30",
                        isToday && "bg-primary/[0.04] ring-1 ring-primary/30 ring-inset",
                        dragOverDate === day && "bg-accent",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "inline-flex size-5 items-center justify-center rounded-full text-xs",
                            inMonth
                              ? "text-foreground"
                              : "text-muted-foreground",
                            isToday &&
                              "bg-primary font-semibold text-primary-foreground",
                          )}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-5 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={`Add session on ${day}`}
                          onClick={() => setQuickAddDate(day)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      {dayWorkouts.map((w) => (
                        <WorkoutChip key={w.id} workout={w} today={today} />
                      ))}
                    </div>
                  );
                })}
                <div className="border-l bg-muted/20">
                  <WeekSummary workouts={weekWorkouts} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a session to reschedule · hold ⌥ Alt while dropping to copy ·
        hover a day and click + to add
      </p>

      {quickAddDate && (
        <QuickAddDialog
          athleteId={athleteId}
          date={quickAddDate}
          recent={recent}
          newWorkoutQS={newWorkoutQS}
          onClose={() => setQuickAddDate(null)}
        />
      )}
    </div>
  );
}
