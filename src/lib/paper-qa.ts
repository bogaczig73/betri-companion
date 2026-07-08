import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { sciencePapers } from "@/db/schema";
import {
  AI_MODEL,
  AI_MODEL_LIGHT,
  FILES_API_BETA,
  getAnthropic,
} from "@/lib/ai";

// ---------------------------------------------------------------------------
// Retrieval interface
//
// Current strategy: give Claude a compact catalog (title + abstract) and let
// it pick which papers to read in full via the Files API. When the library
// outgrows this (~30-50 papers), swap selectPapers for a pgvector similarity
// search over paper_chunks — callers only see CatalogEntry[] in, subset out.
// ---------------------------------------------------------------------------

export type CatalogEntry = {
  id: string;
  anthropicFileId: string;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  abstract: string | null;
};

// Papers that can be attached to an analysis call (processed, registered
// with the Files API).
export async function getPaperCatalog(): Promise<CatalogEntry[]> {
  const rows = await db
    .select({
      id: sciencePapers.id,
      anthropicFileId: sciencePapers.anthropicFileId,
      title: sciencePapers.title,
      authors: sciencePapers.authors,
      year: sciencePapers.year,
      journal: sciencePapers.journal,
      abstract: sciencePapers.abstract,
    })
    .from(sciencePapers)
    .where(
      and(
        isNull(sciencePapers.deletedAt),
        eq(sciencePapers.status, "ready"),
        isNotNull(sciencePapers.anthropicFileId),
      ),
    );
  return rows as CatalogEntry[];
}

// Attaching every paper to every call would blow past request limits and
// waste cache space, so above this count Claude triages the catalog first.
const MAX_ATTACHED_PAPERS = 5;

const SELECTION_SCHEMA = {
  type: "object",
  properties: {
    paper_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "IDs of the papers relevant to the question, most relevant first. At most 5. Empty if none are relevant.",
    },
  },
  required: ["paper_ids"],
  additionalProperties: false,
} as const;

async function selectPapers(
  question: string,
  catalog: CatalogEntry[],
): Promise<CatalogEntry[]> {
  if (catalog.length <= MAX_ATTACHED_PAPERS) return catalog;

  const client = getAnthropic();
  const listing = catalog
    .map(
      (p) =>
        `id: ${p.id}\ntitle: ${p.title}${p.authors ? `\nauthors: ${p.authors}` : ""}${p.year ? `\nyear: ${p.year}` : ""}\nabstract: ${p.abstract ?? "(none)"}`,
    )
    .join("\n---\n");

  const response = await client.messages.create({
    model: AI_MODEL_LIGHT,
    max_tokens: 1024,
    output_config: {
      format: {
        type: "json_schema",
        schema: SELECTION_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: "user",
        content: `You triage a library of sports-science papers for a triathlon coaching app. Pick the papers most relevant to the question below (at most ${MAX_ATTACHED_PAPERS}).\n\n<catalog>\n${listing}\n</catalog>\n\n<question>\n${question}\n</question>`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  let ids: string[] = [];
  try {
    ids = (JSON.parse(text) as { paper_ids: string[] }).paper_ids ?? [];
  } catch {
    ids = [];
  }
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const selected = ids
    .map((id) => byId.get(id))
    .filter((p): p is CatalogEntry => Boolean(p))
    .slice(0, MAX_ATTACHED_PAPERS);
  // A bad selection shouldn't produce an unanswerable call — fall back to the
  // first few papers and let the answer call judge relevance itself.
  return selected.length > 0 ? selected : catalog.slice(0, MAX_ATTACHED_PAPERS);
}

// ---------------------------------------------------------------------------
// Grounded Q&A with native citations
// ---------------------------------------------------------------------------

export type LibraryCitation = {
  paperId: string;
  paperTitle: string;
  startPage: number;
  endPage: number;
  citedText: string;
};

export type AnswerBlock = { text: string; citations: LibraryCitation[] };

export type LibraryAnswer = {
  blocks: AnswerBlock[];
  papers: { id: string; title: string; authors: string | null; year: number | null }[];
};

const QA_SYSTEM = `You are a sports-science assistant inside a triathlon coaching app. Coaches ask questions and you answer grounded in the attached research papers.

Rules:
- Base every scientific claim on the attached papers so it carries a citation.
- When you add reasoning or practical interpretation beyond the papers, mark it clearly (e.g. "Beyond the papers: ..." ).
- If the papers don't address the question, say so plainly instead of speculating.
- Keep answers practical for a coach: concise paragraphs, concrete numbers from the papers where available.
- Format with simple Markdown only: short paragraphs, "- " bullet lists, numbered lists, **bold** and \`inline code\`. No tables, no headings, no nested lists, no links.`;

export async function answerFromLibrary(
  question: string,
): Promise<LibraryAnswer> {
  const catalog = await getPaperCatalog();
  if (catalog.length === 0) {
    throw new Error("No processed papers in the library yet");
  }

  const selected = await selectPapers(question, catalog);
  const client = getAnthropic();

  const documents: Anthropic.Beta.BetaContentBlockParam[] = selected.map(
    (p, i) => ({
      type: "document",
      source: { type: "file", file_id: p.anthropicFileId },
      title: p.title,
      citations: { enabled: true },
      // Cache the document prefix: repeat questions over the same selection
      // (the common case while a coach digs into a topic) skip re-reading.
      ...(i === selected.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    }),
  );

  // Sonnet 5 runs adaptive thinking by default (spend scales with question
  // difficulty), and thinking counts against max_tokens — keep headroom so
  // the visible answer never truncates.
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 8192,
    betas: [FILES_API_BETA],
    system: QA_SYSTEM,
    messages: [
      {
        role: "user",
        content: [...documents, { type: "text", text: question }],
      },
    ],
  });

  const blocks: AnswerBlock[] = [];
  for (const block of response.content) {
    if (block.type !== "text") continue;
    const citations: LibraryCitation[] = [];
    for (const c of block.citations ?? []) {
      if (c.type !== "page_location") continue;
      const paper = selected[c.document_index];
      if (!paper) continue;
      citations.push({
        paperId: paper.id,
        paperTitle: paper.title,
        startPage: c.start_page_number,
        endPage: c.end_page_number,
        citedText: c.cited_text,
      });
    }
    blocks.push({ text: block.text, citations });
  }

  return {
    blocks,
    papers: selected.map((p) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
    })),
  };
}
