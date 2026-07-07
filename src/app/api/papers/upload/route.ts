import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getActingUser } from "@/lib/acting-user";
import {
  ingestPaper,
  isBlobConfigured,
  type PaperIngestResult,
} from "@/lib/papers";

// Files API upload + metadata extraction run inline; give the model room.
export const maxDuration = 300;

// Anthropic PDF request limit is 32 MB; stay under it.
const MAX_FILE_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  const actingUser = await getActingUser();
  if (!actingUser) {
    return NextResponse.json({ error: "No acting user" }, { status: 401 });
  }
  if (actingUser.role !== "coach") {
    return NextResponse.json(
      { error: "Only coaches manage the paper library" },
      { status: 403 },
    );
  }
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  const results: PaperIngestResult[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        fileName: file.name,
        status: "error",
        message: "File too large (max 30 MB)",
      });
      continue;
    }
    try {
      results.push(
        await ingestPaper({
          bytes: await file.arrayBuffer(),
          fileName: file.name,
          uploadedById: actingUser.id,
        }),
      );
    } catch (err) {
      results.push({
        fileName: file.name,
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  if (results.some((r) => r.status === "added")) {
    revalidatePath("/papers");
  }

  return NextResponse.json({ results });
}
