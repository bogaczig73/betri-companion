/**
 * Compact intensity histograms from FIT record messages. Pure.
 *
 * Instead of persisting per-second streams (~4k rows per workout), we keep
 * three small maps of bucket → seconds. They are enough to recompute
 * time-in-zones whenever an athlete's zones change:
 *   - hr:    key = exact bpm
 *   - power: key = 5 W bucket lower bound ("240" covers 240–244 W)
 *   - speed: key = 0.1 m/s bucket as integer tenths ("34" covers 3.4–3.5 m/s)
 */

export type FitRecord = {
  timestamp?: Date;
  heartRate?: number;
  power?: number;
  enhancedSpeed?: number;
  speed?: number;
};

export type Histograms = {
  hr: Record<string, number> | null;
  power: Record<string, number> | null;
  speed: Record<string, number> | null;
};

// Gaps longer than this (auto-pause, tunnel dropout) contribute nothing.
const MAX_SAMPLE_GAP_SEC = 10;

export function buildHistograms(records: FitRecord[]): Histograms {
  const hr: Record<string, number> = {};
  const power: Record<string, number> = {};
  const speed: Record<string, number> = {};

  const stamped = records.filter((r) => r.timestamp instanceof Date);
  for (let i = 0; i < stamped.length; i++) {
    const rec = stamped[i];
    const next = stamped[i + 1];
    let dt = next
      ? (next.timestamp!.getTime() - rec.timestamp!.getTime()) / 1000
      : 1;
    if (!(dt > 0)) continue;
    dt = Math.min(dt, MAX_SAMPLE_GAP_SEC);

    if (rec.heartRate != null && rec.heartRate > 0) {
      const key = String(Math.round(rec.heartRate));
      hr[key] = (hr[key] ?? 0) + dt;
    }
    if (rec.power != null && rec.power > 0) {
      const key = String(Math.floor(rec.power / 5) * 5);
      power[key] = (power[key] ?? 0) + dt;
    }
    const spd = rec.enhancedSpeed ?? rec.speed;
    if (spd != null && spd > 0) {
      const key = String(Math.floor(spd * 10));
      speed[key] = (speed[key] ?? 0) + dt;
    }
  }

  const round = (m: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      const s = Math.round(v);
      if (s > 0) out[k] = s;
    }
    return Object.keys(out).length > 0 ? out : null;
  };

  return { hr: round(hr), power: round(power), speed: round(speed) };
}

/** Ascending-unit sample value at the center of a histogram bucket. */
export function bucketValue(
  metric: "hr" | "power" | "speed",
  key: string,
): number {
  const n = Number(key);
  if (metric === "power") return n + 2.5;
  if (metric === "speed") return n / 10 + 0.05;
  return n;
}
