export interface TrendDay {
  date: string;
  conversations: number;
  bookings: number;
  activations: number;
}

const SERIES: {
  key: "conversations" | "bookings" | "activations";
  label: string;
  color: string;
}[] = [
  { key: "conversations", label: "New chats", color: "var(--accent)" },
  { key: "bookings", label: "Booking requests", color: "var(--warn)" },
  { key: "activations", label: "Activations", color: "var(--ok)" },
];

/** Grouped bars, one cluster per day, drawn as SVG so it follows the light and dark themes (7 to 92 days) */
export default function TrendChart({ data }: { data: TrendDay[] }) {
  const W = 560;
  const H = 180;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => SERIES.map((s) => d[s.key])));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  const cw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.max(1.5, Math.min(14, (cw - 3) / SERIES.length));
  const gap = bw > 4 ? 2 : 0;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const step = Math.max(1, Math.ceil(data.length / 8)); // a label every few days when there are many
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto" }}
        role="img"
        aria-label="New chats, booking requests and activations per day"
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" />
            <text
              x={pad.l - 4}
              y={y(top * f) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
            >
              {Math.round(top * f)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = pad.l + i * cw + (cw - bw * SERIES.length) / 2;
          return (
            <g key={d.date}>
              {SERIES.map((s, j) => (
                <rect
                  key={s.key}
                  x={x0 + j * bw}
                  y={y(d[s.key])}
                  width={bw - gap}
                  height={H - pad.b - y(d[s.key])}
                  rx="1.5"
                  fill={s.color}
                >
                  <title>{`${d.date} · ${s.label}: ${d[s.key]}`}</title>
                </rect>
              ))}
              {i % step === 0 && (
                <text
                  x={pad.l + i * cw + cw / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {new Date(d.date + "T00:00:00+05:30").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: data.length > 8 ? "short" : undefined,
                    weekday: data.length > 8 ? undefined : "short",
                  })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="small muted" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {SERIES.map((s) => (
          <span key={s.key}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: s.color,
                marginRight: 5,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
