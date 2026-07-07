import type { Sport } from "@/db/schema";

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export function formatDistance(meters: number, sport: Sport): string {
  if (sport === "swim" || meters < 1000) {
    return `${meters.toLocaleString("en-US")} m`;
  }
  const km = meters / 1000;
  return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
}

// Sport-appropriate intensity figure derived from duration + distance:
// run → min/km, swim → min/100m, bike → km/h.
export function formatPace(
  durationSec: number,
  distanceM: number,
  sport: Sport,
): string | null {
  if (durationSec <= 0 || distanceM <= 0 || sport === "strength") return null;
  if (sport === "bike") {
    const kmh = distanceM / 1000 / (durationSec / 3600);
    return `${kmh.toFixed(1)} km/h`;
  }
  const perUnit = sport === "swim" ? distanceM / 100 : distanceM / 1000;
  const secPerUnit = durationSec / perUnit;
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  const unit = sport === "swim" ? "/100m" : "/km";
  return `${m}:${s.toString().padStart(2, "0")}${unit}`;
}

// Pace text ("4:30" or plain seconds "270") → seconds. Null if unparseable.
export function parsePaceInput(str: string): number | null {
  const s = str.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    const mm = Number(m);
    const ss = Number(sec);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss >= 60) return null;
    return Math.round(mm * 60 + ss);
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function formatPaceSeconds(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// Chat timestamps. Rendered server-side in server time (assumption: fine
// until the per-user timezone pass).
export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
