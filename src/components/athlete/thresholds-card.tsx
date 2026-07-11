"use client";

import { FlaskConical, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveThresholds } from "@/app/actions/thresholds";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AthleteThresholds, Sport } from "@/db/schema";
import { formatPaceSeconds, parsePaceInput } from "@/lib/format";
import { SPORTS } from "@/lib/sports";
import {
  describeZones,
  zoneSet,
  type ZoneMetric,
  type ZoneSet,
} from "@/lib/zones";

const SOURCE_LABELS: Record<AthleteThresholds["source"], string> = {
  manual: "set manually",
  lactate_test: "from lactate test",
  import: "imported",
};

export function ThresholdsCard({
  athleteId,
  current,
}: {
  athleteId: string;
  current: AthleteThresholds | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Thresholds &amp; zones</CardTitle>
          <CardDescription>
            {current ? (
              <>
                Effective {current.effectiveDate} · {SOURCE_LABELS[current.source]}
                {current.source === "lactate_test" && (
                  <FlaskConical size={12} className="ml-1 inline-block" />
                )}
              </>
            ) : (
              "No thresholds yet — enter them manually or run a lactate test"
            )}
          </CardDescription>
        </div>
        <EditThresholdsDialog athleteId={athleteId} current={current} />
      </CardHeader>
      {current && (
        <CardContent className="space-y-4">
          {current.maxHr && (
            <p className="text-xs text-muted-foreground">
              Max HR{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {current.maxHr} bpm
              </span>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <SportZones sport="bike" current={current} />
            <SportZones sport="run" current={current} />
            <SportZones sport="swim" current={current} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Key threshold values + the primary-metric zone ladder for one sport.
function SportZones({
  sport,
  current,
}: {
  sport: Sport;
  current: AthleteThresholds;
}) {
  const meta = SPORTS[sport];
  const Icon = meta.icon;

  const values: { label: string; text: string }[] = [];
  if (sport === "bike") {
    if (current.ftpW) values.push({ label: "FTP", text: `${current.ftpW} W` });
    if (current.bikeLt1W)
      values.push({ label: "LT1", text: `${current.bikeLt1W} W` });
    if (current.bikeLthr)
      values.push({ label: "LTHR", text: `${current.bikeLthr} bpm` });
  } else if (sport === "run") {
    if (current.runThresholdPaceSecPerKm)
      values.push({
        label: "LT2 pace",
        text: `${formatPaceSeconds(current.runThresholdPaceSecPerKm)}/km`,
      });
    if (current.runLt1PaceSecPerKm)
      values.push({
        label: "LT1 pace",
        text: `${formatPaceSeconds(current.runLt1PaceSecPerKm)}/km`,
      });
    if (current.runThresholdPowerW)
      values.push({ label: "Power", text: `${current.runThresholdPowerW} W` });
    if (current.runLthr)
      values.push({ label: "LTHR", text: `${current.runLthr} bpm` });
  } else if (sport === "swim") {
    if (current.cssPaceSecPer100m)
      values.push({
        label: "CSS",
        text: `${formatPaceSeconds(current.cssPaceSecPer100m)}/100m`,
      });
    if (current.swimLthr)
      values.push({ label: "LTHR", text: `${current.swimLthr} bpm` });
  } else {
    return null;
  }

  const primaryMetric: ZoneMetric = sport === "bike" ? "power" : "pace";
  const primary = zoneSet(current, sport, primaryMetric);
  const hr = zoneSet(current, sport, "hr");

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">No values yet</p>
      ) : (
        <>
          <dl className="mb-2 space-y-0.5">
            {values.map((v) => (
              <div key={v.label} className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{v.label}</dt>
                <dd className="font-semibold tabular-nums">{v.text}</dd>
              </div>
            ))}
          </dl>
          {primary && <ZoneLadder sport={sport} zones={primary} />}
          {hr && <ZoneLadder sport={sport} zones={hr} />}
        </>
      )}
    </div>
  );
}

function ZoneLadder({ sport, zones }: { sport: Sport; zones: ZoneSet }) {
  const rows = describeZones(sport, zones);
  return (
    <div className="mt-2 space-y-0.5 border-t pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {zones.metric === "hr" ? "HR zones" : zones.metric === "power" ? "Power zones" : "Pace zones"}
      </p>
      {rows.map((z) => (
        <div key={z.zone} className="flex items-center gap-1.5 text-xs">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: z.color }}
          />
          <span className="w-6 font-semibold">{z.label}</span>
          <span className="tabular-nums text-muted-foreground">{z.range}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

function EditThresholdsDialog({
  athleteId,
  current,
}: {
  athleteId: string;
  current: AthleteThresholds | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [maxHr, setMaxHr] = useState(str(current?.maxHr));
  const [ftpW, setFtpW] = useState(str(current?.ftpW));
  const [bikeLthr, setBikeLthr] = useState(str(current?.bikeLthr));
  const [bikeLt1W, setBikeLt1W] = useState(str(current?.bikeLt1W));
  const [runPace, setRunPace] = useState(pace(current?.runThresholdPaceSecPerKm));
  const [runLt1Pace, setRunLt1Pace] = useState(pace(current?.runLt1PaceSecPerKm));
  const [runLthr, setRunLthr] = useState(str(current?.runLthr));
  const [runPowerW, setRunPowerW] = useState(str(current?.runThresholdPowerW));
  const [css, setCss] = useState(pace(current?.cssPaceSecPer100m));
  const [swimLthr, setSwimLthr] = useState(str(current?.swimLthr));

  const save = () => {
    setError(null);
    const runPaceSec = parseOptionalPace(runPace);
    const runLt1Sec = parseOptionalPace(runLt1Pace);
    const cssSec = parseOptionalPace(css);
    if (runPaceSec === false || runLt1Sec === false || cssSec === false) {
      setError("Paces must be m:ss (e.g. 4:30)");
      return;
    }
    startSave(async () => {
      try {
        await saveThresholds({
          athleteId,
          effectiveDate,
          maxHr: maxHr || undefined,
          ftpW: ftpW || undefined,
          bikeLthr: bikeLthr || undefined,
          bikeLt1W: bikeLt1W || undefined,
          runThresholdPaceSecPerKm: runPaceSec ?? undefined,
          runLt1PaceSecPerKm: runLt1Sec ?? undefined,
          runLthr: runLthr || undefined,
          runThresholdPowerW: runPowerW || undefined,
          cssPaceSecPer100m: cssSec ?? undefined,
          swimLthr: swimLthr || undefined,
        });
        setOpen(false);
        router.refresh();
      } catch {
        setError("Could not save thresholds");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil size={14} /> Edit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit thresholds</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Effective date" type="date" value={effectiveDate} onChange={setEffectiveDate} />
            <Field label="Max HR (bpm)" value={maxHr} onChange={setMaxHr} inputMode="numeric" placeholder="190" />
          </div>
          <FieldGroup label="Bike">
            <Field label="FTP (W)" value={ftpW} onChange={setFtpW} inputMode="numeric" placeholder="250" />
            <Field label="LT1 (W)" value={bikeLt1W} onChange={setBikeLt1W} inputMode="numeric" placeholder="180" />
            <Field label="LTHR (bpm)" value={bikeLthr} onChange={setBikeLthr} inputMode="numeric" placeholder="165" />
          </FieldGroup>
          <FieldGroup label="Run">
            <Field label="LT2 pace (/km)" value={runPace} onChange={setRunPace} placeholder="4:30" />
            <Field label="LT1 pace (/km)" value={runLt1Pace} onChange={setRunLt1Pace} placeholder="5:10" />
            <Field label="LTHR (bpm)" value={runLthr} onChange={setRunLthr} inputMode="numeric" placeholder="170" />
            <Field label="Power (W)" value={runPowerW} onChange={setRunPowerW} inputMode="numeric" placeholder="280" />
          </FieldGroup>
          <FieldGroup label="Swim">
            <Field label="CSS pace (/100m)" value={css} onChange={setCss} placeholder="1:45" />
            <Field label="LTHR (bpm)" value={swimLthr} onChange={setSwimLthr} inputMode="numeric" placeholder="160" />
          </FieldGroup>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save thresholds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const pace = (v: number | null | undefined) =>
  v == null ? "" : formatPaceSeconds(v);

// "" → null (clear), invalid → false, otherwise seconds.
function parseOptionalPace(input: string): number | null | false {
  const s = input.trim();
  if (!s) return null;
  const sec = parsePaceInput(s);
  return sec == null ? false : sec;
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border p-3">
      <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode = "text",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border bg-background px-2 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-ring"
      />
    </label>
  );
}
