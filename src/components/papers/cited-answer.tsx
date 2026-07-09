"use client";

import {
  AnswerMarkdown,
  withCiteMarkers,
  type AnswerRef,
} from "@/components/papers/answer-markdown";
import type { LibraryAnswer, LibraryCitation } from "@/lib/citations";

// Renders a grounded answer: markdown with [n] citation superscripts, the
// numbered citation list (page-linked), and the consulted-sources line.
// Shared by the library Q&A and the workout/test analysis panels.

type RefEntry = AnswerRef & { paperId: string };

function pageLabel(c: { startPage: number; endPage: number }) {
  // end_page_number is exclusive in the citations API.
  const last = c.endPage - 1;
  return last > c.startPage ? `pp. ${c.startPage}–${last}` : `p. ${c.startPage}`;
}

export function CitedAnswer({ answer }: { answer: LibraryAnswer }) {
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
  const source = answer.blocks
    .map((block) =>
      withCiteMarkers(
        block.text,
        block.citations.map((c) => refFor(c).n),
      ),
    )
    .join("");

  return (
    <div className="space-y-3">
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
  );
}
