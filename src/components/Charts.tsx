import { useState } from "react";

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Single-series line chart with hover tooltip. Values in data units; axis auto-scales. */
export function LineChart({
  data,
  unit = "",
  height = 160,
  min,
  max,
}: {
  data: SeriesPoint[];
  unit?: string;
  height?: number;
  min?: number;
  max?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = height, PL = 34, PR = 12, PT = 12, PB = 24;
  if (data.length === 0) return <div className="chart-empty">No sessions yet</div>;
  const lo = min ?? Math.min(...data.map((d) => d.value));
  const hi = max ?? Math.max(...data.map((d) => d.value));
  const span = hi - lo || 1;
  const x = (i: number) => PL + (data.length === 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (data.length - 1));
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - lo) / span);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const ticks = [lo, lo + span / 2, hi];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          setHover(best);
        }}
        onTouchStart={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.touches[0].clientX - rect.left) / rect.width) * W;
          let best = 0;
          for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          setHover(best);
        }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PL - 6} y={y(t) + 4} className="chart-tick" textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={path} className="chart-line" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 6 : 4} className="chart-dot" />
        ))}
        {h && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} className="chart-crosshair" />
        )}
        <text x={PL} y={H - 6} className="chart-tick">{data[0].label}</text>
        {data.length > 1 && (
          <text x={W - PR} y={H - 6} className="chart-tick" textAnchor="end">
            {data[data.length - 1].label}
          </text>
        )}
      </svg>
      <div className="chart-tip">
        {h ? (
          <>
            <span className="muted">{h.label}</span> <strong className="num">{Math.round(h.value * 10) / 10}{unit}</strong>
          </>
        ) : (
          <span className="muted">
            Latest <strong className="num">{Math.round(data[data.length - 1].value * 10) / 10}{unit}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

/** Horizontal bars with direct labels — for categorical counts like punch types. */
export function BarChart({ data }: { data: SeriesPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <div className="bar-label">{d.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="bar-value num">{d.value}</div>
        </div>
      ))}
    </div>
  );
}
