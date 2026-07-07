"use client";

import type { CurvePoint } from "@/lib/lactate";
import type { SportIntensity } from "@/lib/lactate";

export interface ChartMarker {
  label: string;
  intensity: number;
  lactate: number;
  color: string;
}

// Lactate curve with threshold markers. X is the engine's ascending intensity,
// labelled in the sport's native unit (pace or watts). Renders nothing below
// two points.
export function LactateChart({
  points,
  markers = [],
  si,
}: {
  points: CurvePoint[];
  markers?: ChartMarker[];
  si: SportIntensity;
}) {
  const pts = [...points].sort((a, b) => a.intensity - b.intensity);
  if (pts.length < 2) return null;

  const w = 360;
  const h = 200;
  const padL = 30;
  const padR = 14;
  const padTop = 18;
  const padBottom = 32;

  const xsAll = pts.map((p) => p.intensity);
  const markerXs = markers.map((m) => m.intensity).filter(Number.isFinite);
  const minX = Math.min(...xsAll, ...markerXs);
  const maxX = Math.max(...xsAll, ...markerXs);
  const maxY = Math.max(...pts.map((p) => p.lactate)) * 1.12 || 1;

  const x = (v: number) =>
    padL + ((v - minX) / (maxX - minX || 1)) * (w - padL - padR);
  const y = (v: number) => padTop + (1 - v / maxY) * (h - padTop - padBottom);

  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.intensity)} ${y(p.lactate)}`)
    .join(" ");
  const area = `${line} L ${x(pts[pts.length - 1].intensity)} ${
    h - padBottom
  } L ${x(pts[0].intensity)} ${h - padBottom} Z`;

  const ticks = [0, 0.5, 1].map((t) => {
    const v = minX + t * (maxX - minX);
    return { v, label: si.formatIntensity(v) };
  });

  return (
    <div className="rounded-lg border bg-muted/40 p-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Lactate curve with thresholds"
      >
        <defs>
          <linearGradient id="lacFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {markers.map((m, i) =>
          Number.isFinite(m.intensity) ? (
            <g key={i}>
              <line
                x1={x(m.intensity)}
                y1={padTop}
                x2={x(m.intensity)}
                y2={h - padBottom}
                stroke={m.color}
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.9"
              />
              <text
                x={x(m.intensity)}
                y={padTop - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={m.color}
              >
                {m.label}
              </text>
            </g>
          ) : null,
        )}

        <path d={area} fill="url(#lacFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {pts.map((p, i) => (
          <circle
            key={i}
            cx={x(p.intensity)}
            cy={y(p.lactate)}
            r="3"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="2"
          />
        ))}

        {markers.map((m, i) =>
          Number.isFinite(m.intensity) ? (
            <circle
              key={`d${i}`}
              cx={x(m.intensity)}
              cy={y(m.lactate)}
              r="3.5"
              fill={m.color}
            />
          ) : null,
        )}

        {ticks.map((t, i) => (
          <text
            key={i}
            x={x(t.v)}
            y={h - 9}
            textAnchor={
              i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
            }
            fontSize="9"
            fill="var(--muted-foreground)"
          >
            {t.label}
          </text>
        ))}

        <text
          x={4}
          y={y(maxY) + 8}
          fontSize="9"
          fill="var(--muted-foreground)"
        >
          {maxY.toFixed(1)}
        </text>
        <text
          x={4}
          y={h - padBottom}
          fontSize="9"
          fill="var(--muted-foreground)"
        >
          mmol/L
        </text>
      </svg>
    </div>
  );
}
