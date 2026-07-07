"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActingUser } from "@/lib/acting-user";
import { processPaper, removePaper } from "@/lib/papers";

async function authorizeCoach() {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  if (actingUser.role !== "coach") {
    throw new Error("Only coaches manage the paper library");
  }
  return actingUser;
}

export async function deletePaper(paperId: string): Promise<void> {
  await authorizeCoach();
  const id = z.uuid().parse(paperId);
  await removePaper(id);
  revalidatePath("/papers");
}

export type ReprocessState = { error?: string };

// Retries the Anthropic half of the pipeline (Files upload + metadata) for a
// paper stuck in "failed" — e.g. after ANTHROPIC_API_KEY is configured.
export async function reprocessPaper(paperId: string): Promise<ReprocessState> {
  await authorizeCoach();
  const id = z.uuid().parse(paperId);
  const paper = await processPaper(id);
  revalidatePath("/papers");
  return paper.status === "ready" ? {} : { error: paper.statusMessage ?? "Failed" };
}
