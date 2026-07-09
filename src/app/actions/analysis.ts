"use server";

import { z } from "zod";

import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { getAnalysisById, removeAnalysis } from "@/lib/analysis";

// No revalidatePath: the analysis panel keeps the list in client state and
// prunes the deleted entry itself.
export async function deleteAnalysis(analysisId: string): Promise<void> {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  const id = z.uuid().parse(analysisId);
  const analysis = await getAnalysisById(id);
  if (!analysis) return;
  if (!(await canAccessAthlete(actingUser, analysis.athleteId))) {
    throw new Error("Forbidden");
  }
  await removeAnalysis(id);
}
