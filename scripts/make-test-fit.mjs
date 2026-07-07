// Generates synthetic .fit activity files for testing the upload pipeline.
// Usage: node scripts/make-test-fit.mjs <outDir>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Decoder, Encoder, Profile, Stream } from "@garmin/fitsdk";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

function makeFit({ fileName, sport, subSport, startTime, timerSec, distanceM, avgHr, maxHr, avgPower, tss }) {
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: "activity",
    manufacturer: "development",
    product: 0,
    timeCreated: startTime,
    serialNumber: 12345678,
  });
  encoder.onMesg(Profile.MesgNum.SESSION, {
    timestamp: new Date(startTime.getTime() + timerSec * 1000),
    startTime,
    totalElapsedTime: timerSec,
    totalTimerTime: timerSec,
    sport,
    ...(subSport ? { subSport } : {}),
    ...(distanceM ? { totalDistance: distanceM } : {}),
    ...(avgHr ? { avgHeartRate: avgHr } : {}),
    ...(maxHr ? { maxHeartRate: maxHr } : {}),
    ...(avgPower ? { avgPower } : {}),
    ...(tss ? { trainingStressScore: tss } : {}),
  });
  encoder.onMesg(Profile.MesgNum.ACTIVITY, {
    timestamp: new Date(startTime.getTime() + timerSec * 1000),
    totalTimerTime: timerSec,
    numSessions: 1,
    type: "manual",
  });
  const bytes = encoder.close();

  // Self-verify: decode what we just encoded.
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  const { messages, errors } = decoder.read();
  const session = messages.sessionMesgs?.[0];
  if (errors.length > 0 || !session) {
    throw new Error(`Self-check failed for ${fileName}: ${errors.join(", ")}`);
  }
  const path = join(outDir, fileName);
  writeFileSync(path, bytes);
  console.log(
    `${path}: sport=${session.sport} start=${session.startTime?.toISOString?.()} timer=${session.totalTimerTime}s dist=${session.totalDistance ?? "-"}m avgHr=${session.avgHeartRate ?? "-"}`,
  );
}

// 1. A run yesterday — no planned workout on that date → creates a new workout.
makeFit({
  fileName: "morning-run.fit",
  sport: "running",
  subSport: "street",
  startTime: new Date("2026-07-06T06:30:00Z"),
  timerSec: 45 * 60 + 12,
  distanceM: 10240,
  avgHr: 148,
  maxHr: 167,
  tss: 62.4,
});

// 2. A ride on 2026-07-25 — Jonas has a planned "Long ride Z2" (bike) that
//    day from the assigned plan → should reconcile, not duplicate.
makeFit({
  fileName: "saturday-ride.fit",
  sport: "cycling",
  subSport: "road",
  startTime: new Date("2026-07-25T08:00:00Z"),
  timerSec: 3 * 3600 + 240,
  distanceM: 91500,
  avgHr: 138,
  maxHr: 165,
  avgPower: 205,
  tss: 168.2,
});

// 3. A strength session — maps to our "strength" sport.
makeFit({
  fileName: "gym-session.fit",
  sport: "training",
  subSport: "strengthTraining",
  startTime: new Date("2026-07-05T17:00:00Z"),
  timerSec: 52 * 60,
  avgHr: 112,
  maxHr: 141,
});
