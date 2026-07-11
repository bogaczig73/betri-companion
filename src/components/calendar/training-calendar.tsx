"use client";

import { AlertCircle, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  copyWorkoutToDate,
  loadCalendarMonth,
  moveWorkout,
  quickCreateWorkout,
} from "@/app/actions/workouts";
import { createWorkoutFromTemplate } from "@/app/actions/templates";
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
import {
  primaryZoneSeconds,
  ZoneBar,
  zoneTooltip,
} from "@/components/zone-bar";
import type { Sport, Workout, WorkoutTemplate } from "@/db/schema";
import { isoMonthMatches, monthGrid, monthLabel, shiftMonth } from "@/lib/calendar";
import { formatDistance, formatDuration } from "@/lib/format";
import { SPORTS } from "@/lib/sports";
import { projectedZoneSeconds, type WorkoutTss } from "@/lib/tss";
import { cn } from "@/lib/utils";
import { ZONE_COLORS, ZONE_LABELS } from "@/lib/zones";

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
  const zones = workout.timeInZones
    ? primaryZoneSeconds(workout.timeInZones)
    : null;
  // Planned sessions without a recording: project zones from the structure.
  const projected =
    !zones && workout.status === "planned" && workout.structure
      ? projectedZoneSeconds(workout.structure)
      : null;
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
      {zones && (
        <ZoneBar seconds={zones.seconds} size="xs" className="mt-1" />
      )}
      {projected && (
        <ZoneBar
          seconds={projected}
          size="xs"
          className="mt-1 opacity-60"
          title={`Projected: ${zoneTooltip(projected)}`}
        />
      )}
    </Link>
  );
}

