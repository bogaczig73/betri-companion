import type { ReactNode } from "react";

// Renderer for library answers. The model is instructed to use simple
// Markdown (paragraphs, flat lists, bold, inline code); this covers exactly
// that subset without a markdown dependency. Citation markers survive
// parsing as private-use-area sentinels (U+E000 n U+E001) because the
// citations API splits text mid-construct — blocks are concatenated first
// and parsed as one document.

export const CITE_OPEN = "\uE000";
export const CITE_CLOSE = "\uE001";

export type AnswerRef = {
  n: number;
  paperTitle: string;
  pageLabel: string;
  citedText: string;
};

// Appends citation markers to a block's text, keeping them ahead of any
// trailing newlines so a marker never starts its own paragraph.
export function withCiteMarkers(text: string, ns: number[]): string {
  if (ns.length === 0) return text;
  const marks = ns.map((n) => `${CITE_OPEN}${n}${CITE_CLOSE}`).join("");
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return text.slice(0, text.length - trailing.length) + marks + trailing;
}

function CiteSup({ r }: { r: AnswerRef }) {
  return (
    <sup
      title={`${r.paperTitle}, ${r.pageLabel}: “${r.citedText.slice(0, 300)}”`}
      className="ml-0.5 cursor-help font-medium text-primary"
    >
      [{r.n}]
    </sup>
  );
}

const INLINE_RE =
  /\uE000(\d+)\uE001|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;

function renderInline(
  text: string,
  refs: AnswerRef[],
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1] !== undefined) {
      const r = refs[Number(m[1]) - 1];
      if (r) nodes.push(<CiteSup key={key} r={r} />);
    } else if (m[2] !== undefined) {
      // Bold content can itself contain citation sentinels.
      nodes.push(<strong key={key}>{renderInline(m[2], refs, key)}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1 font-mono text-[0.85em]"
        >
          {renderInline(m[3], refs, key)}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key}>{renderInline(m[4], refs, key)}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Group =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;

export function AnswerMarkdown({
  source,
  refs,
}: {
  source: string;
  refs: AnswerRef[];
}) {
  const groups: Group[] = [];
  const last = () => groups[groups.length - 1];

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = line.match(BULLET_RE);
    const numbered = bullet ? null : line.match(NUMBERED_RE);
    if (line.trim() === "") {
      // Blank line closes whatever group is open (consecutive blanks fold).
      const g = last();
      if (g && !(g.kind === "p" && g.lines.length === 0)) {
        groups.push({ kind: "p", lines: [] });
      }
    } else if (bullet || numbered) {
      const kind = bullet ? ("ul" as const) : ("ol" as const);
      const item = (bullet ?? numbered)![1];
      const g = last();
      if (g?.kind === kind) g.items.push(item);
      else groups.push({ kind, items: [item] });
    } else {
      const g = last();
      if (g?.kind === "p") g.lines.push(line);
      else groups.push({ kind: "p", lines: [line] });
    }
  }

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {groups.map((g, i) => {
        if (g.kind === "p") {
          const text = g.lines.join(" ").trim();
          if (!text) return null;
          return <p key={i}>{renderInline(text, refs, `g${i}`)}</p>;
        }
        const List = g.kind === "ul" ? "ul" : "ol";
        return (
          <List
            key={i}
            className={
              g.kind === "ul"
                ? "list-disc space-y-1 pl-5"
                : "list-decimal space-y-1 pl-5"
            }
          >
            {g.items.map((item, j) => (
              <li key={j}>{renderInline(item, refs, `g${i}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
