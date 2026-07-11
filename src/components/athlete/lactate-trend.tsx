import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Sport } from "@/db/schema";
import type { LactateTrend, LactateTrendPoint } from "@/lib/lactate-data";
import { LACTATE_SPORTS } from "@/lib/lactate";
import { SPORTS } from "@/lib/sports";

// Development of the LT1/LT2 consensus across an athlete's lactate tests,
// one mini chart per sport. Y is engine intensity (ascending = fitter), so an
// improving athlete always trends up regardless of watts vs pace; the labels
// show native units. Server component — plain SVG, no interactivity.
export function LactateTrendCard({ trend }: { trend: LactateTrend }) {
  const sports = LACTATE_SPORTS.filter((s) => (trend[s]?.length ?? 0) > 0);
  if (sports.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lactate development</CardTitle>
        <CardDescription>
          LT2 (solid) and LT1 (dashed) consensus per test
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sports.map((sport) => (
          <SportTrend key={sport} sport={sport} points={trend[sport]!} />
        ))}
      </CardContent>
    </Card>
  );
}

const W = 260;
const H = 110;
const PAD = { top: 14, right: 12, bottom: 20, left: 12 };

function SportTrend({
  sport,
  points,
}: {
  sport: Sport;
  points: LactateTrendPoint[];
}) {
  const meta = SPORTS[sport];
  const Icon = meta.icon;

  const values = points.flatMap((p) =>
    [p.lt1Intensity, p.lt2Intensity].filter((v): v is number => v != null),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  const path = (pick: (p: LactateTrendPoint) => number | null) => {
    const coords = points
      .map((p, i) => ({ v: pick(p), i }))
      .filter((c): c is { v: number; i: number } => c.v != null)
      .map((c) => `${x(c.i).toFixed(1)},${y(c.v).toFixed(1)}`);
    return coords.length >= 2 ? `M${coords.join(" L")}` : null;
  };

  const lt2Path = path((p) => p.lt2Intensity);
  const lt1Path = path((p) => p.lt1Intensity);
  const latest = points[points.length - 1];

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {points.length} test{points.length > 1 ? "s" : ""}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${meta.label} lactate threshold development`}
      >
        {lt1Path && (
          <path
            d={lt1Path}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        {lt2Path && (
          <path
            d={lt2Path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
          />
        )}
        {points.map((p, i) =>
          p.lt2Intensity != null ? (
            <circle
              key={p.testId}
              cx={x(i)}
              cy={y(p.lt2Intensity)}
              r={3}
              fill="var(--primary)"
            />
          ) : null,
        )}
        <text
          x={PAD.left}
          y={H - 6}
          className="fill-muted-foreground"
          fontSize={9}
        >
          {points[0].date}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={9}
        >
          {latest.date}
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        Latest LT2{" "}
        <Link
          href={`/lactate/${latest.testId}`}
          className="font-semibold text-foreground hover:underline"
        >
          {latest.lt2Label ?? "—"}
        </Link>
        {latest.lt2HeartRate ? ` @ ${latest.lt2HeartRate} bpm` : ""}
        {latest.lt1Label ? ` · LT1 ${latest.lt1Label}` : ""}
      </p>
    </div>
  );
}
