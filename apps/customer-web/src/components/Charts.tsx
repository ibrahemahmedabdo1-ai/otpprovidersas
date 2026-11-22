"use client";

export type SeriesPoint = { day: string; sent: number; delivered: number; failed: number };

/** Accessible SVG bar chart: total sends per day with delivered overlaid. Plain SVG, no chart library. */
export function SendsChart({ data, label, sentLabel, deliveredLabel, locale }: { data: SeriesPoint[]; label: string; sentLabel: string; deliveredLabel: string; locale: string }) {
  const W = 600, H = 160, pad = 4;
  const max = Math.max(1, ...data.map((d) => d.sent));
  const bw = (W - pad * 2) / Math.max(1, data.length);
  const dayFmt = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={label} preserveAspectRatio="none">
        {data.map((d, i) => {
          const hs = (d.sent / max) * H, hd = (d.delivered / max) * H;
          const x = pad + i * bw + 1;
          return (
            <g key={d.day}>
              <title>{`${dayFmt(d.day)}: ${sentLabel} ${d.sent}, ${deliveredLabel} ${d.delivered}`}</title>
              <rect x={x} y={H - hs} width={Math.max(1, bw - 2)} height={hs} rx={2} className="bar-sent" />
              <rect x={x} y={H - hd} width={Math.max(1, bw - 2)} height={hd} rx={2} className="bar-del" />
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {[0, Math.floor(data.length / 2), data.length - 1].map((i) => data[i] && (
          <text key={i} x={pad + i * bw + bw / 2} y={H + 14} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="tick">{dayFmt(data[i]!.day)}</text>
        ))}
      </svg>
      <figcaption className="legend"><span className="sw sw-sent" />{sentLabel} <span className="sw sw-del" />{deliveredLabel}</figcaption>
    </figure>
  );
}

export function SpendChart({ data, label, locale }: { data: { day: string; spent: number }[]; label: string; locale: string }) {
  const W = 600, H = 110, pad = 4;
  const max = Math.max(0.000001, ...data.map((d) => d.spent));
  const bw = (W - pad * 2) / Math.max(1, data.length);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label={label} preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (Math.max(0, d.spent) / max) * H;
          return <g key={d.day}><title>{`${d.day}: ${money(d.spent)}`}</title><rect x={pad + i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={2} className="bar-spend" /></g>;
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
      </svg>
    </figure>
  );
}
