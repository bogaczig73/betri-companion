"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";

import {
  createGeneratedPlan,
  type GeneratePlanState,
} from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RACE_TYPES, type RaceType } from "@/lib/plan-generator";

const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function weeksBetween(startIso: string, raceIso: string): number | null {
  if (!startIso || !raceIso) return null;
  const w =
    Math.round(
      (mondayOf(raceIso).getTime() - mondayOf(startIso).getTime()) /
        (7 * 86400_000),
    ) + 1;
  return Number.isFinite(w) ? w : null;
}

/** Race date landing on the Saturday of week N counted from the start. */
function raceDateForWeeks(startIso: string, weeks: number): string {
  const d = mondayOf(startIso);
  d.setUTCDate(d.getUTCDate() + (weeks - 1) * 7 + 5);
  return d.toISOString().slice(0, 10);
}

export function PlanGeneratorForm({
  defaultStartDate,
}: {
  defaultStartDate: string;
}) {
  const [state, formAction, pending] = useActionState<
    GeneratePlanState,
    FormData
  >(createGeneratedPlan, {});
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [raceDate, setRaceDate] = useState(
    raceDateForWeeks(defaultStartDate, 26),
  );

  const weeks = weeksBetween(startDate, raceDate);
  const horizonOk = weeks != null && weeks >= 8 && weeks <= 60;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="raceType">Race</Label>
          <select id="raceType" name="raceType" className={selectClassName} defaultValue="olympic">
            {(Object.keys(RACE_TYPES) as RaceType[]).map((t) => (
              <option key={t} value={t}>
                {RACE_TYPES[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Plan name (optional)</Label>
          <Input id="name" name="name" placeholder="auto: race — date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Training starts</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="raceDate">Race date</Label>
          <Input
            id="raceDate"
            name="raceDate"
            type="date"
            required
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Horizon:</span>
        {[
          ["Quarter", 13],
          ["Half year", 26],
          ["Full year", 52],
        ].map(([label, w]) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRaceDate(raceDateForWeeks(startDate, w as number))}
          >
            {label} ({w} wk)
          </Button>
        ))}
        <span
          className={
            horizonOk ? "text-muted-foreground" : "font-medium text-destructive"
          }
        >
          {weeks != null
            ? `${weeks} weeks${horizonOk ? "" : " — must be 8–60"}`
            : ""}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="startWeeklyHours">Starting hours / week</Label>
          <Input id="startWeeklyHours" name="startWeeklyHours" type="number" min="2" max="30" step="0.5" defaultValue="8" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rampPct">Weekly ramp %</Label>
          <Input id="rampPct" name="rampPct" type="number" min="2" max="15" defaultValue="8" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="buildRecoveryPattern">Load : recovery</Label>
          <select id="buildRecoveryPattern" name="buildRecoveryPattern" className={selectClassName} defaultValue="3:1">
            <option value="3:1">3 : 1</option>
            <option value="2:1">2 : 1</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        {(
          [
            ["swimPerWeek", "Swims", 2],
            ["bikePerWeek", "Rides", 3],
            ["runPerWeek", "Runs", 3],
            ["strengthPerWeek", "Strength", 1],
          ] as const
        ).map(([name, label, def]) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{label} / wk</Label>
            <Input id={name} name={name} type="number" min="0" max="5" defaultValue={def} />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="longSessionDay">Long ride day</Label>
          <select id="longSessionDay" name="longSessionDay" className={selectClassName} defaultValue="5">
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending || !horizonOk}>
        <Sparkles className="size-4" />
        {pending ? "Generating…" : "Generate plan"}
      </Button>
      <p className="text-xs text-muted-foreground">
        The long run lands the day after the long ride. You can edit every
        week and session in the plan builder afterwards.
      </p>
    </form>
  );
}
