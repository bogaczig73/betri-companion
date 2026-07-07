import { createHash } from "node:crypto";

import { toFile } from "@anthropic-ai/sdk";
import { del, get, put } from "@vercel/blob";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { sciencePapers, type SciencePaper } from "@/db/schema";
import { AI_MODEL, FILES_API_BETA, getAnthropic, isAiConfigured } from "@/lib/ai";

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function getPapers(): Promise<SciencePaper[]> {
  return db
    .select()
    .from(sciencePapers)
    .where(isNull(sciencePapers.deletedAt))
    .orderBy(desc(sciencePapers.createdAt));
}

export async function getPaperById(id: string): Promise<SciencePaper | null> {
  const [paper] = await db
    .select()
    .from(sciencePapers)
    .where(and(eq(sciencePapers.id, id), isNull(sciencePapers.deletedAt)))
    .limit(1);
  return paper ?? null;
}

export type PaperIngestResult = {
  fileName: string;
  status: "added" | "duplicate" | "error";
  message: string;
  paperId?: string;
};

// Registers one uploaded PDF: dedupe on content hash, store the original in
// Vercel Blob, then hand off to processPaper for the Anthropic side. A paper
// row is created even when processing fails, so the pipeline can be retried
// from the UI once the cause (usually a missing env var) is fixed.
export async function ingestPaper({
  bytes,
  fileName,
  uploadedById,
}: {
  bytes: ArrayBuffer;
  fileName: string;
  uploadedById: string;
}): Promise<PaperIngestResult> {
  const sha256 = createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex");

  const [existing] = await db
    .select({ id: sciencePapers.id, deletedAt: sciencePapers.deletedAt })
    .from(sciencePapers)
    .where(eq(sciencePapers.sha256, sha256))
    .limit(1);
  if (existing && !existing.deletedAt) {
    return {
      fileName,
      status: "duplicate",
      message: "Already in the library",
      paperId: existing.id,
    };
  }

  const pathname = `papers/${sha256}.pdf`;
  const blob = await put(pathname, bytes, {
    access: "private",
    contentType: "application/pdf",
    allowOverwrite: true,
  });

  const values = {
    uploadedById,
    title: fileName.replace(/\.pdf$/i, ""),
    fileName,
    fileSizeBytes: bytes.byteLength,
    sha256,
    blobPathname: blob.pathname,
    blobUrl: blob.url,
    status: "processing" as const,
    statusMessage: null,
    deletedAt: null,
  };

  // Re-uploading a previously deleted paper revives the same row (sha256 is
  // globally unique), so history and the blob pathname stay consistent.
  const [paper] = existing
    ? await db
        .update(sciencePapers)
        .set(values)
        .where(eq(sciencePapers.id, existing.id))
        .returning()
    : await db.insert(sciencePapers).values(values).returning();

  const processed = await processPaper(paper.id, bytes);
  return {
    fileName,
    status: "added",
    message:
      processed.status === "ready"
        ? "Added to the library"
        : `Stored, but processing failed: ${processed.statusMessage}`,
    paperId: paper.id,
  };
}

// Structured-output schema for bibliographic metadata extraction.
const METADATA_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    authors: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Comma-separated author list, or null if unknown",
    },
    year: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "Publication year",
    },
    journal: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Journal or venue name",
    },
    abstract: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "The paper's abstract verbatim; if the paper has none, a 3-5 sentence summary of its scope and findings",
    },
  },
  required: ["title", "authors", "year", "journal", "abstract"],
  additionalProperties: false,
} as const;

type ExtractedMetadata = {
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  abstract: string | null;
};

// Anthropic side of the pipeline: register the PDF with the Files API (once)
// and extract metadata with the model. Idempotent — safe to re-run on failed
// papers. Bytes are fetched from Blob when not passed in (retry path).
export async function processPaper(
  paperId: string,
  bytes?: ArrayBuffer,
): Promise<SciencePaper> {
  const paper = await getPaperById(paperId);
  if (!paper) throw new Error("Paper not found");

  const fail = async (message: string) => {
    const [updated] = await db
      .update(sciencePapers)
      .set({ status: "failed", statusMessage: message })
      .where(eq(sciencePapers.id, paperId))
      .returning();
    return updated;
  };

  if (!isAiConfigured()) {
    return fail("ANTHROPIC_API_KEY is not configured");
  }

  try {
    const client = getAnthropic();

    let fileId = paper.anthropicFileId;
    if (!fileId) {
      let data = bytes;
      if (!data) {
        const result = await get(paper.blobPathname, { access: "private" });
        if (!result || result.statusCode !== 200) {
          return fail("Could not fetch the PDF from Blob storage");
        }
        data = await new Response(result.stream).arrayBuffer();
      }
      const uploaded = await client.beta.files.upload({
        file: await toFile(Buffer.from(data), paper.fileName, {
          type: "application/pdf",
        }),
        betas: [FILES_API_BETA],
      });
      fileId = uploaded.id;
      await db
        .update(sciencePapers)
        .set({ anthropicFileId: fileId })
        .where(eq(sciencePapers.id, paperId));
    }

    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      betas: [FILES_API_BETA],
      output_config: {
        format: {
          type: "json_schema",
          schema: METADATA_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: fileId } },
            {
              type: "text",
              text: "Extract the bibliographic metadata of this scientific paper.",
            },
          ],
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return fail("Metadata extraction returned no text");
    const meta = JSON.parse(text) as ExtractedMetadata;

    const [updated] = await db
      .update(sciencePapers)
      .set({
        title: meta.title || paper.title,
        authors: meta.authors,
        year: meta.year,
        journal: meta.journal,
        abstract: meta.abstract,
        status: "ready",
        statusMessage: null,
      })
      .where(eq(sciencePapers.id, paperId))
      .returning();
    return updated;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Processing failed");
  }
}

// Soft-deletes the row and best-effort removes the stored copies (Blob +
// Anthropic Files). External cleanup failures don't block the delete.
export async function removePaper(paperId: string): Promise<void> {
  const paper = await getPaperById(paperId);
  if (!paper) return;

  await db
    .update(sciencePapers)
    .set({ deletedAt: new Date() })
    .where(eq(sciencePapers.id, paperId));

  try {
    if (isBlobConfigured()) await del(paper.blobUrl);
  } catch {
    // Blob copy left behind; harmless, reachable via pathname if re-added.
  }
  try {
    if (paper.anthropicFileId && isAiConfigured()) {
      await getAnthropic().beta.files.delete(paper.anthropicFileId, {
        betas: [FILES_API_BETA],
      });
    }
  } catch {
    // Files API copy left behind; re-processing would upload a fresh one.
  }
}
