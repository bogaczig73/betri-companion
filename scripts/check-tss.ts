// P6 verify: estimated TSS vs TrainingPeaks' TSS (workouts.load) on Radana's
// imported data. Recomputes with load hidden so the fallback chain is tested.
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { and, eq, isNull, isNotNull } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { users, workouts } = await import(
    "@/db/schema"
  );
  const { getThresholdHistory } = await import(
    "@/lib/thresholds"
  );
  const { pickThresholdsForDate } = await import(
    "@/lib/zones"
  );
  const { estimateActualTss } = await import(
    "@/lib/tss"
  );

  const [radana] = await db
    .select()
    .from(users)
    .where(eq(users.email, "radana@betri.test"));
  if (!radana) throw new Error("Radana not found");

  const history = await getThresholdHistory(radana.id);
  const rows = await db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.athleteId, radana.id),
        eq(workouts.status, "completed"),
        isNotNull(workouts.load),
        isNull(workouts.deletedAt),
      ),
    );

  const byMethod: Record<string, number[]> = {};
  let missing = 0;
  for (const w of rows) {
    if (!w.load) continue;
    const est = estimateActualTss(
      { ...w, load: null },
      pickThresholdsForDate(history, w.date),
    );
    if (!est) {
      missing++;
      continue;
    }
    const errPct = ((est.tss - w.load) / w.load) * 100;
    (byMethod[`${w.sport}/${est.method}`] ??= []).push(errPct);
  }

  console.log(`${rows.length} completed workouts with TP TSS; ${missing} inestimable`);
  for (const [key, errs] of Object.entries(byMethod).sort()) {
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)];
    const within15 = errs.filter((e) => Math.abs(e) <= 15).length;
    console.log(
      `${key.padEnd(14)} n=${String(errs.length).padStart(3)}  median ${median.toFixed(1).padStart(6)}%  within±15%: ${within15}/${errs.length}`,
    );
  }
}

main().then(() => process.exit(0));