function WeekSummary({
  workouts,
  tssById,
}: {
  workouts: Workout[];
  tssById: Record<string, WorkoutTss>;
}) {
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
  // Actual load = device TSS or server-side estimate; planned = prescribed.
  let load = 0;
  let plannedLoad = 0;
  for (const w of workouts) {
    const tss = tssById[w.id];
    load += tss?.actual ?? 0;
    plannedLoad += tss?.planned ?? 0;
  }
  const completedCount = workouts.filter(
    (w) => w.status === "completed",
  ).length;
  const pct =
    plannedSec > 0 ? Math.min(100, Math.round((doneSec / plannedSec) * 100)) : 0;

  // Weekly zone distribution: sum each workout's primary metric split. Mixing
  // HR- and power-based splits is an approximation, but the zones mean the
  // same intensity bands either way.
  const zoneSeconds: number[] = [];
  for (const w of workouts) {
    const zones = w.timeInZones ? primaryZoneSeconds(w.timeInZones) : null;
    if (!zones) continue;
    zones.seconds.forEach((sec, i) => {
      zoneSeconds[i] = (zoneSeconds[i] ?? 0) + sec;
    });
  }
  const hasZones = zoneSeconds.some((s) => s > 0);

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
        {(load > 0 || plannedLoad > 0) && (
          <>
            {" "}
            · {load}
            {plannedLoad > 0 && ` / ${plannedLoad}`} load
          </>
        )}
      </p>
      {hasZones && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Time in zones
          </p>
          <ZoneBar
            seconds={zoneSeconds}
            size="sm"
            title={zoneTooltip(zoneSeconds)}
          />
          <div className="space-y-px">
            {zoneSeconds.map((sec, i) =>
              sec > 0 ? (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ZONE_COLORS[i] }}
                  />
                  {ZONE_LABELS[i]}
                  <span className="ml-auto tabular-nums">
                    {formatDuration(sec)}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAddDialog({
  athleteId,
  date,
  recent,
  templates,
  newWorkoutQS,
  onClose,
}: {
  athleteId: string;
  date: string;
  recent: RecentSession[];
  templates: WorkoutTemplate[];
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

  function fromTemplate(templateId: string) {
    startTransition(async () => {
      const result = await createWorkoutFromTemplate(
        templateId,
        athleteId,
        date,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
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

        {templates.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              From a template
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {templates.map((t) => {
                const { icon: Icon, className } = SPORTS[t.sport];
                const parts: string[] = [];
                if (t.plannedDurationSec)
                  parts.push(formatDuration(t.plannedDurationSec));
                if (t.plannedDistanceM)
                  parts.push(formatDistance(t.plannedDistanceM, t.sport));
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => fromTemplate(t.id)}
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
                        {t.name}
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
  tssById,
  recent,
  templates,
  today,
  newWorkoutQS,
}: {
  athleteId: string;
  year: number;
  month: number;
  weeks: string[][];
  workouts: Workout[];
  tssById: Record<string, WorkoutTss>;
  recent: RecentSession[];
  templates: WorkoutTemplate[];
  today: string;
  newWorkoutQS: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Months appended below the server-rendered one by the infinite scroll.
  // The page keys this component on athlete+month, so a navigation resets it.
  type MonthSection = {
    year: number;
    month: number;
    weeks: string[][];
    workouts: Workout[];
    tssById: Record<string, WorkoutTss>;
  };
  const [extra, setExtra] = useState<MonthSection[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        setLoadingMore(true);
        try {
          const last = extra.at(-1) ?? { year, month };
          const next = shiftMonth(last.year, last.month, 1);
          const data = await loadCalendarMonth(
            athleteId,
            next.year,
            next.month,
          );
          setExtra((prev) => [
            ...prev,
            { ...next, weeks: monthGrid(next.year, next.month).weeks, ...data },
          ]);
        } finally {
          loadingRef.current = false;
          setLoadingMore(false);
        }
      },
      { root: scrollRef.current, rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [athleteId, year, month, extra]);

  // Server mutations only refresh the server-rendered month; re-pull the
  // client-loaded ones so drops/quick-adds there don't show stale data.
  async function refreshExtras() {
    if (extra.length === 0) return;
    const refreshed = await Promise.all(
      extra.map(async (s) => ({
        ...s,
        ...(await loadCalendarMonth(athleteId, s.year, s.month)),
      })),
    );
    setExtra(refreshed);
  }

  const byDate = useMemo(() => {
    // Boundary weeks make months overlap — dedupe by id, freshest last: the
    // server-rendered props win over possibly-stale extras.
    const byId = new Map<string, Workout>();
    for (const s of extra) for (const w of s.workouts) byId.set(w.id, w);
    for (const w of workouts) byId.set(w.id, w);
    const map = new Map<string, Workout[]>();
    for (const w of byId.values()) {
      const list = map.get(w.date);
      if (list) list.push(w);
      else map.set(w.date, [w]);
    }
    return map;
  }, [workouts, extra]);

  const mergedTss = useMemo(() => {
    const merged: Record<string, WorkoutTss> = {};
    for (const s of extra) Object.assign(merged, s.tssById);
    Object.assign(merged, tssById);
    return merged;
  }, [tssById, extra]);

  // Week rows to render, with month labels for appended months. A week
  // already shown as a previous month's trailing row isn't repeated.
  const sections = useMemo(() => {
    const seen = new Set<string>();
    const take = (weekList: string[][]) =>
      weekList.filter((w) => !seen.has(w[0]) && (seen.add(w[0]), true));
    return [
      { year, month, label: null as string | null, weeks: take(weeks) },
      ...extra.map((s) => ({
        year: s.year,
        month: s.month,
        label: monthLabel(s.year, s.month),
        weeks: take(s.weeks),
      })),
    ];
  }, [year, month, weeks, extra]);

  function handleDrop(date: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverDate(null);
    const id = e.dataTransfer.getData("text/workout-id");
    if (!id) return;
    const copy = e.altKey;
    startTransition(async () => {
      if (copy) await copyWorkoutToDate(id, date);
      else await moveWorkout(id, date);
      await refreshExtras();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {/* Fixed-height viewport: further months scroll inside, not the page. */}
      <div
        ref={scrollRef}
        className="max-h-[calc(100dvh-13rem)] min-h-96 overflow-auto rounded-lg border"
      >
        <div className="min-w-[880px]">
          <div className="sticky top-0 z-10 grid grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] border-b bg-muted text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {DAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-1.5">
                {label}
              </div>
            ))}
            <div className="border-l px-2 py-1.5">Week</div>
          </div>

          {sections.map((section) => (
            <div key={`${section.year}-${section.month}`}>
              {section.label && (
                <div className="border-b bg-muted/40 px-3 py-1.5 text-sm font-semibold">
                  {section.label}
                </div>
              )}
              {section.weeks.map((week) => {
            const weekWorkouts = week.flatMap((d) => byDate.get(d) ?? []);
            return (
              <div
                key={week[0]}
                className="grid grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] border-b last:border-b-0"
              >
                {week.map((day) => {
                  const inMonth = isoMonthMatches(day, section.year, section.month);
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
                  <WeekSummary workouts={weekWorkouts} tssById={mergedTss} />
                </div>
              </div>
            );
          })}
            </div>
          ))}

          <div
            ref={sentinelRef}
            className="p-2 text-center text-xs text-muted-foreground"
          >
            {loadingMore ? "Loading next month…" : "Scroll for the next month"}
          </div>
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
          templates={templates}
          newWorkoutQS={newWorkoutQS}
          onClose={() => {
            setQuickAddDate(null);
            void refreshExtras();
          }}
        />
      )}
    </div>
  );
}
