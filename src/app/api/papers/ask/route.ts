import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiConfigured } from "@/lib/ai";
import { answerFromLibrary } from "@/lib/paper-qa";
import { getActingUser } from "@/lib/acting-user";

// Two model calls (triage + grounded answer over full PDFs) — allow time.
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(2000),
});

export async function POST(request: Request) {
  const actingUser = await getActingUser();
  if (!actingUser) {
    return NextResponse.json({ error: "No acting user" }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  }

  try {
    const answer = await answerFromLibrary(parsed.data.question);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to answer" },
      { status: 500 },
    );
  }
}
