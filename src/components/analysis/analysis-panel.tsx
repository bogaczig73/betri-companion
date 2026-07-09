"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteAnalysis } from "@/app/actions/analysis";
import { CitedAnswer } from "@/components/papers/cited-answer";
import { Button } from "@/components/ui/button";
import type { AnalysisView } from "@/lib/citations";

// Grounded AI analysis of one subject (a workout or a lactate test). Runs
// live via POST /api/analysis; every run is stored server-side, so the list
// here is history, newest first.

type Subject = { workoutId: string } | { lactateTestId: string };

export function AnalysisPanel({
  subject,
  initialAnalyses,
  disabledReason,
}: {
  subject: Subject;
  initialAnalyses: AnalysisView[];
  disabledReason?: string | null;
}) {
  const [analyses, setAnalyses] = useState<AnalysisView[]>(initialAnalyses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    if (busy || disabledReason) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subject),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Analysis failed");
      else setAnalyses((prev) => [data.analysis, ...prev]);
    } catch {
      setError("Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    if (!confirm("Delete this analysis?")) return;
    setAnalyses((prev) => prev.filter((a) => a.id !== id));
    startTransition(() => deleteAnalysis(id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={run} disabled={busy || Boolean(disabledReason)}>
          <Sparkles className="size-3.5" />
          {busy
            ? "Analyzing…"
            : analyses.length > 0
              ? "Run again"
              : "Run AI analysis"}
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            Selecting relevant papers and analyzing with citations — up to a
            minute.
          </span>
        )}
        {!busy && disabledReason && (
          <span className="text-xs text-muted-foreground">{disabledReason}</span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {analyses.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Claims marked [n] are backed by the cited paper; the{" "}
          <strong>Beyond the papers</strong> section is model inference, not
          cited science.
        </p>
      )}

      {analyses.map((a) => (
        <div key={a.id} className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {a.createdAt} · {a.model}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove(a.id)}
              aria-label="Delete analysis"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <CitedAnswer answer={a.content} />
        </div>
      ))}
    </div>
  );
}
