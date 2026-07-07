import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { processFitFile, type FitImportResult } from "@/lib/fit";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const actingUser = await getActingUser();
  if (!actingUser) {
    return NextResponse.json({ error: "No acting user" }, { status: 401 });
  }

  const formData = await request.formData();
  const athleteParse = z.uuid().safeParse(formData.get("athleteId"));
  if (!athleteParse.success) {
    return NextResponse.json({ error: "Invalid athleteId" }, { status: 400 });
  }
  const athleteId = athleteParse.data;

  if (!(await canAccessAthlete(actingUser, athleteId))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  const results: FitImportResult[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        fileName: file.name,
        status: "error",
        message: "File too large (max 25 MB)",
        workouts: [],
      });
      continue;
    }
    try {
      results.push(
        await processFitFile({
          bytes: await file.arrayBuffer(),
          fileName: file.name,
          athleteId,
          uploadedById: actingUser.id,
        }),
      );
    } catch (err) {
      results.push({
        fileName: file.name,
        status: "error",
        message: err instanceof Error ? err.message : "Import failed",
        workouts: [],
      });
    }
  }

  if (results.some((r) => r.status === "imported")) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({ results });
}
