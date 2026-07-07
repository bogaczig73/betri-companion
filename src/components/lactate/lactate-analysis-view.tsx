"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  analyzeLactate,
  sportIntensity,
  summarise,
  type Consensus,
  type LactateBaseline,
  type LactateSport,
  type SportResult,
  type StepInput,
} from "@/lib/lactate";

import { LactateChart, type ChartMarker } from "./lactate-chart";

const LT1_COLOR = "#2563eb"; // blue — aerobic
const LT2_COLOR = "#ea580c"; // orange — anaerobic

// Matched LT1/LT2 method pairs for the "Method set" quick selector.
const PAIRS = [
  { value: "consensus", label: "Consensus (median)", lt1: "Consensus", lt2: "Consensus" },
  { value: "obla", label: "OBLA (2.0 / 4.0)", lt1: "OBLA 2.0", lt2: "OBLA 4.0" },
  { value: "ltp", label: "LTP (LTP1 / LTP2)", lt1: "LTP1", lt2: "LTP2" },
];

export function LactateAnalysisView({
  sport,
  steps,
  baseline = null,
}: {
  sport: LactateSport;
  steps: StepInput[];
  baseline?: LactateBaseline | null;
}) {
  const si = sportIntensity(sport);
  const [fit, setFit] = useState<
    "3rd degree polynomial" | "4th degree polynomial"
  >("3rd degree polynomial");
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [lt1Source, setLt1Source] = useState("Consensus");
  const [lt2Source, setLt2Source] = useState("Consensus");

  const analysis = useMemo(
    () => analyzeLactate(sport, steps, baseline, { fit }),
    [sport, steps, baseline, fit],
  );

  if (analysis.usable < 3) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Add at least 3 steps with both intensity and lactate to compute
        thresholds.
      </p>
    );
  }

  const isSelected = (m: string) => !deselected.has(m);
  const toggle = (m: string) =>
    setDeselected((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  const toggleAll = (rows: SportResult[]) =>
    setDeselected((s) => {
      const n = new Set(s);
      const allOn = rows.every((r) => !n.has(r.method));
      rows.forEach((r) => (allOn ? n.add(r.method) : n.delete(r.method)));
      return n;
    });

  const lt1Rows = analysis.results.filter((r) => r.estimates === "LT1");
  const lt2Rows = analysis.results.filter((r) => r.estimates === "LT2");

  const sourced = (rows: SportResult[], source: string): Consensus | null =>
    source === "Consensus"
      ? summarise(sport, rows.filter((r) => isSelected(r.method)))
      : asConsensus(si, rows.find((r) => r.method === source));

  const lt1 = sourced(lt1Rows, lt1Source);
  const lt2 = sourced(lt2Rows, lt2Source);

  const lt1Names = new Set(lt1Rows.map((r) => r.method));
  const lt2Names = new Set(lt2Rows.map((r) => r.method));
  const pairs = PAIRS.filter(
    (p) =>
      (p.lt1 === "Consensus" || lt1Names.has(p.lt1)) &&
      (p.lt2 === "Consensus" || lt2Names.has(p.lt2)),
  );
  const currentPair =
    pairs.find((p) => p.lt1 === lt1Source && p.lt2 === lt2Source)?.value ??
    "custom";
  const applyPair = (value: string) => {
    const p = pairs.find((x) => x.value === value);
    if (!p) return;
    setLt1Source(p.lt1);
    setLt2Source(p.lt2);
  };

  const markers: ChartMarker[] = [];
  if (lt1)
    markers.push({
      label: "LT1",
      intensity: lt1.intensity,
      lactate: lt1.lactate,
      color: LT1_COLOR,
    });
  if (lt2)
    markers.push({
      label: "LT2",
      intensity: lt2.intensity,
      lactate: lt2.lactate,
      color: LT2_COLOR,
    });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Method set
        </span>
        <Dropdown value={currentPair} onChange={applyPair} className="min-w-0 flex-1">
          {pairs.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {currentPair === "custom" ? (
            <option value="custom" disabled>
              Custom (per-card)
            </option>
          ) : null}
        </Dropdown>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          title="LT1 · aerobic"
          color={LT1_COLOR}
          c={lt1}
          source={lt1Source}
          methods={lt1Rows.map((r) => r.method)}
          onSource={setLt1Source}
        />
        <SummaryCard
          title="LT2 · anaerobic"
          color={LT2_COLOR}
          c={lt2}
          source={lt2Source}
          methods={lt2Rows.map((r) => r.method)}
          onSource={setLt2Source}
        />
      </div>

      <LactateChart points={analysis.points} markers={markers} si={si} />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Curve fit
        </span>
        <div className="flex overflow-hidden rounded-full border">
          {(
            [
              ["3rd degree polynomial", "3rd"],
              ["4th degree polynomial", "4th"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFit(value)}
              aria-pressed={fit === value}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                fit === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {analysis.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tap a method to include or exclude it from the LT1 / LT2 summary above.
      </p>

      <div className="flex flex-col gap-3">
        <MethodGroup
          title="LT1 estimates"
          rows={lt1Rows}
          color={LT1_COLOR}
          intensityLabel={si.valueLabel}
          isSelected={isSelected}
          onToggle={toggle}
          onToggleAll={() => toggleAll(lt1Rows)}
        />
        <MethodGroup
          title="LT2 estimates"
          rows={lt2Rows}
          color={LT2_COLOR}
          intensityLabel={si.valueLabel}
          isSelected={isSelected}
          onToggle={toggle}
          onToggleAll={() => toggleAll(lt2Rows)}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Each method applies a different definition of &ldquo;threshold&rdquo; to
        the same curve, so they intentionally disagree. Use them side by side —
        no single value is the &ldquo;true&rdquo; one. Validated against the
        lactater reference package.
      </p>
    </div>
  );
}

function Dropdown({
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full cursor-pointer appearance-none truncate rounded-md border bg-background py-1.5 pl-2.5 pr-8 text-xs font-semibold outline-none transition-colors hover:border-muted-foreground focus:border-ring"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

function asConsensus(
  si: ReturnType<typeof sportIntensity>,
  r: SportResult | undefined,
): Consensus | null {
  if (!r || r.value == null || !Number.isFinite(r.intensity)) return null;
  return {
    intensity: r.intensity,
    value: r.value,
    valueLabel: si.formatValue(r.value),
    lactate: r.lactate,
    heartRate: r.heartRate,
  };
}

function SummaryCard({
  title,
  color,
  c,
  source,
  methods,
  onSource,
}: {
  title: string;
  color: string;
  c: Consensus | null;
  source: string;
  methods: string[];
  onSource: (s: string) => void;
}) {
  return (
    <div
      className="rounded-lg border bg-card p-3"
      style={{ borderTopWidth: 2, borderTopColor: color }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <Dropdown
        value={source}
        onChange={onSource}
        ariaLabel={`${title} source`}
        className="mt-1"
      >
        <option value="Consensus">Consensus (median)</option>
        {methods.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Dropdown>
      {c ? (
        <>
          <div className="mt-2 text-2xl font-bold leading-none tabular-nums">
            {c.valueLabel}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {c.heartRate != null ? `${c.heartRate} bpm · ` : ""}
            {c.lactate.toFixed(2)} mmol/L
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

function MethodGroup({
  title,
  rows,
  color,
  intensityLabel,
  isSelected,
  onToggle,
  onToggleAll,
}: {
  title: string;
  rows: SportResult[];
  color: string;
  intensityLabel: string;
  isSelected: (m: string) => boolean;
  onToggle: (m: string) => void;
  onToggleAll: () => void;
}) {
  if (rows.length === 0) return null;
  const selectedCount = rows.filter((r) => isSelected(r.method)).length;
  const allOn = selectedCount === rows.length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {selectedCount}/{rows.length}
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {allOn ? "None" : "All"}
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1.25rem_1fr_auto_auto_auto] items-center gap-x-3 bg-muted/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Method</span>
          <span className="text-right">{intensityLabel}</span>
          <span className="text-right">HR</span>
          <span className="text-right">Lac</span>
        </div>
        <ul className="divide-y">
          {rows.map((r) => {
            const on = isSelected(r.method);
            return (
              <li key={r.method}>
                <button
                  type="button"
                  onClick={() => onToggle(r.method)}
                  aria-pressed={on}
                  className={cn(
                    "grid w-full grid-cols-[1.25rem_1fr_auto_auto_auto] items-center gap-x-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                    !on && "opacity-45",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                      on ? "text-white" : "",
                    )}
                    style={
                      on ? { backgroundColor: color, borderColor: color } : undefined
                    }
                  >
                    {on ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                  <span className="flex items-center gap-1.5 truncate">
                    {r.warnings.length ? (
                      <AlertTriangle size={12} className="shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{r.method}</span>
                  </span>
                  <span className="text-right font-mono font-semibold tabular-nums">
                    {r.valueLabel}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {r.heartRate != null ? Math.round(r.heartRate) : "—"}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {r.lactate.toFixed(1)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
