import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getActingUser } from "@/lib/acting-user";
import { getPaperById, isBlobConfigured } from "@/lib/papers";

// The Blob store is private; PDFs are served through this authenticated
// proxy instead of exposing blob URLs.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actingUser = await getActingUser();
  if (!actingUser) {
    return NextResponse.json({ error: "No acting user" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const paper = await getPaperById(id);
  if (!paper) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const result = await get(paper.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${paper.fileName.replaceAll('"', "")}"`,
    },
  });
}
