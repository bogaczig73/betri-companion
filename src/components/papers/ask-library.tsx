"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import {
  AnswerMarkdown,
  withCiteMarkers,
  type AnswerRef,
} from "@/components/papers/answer-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LibraryAnswer, LibraryCitation } from "@/lib/paper-qa";

type RefEntry = AnswerRef & { paperId: string };

function pageLabel(c: { startPage: number; endPage: number }) {
  // end_page_number is exclusive in the citations API.
  const last = c.endPage - 1;
  return last > c.startPage ? `pp. ${c.startPage}–${last}` : `p. ${c.startPage}`;
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

  // Number citations in reading order, deduping identical passages, and
  // stitch the answer blocks back into one markdown source with citation
  // markers embedded where each cited block ends.
  const refs: RefEntry[] = [];
  const refByKey = new Map<string, RefEntry>();
  const refFor = (c: LibraryCitation): RefEntry => {
    const key = `${c.paperId}:${c.startPage}:${c.endPage}:${c.citedText}`;
    let entry = refByKey.get(key);
    if (!entry) {
      entry = {
        n: refs.length + 1,
        paperId: c.paperId,
        paperTitle: c.paperTitle,
        pageLabel: pageLabel(c),
        citedText: c.citedText,
      };
      refs.push(entry);
      refByKey.set(key, entry);
    }
    return entry;
  };
  const source = (answer?.blocks ?? [])
    .map((block) =>
      withCiteMarkers(
        block.text,
        block.citations.map((c) => refFor(c).n),
      ),
    )
    .join("");

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
          <AnswerMarkdown source={source} refs={refs} />

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
                    , {r.pageLabel}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Sources consulted:{" "}
            {answer.papers
              .map((p) => `${p.title}${p.year ? ` (${p.year})` : ""}`)
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
