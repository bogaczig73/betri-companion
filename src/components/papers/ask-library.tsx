"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LibraryAnswer } from "@/lib/paper-qa";

type RefEntry = {
  n: number;
  paperId: string;
  paperTitle: string;
  startPage: number;
  endPage: number;
  citedText: string;
};

function pageLabel(r: { startPage: number; endPage: number }) {
  // end_page_number is exclusive in the citations API.
  const last = r.endPage - 1;
  return last > r.startPage ? `pp. ${r.startPage}–${last}` : `p. ${r.startPage}`;
}

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

  // Number citations in reading order, deduping identical passages.
  const refs: RefEntry[] = [];
  const refKey = (c: Omit<RefEntry, "n">) =>
    `${c.paperId}:${c.startPage}:${c.endPage}:${c.citedText}`;
  const refByKey = new Map<string, RefEntry>();
  const blockRefs: RefEntry[][] = (answer?.blocks ?? []).map((block) =>
    block.citations.map((c) => {
      const key = refKey(c);
      let entry = refByKey.get(key);
      if (!entry) {
        entry = { n: refs.length + 1, ...c };
        refs.push(entry);
        refByKey.set(key, entry);
      }
      return entry;
    }),
  );

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
        <div className="space-y-3 rounded-md border p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {answer.blocks.map((block, i) => (
              <span key={i}>
                {block.text}
                {blockRefs[i].map((r) => (
                  <sup
                    key={r.n}
                    title={`${r.paperTitle}, ${pageLabel(r)}: “${r.citedText.slice(0, 300)}”`}
                    className="ml-0.5 cursor-help font-medium text-primary"
                  >
                    [{r.n}]
                  </sup>
                ))}
              </span>
            ))}
          </p>

          {refs.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Citations
              </p>
              <ol className="space-y-1 text-xs text-muted-foreground">
                {refs.map((r) => (
                  <li key={r.n}>
                    [{r.n}]{" "}
                    <a
                      href={`/api/papers/${r.paperId}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {r.paperTitle}
                    </a>
                    , {pageLabel(r)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Sources consulted:{" "}
            {answer.papers
              .map(
                (p) =>
                  `${p.title}${p.year ? ` (${p.year})` : ""}`,
              )
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
