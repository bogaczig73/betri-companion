"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setTestBaseline } from "@/app/actions/lactate";
import { formatPaceSeconds, parsePaceInput } from "@/lib/format";
import { sportIntensity, type LactateBaseline, type LactateSport } from "@/lib/lactate";

// Resting / warm-up point. Supplies the baseline lactate for the Bsln+ methods
// and, when "include in fit" is on, is fed as an extra low point into the curve.
export function BaselineEditor({
  testId,
  sport,
  baseline,
}: {
  testId: string;
  sport: LactateSport;
  baseline: LactateBaseline;
}) {
  const si = sportIntensity(sport);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();

  const [intensity, setIntensity] = useState(
    baseline.value == null
      ? ""
      : sport === "bike"
        ? String(baseline.value)
        : formatPaceSeconds(baseline.value),
  );
  const [lactate, setLactate] = useState(baseline.lactate?.toString() ?? "");
  const [include, setInclude] = useState(baseline.includeBaseline);

  const parseIntensity = (): number | null => {
    const s = intensity.trim();
    if (!s) return null;
    if (sport === "bike") {
      const n = Number(s);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    return parsePaceInput(s);
  };

  const save = () => {
    startSave(async () => {
      await setTestBaseline(testId, {
        baselineIntensityValue: parseIntensity() ?? "",
        baselineLactate: lactate === "" ? "" : Number(lactate),
        includeBaseline: include,
      });
      router.refresh();
      setOpen(false);
    });
  };

  const summary =
    baseline.lactate != null
      ? `${baseline.lactate.toFixed(2)} mmol/L${
          baseline.value != null ? ` @ ${si.formatValue(baseline.value)}` : ""
        }${baseline.includeBaseline ? " · in fit" : ""}`
      : "not set";

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <SlidersHorizontal size={15} className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Baseline
        </span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={`Resting ${si.valueLabel.toLowerCase()} ${si.valueUnit}`}
              value={intensity}
              placeholder={sport === "bike" ? "watts" : "m:ss"}
              onChange={setIntensity}
            />
            <Field
              label="Resting lactate"
              value={lactate}
              placeholder="mmol/L"
              inputMode="decimal"
              onChange={setLactate}
            />
          </div>
          <button
            type="button"
            onClick={() => setInclude((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                include ? "border-primary bg-primary text-primary-foreground" : ""
              }`}
            >
              {include ? <Check size={13} /> : null}
            </span>
            <span className="text-sm">Feed baseline point into the curve fit</span>
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full border py-2 text-xs font-semibold uppercase tracking-wide hover:bg-muted disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save baseline"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  inputMode = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "text" | "numeric" | "decimal";
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border bg-background px-2 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-ring"
      />
    </label>
  );
}
