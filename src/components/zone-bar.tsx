import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ZONE_COLORS, ZONE_LABELS, type TimeInZones } from "@/lib/zones";

// Which metric to show when a workout has several zone distributions.
// HR first (present in almost every recording), then power, then pace.
export function primaryZoneSeconds(tiz: TimeInZones): {
  metric: "hr" | "power" | "pace";
  seconds: number[];
} | null {
  for (const metric of ["hr", "power", "pace"] as const) {
    const seconds = tiz[metric];
    if (seconds && seconds.some((s) => s > 0)) return { metric, seconds };
  }
  return null;
}

export function zoneTooltip(seconds: number[]): string {
  return seconds
    .map((sec, i) =>
      sec > 0 ? `${ZONE_LABELS[i] ?? `Z${i + 1}`} ${formatDuration(sec)}` : null,
    )
    .filter(Boolean)
    .join(" · ");
}

const HEIGHTS = { xs: "h-[3px]", sm: "h-1.5", md: "h-2.5" } as const;

/**
 * Stacked horizontal bar of time per zone, Z1 blue → Z5 red. Width shares are
 * proportional to seconds. Presentational only — works in server and client
 * components.
 */
export function ZoneBar({
  seconds,
  size = "sm",
  className,
  title,
}: {
  seconds: number[];
  size?: keyof typeof HEIGHTS;
  className?: string;
  title?: string;
}) {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return (
    <div
      className={cn(
        "flex w-full overflow-hidden rounded-full",
        HEIGHTS[size],
        className,
      )}
      title={title ?? zoneTooltip(seconds)}
      role="img"
      aria-label={title ?? zoneTooltip(seconds)}
    >
      {seconds.map((sec, i) =>
        sec > 0 ? (
          <div
            key={i}
            style={{
              width: `${(sec / total) * 100}%`,
              backgroundColor: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
            }}
          />
        ) : null,
      )}
    </div>
  );
}

/** Per-zone rows with color dot, label, duration and share. */
export function ZoneBreakdown({ seconds }: { seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return (
    <div className="space-y-1">
      {seconds.map((sec, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
            }}
          />
          <span className="w-6 font-semibold">
            {ZONE_LABELS[i] ?? `Z${i + 1}`}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(sec / total) * 100}%`,
                backgroundColor: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
              }}
            />
          </div>
          <span className="w-16 text-right tabular-nums text-muted-foreground">
            {sec > 0 ? formatDuration(sec) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
