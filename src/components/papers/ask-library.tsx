"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { CitedAnswer } from "@/components/papers/cited-answer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LibraryAnswer } from "@/lib/citations";

export function AskLibrary({ disabled }: { disabled?: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<LibraryAnswer | null>(null);

  async function ask() {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/papers/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to answer");
      else setAnswer(data.answer);
    } catch {
      setError("Failed to answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="e.g. How should low-intensity volume be distributed for a half-distance triathlete?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
        }}
        rows={2}
        disabled={disabled || busy}
      />
      <div className="flex items-center gap-2">
        <Button onClick={ask} disabled={disabled || busy || question.trim().length < 3}>
          <Sparkles className="size-3.5" />
          {busy ? "Reading papers…" : "Ask"}
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            Selecting relevant papers and answering with citations — up to a
            minute.
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {answer && (
        <div className="rounded-md border p-4">
          <CitedAnswer answer={answer} />
        </div>
      )}
    </div>
  );
}
