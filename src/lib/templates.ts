import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workoutTemplates, type WorkoutTemplate } from "@/db/schema";

export async function getTemplatesForUser(
  userId: string,
): Promise<WorkoutTemplate[]> {
  return db
    .select()
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.createdById, userId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .orderBy(asc(workoutTemplates.sport), asc(workoutTemplates.name));
}

export async function getTemplateById(
  id: string,
): Promise<WorkoutTemplate | null> {
  const [row] = await db
    .select()
    .from(workoutTemplates)
    .where(
      and(eq(workoutTemplates.id, id), isNull(workoutTemplates.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}
