import { T } from "../../styles/tokens";

const C = {
  card:     T.bgCard,
  border:   T.border,
  text:     T.text,
  sub:      T.sub,
  muted:    T.muted,
  primary:  T.primary,
  gridLine: T.border,
};

// ─── YouTubeTrendChart ────────────────────────────────────────────────────────
// 최근 30일 일별 조회수 SVG 라인 차트 (외부 라이브러리 없음)
export default function YouTubeTrendChart({ dailyStats, chartHeight = 160 }) {
  const W = 600;
  const H = chartHeight;
  const PAD = { top: 16, right: 12, bottom: 28, left: 44 };

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const maxViews = Math.max(...dailyStats.map(d => d.views));
  const minViews = Math.min(...dailyStats.map(d => d.views));
  const range    = maxViews - minViews || 1;

  const toX = (i) => PAD.left + (i / (dailyStats.length - 1)) * innerW;
  const toY = (v) => PAD.top  + innerH - ((v - minViews) / range) * innerH;

  const points = dailyStats.map((d, i) => `${toX(i)},${toY(d.views)}`).join(" ");

  // area fill path
  const areaPath =
    `M ${toX(0)},${toY(dailyStats[0].views)} ` +
    dailyStats.map((d, i) => `L ${toX(i)},${toY(d.views)}`).join(" ") +
    ` L ${toX(dailyStats.length - 1)},${PAD.top + innerH}` +
    ` L ${PAD.left},${PAD.top + innerH} Z`;

  // Y축 격자선 3개
  const yTicks = [0, 0.5, 1].map(ratio => ({
    y:   PAD.top + innerH - ratio * innerH,
    val: Math.round(minViews + ratio * range),
  }));

  // X축 레이블: 7일 간격
  const xLabels = dailyStats.filter((_, i) => i % 7 === 0 || i === dailyStats.length - 1);

  function fmtY(v) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  }

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: T.radius.card,
      padding: `${T.spacing.lg}px ${T.spacing.xl}px ${T.spacing.md}px`,
      boxShadow: T.shadow.card,
    }}>
      <div style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em", marginBottom: T.spacing.md }}>
        조회수 추이 (최근 30일)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible", display: "block" }}>
        <defs>
          <linearGradient id="yt-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.primary} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.primary} stopOpacity={0}    />
          </linearGradient>
        </defs>

        {/* Y축 격자선 + 레이블 */}
        {yTicks.map(({ y, val }) => (
          <g key={val}>
            <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
              stroke={C.gridLine} strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4}
              textAnchor="end" fontSize={10} fill={C.muted}>{fmtY(val)}</text>
          </g>
        ))}

        {/* X축 레이블 */}
        {xLabels.map((d, i) => {
          const srcIdx = dailyStats.indexOf(d);
          return (
            <text key={i} x={toX(srcIdx)} y={H - 4}
              textAnchor="middle" fontSize={9} fill={C.muted}>{d.date}</text>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#yt-area-grad)" />

        {/* Line */}
        <polyline points={points}
          fill="none" stroke={C.primary} strokeWidth={2} strokeLinejoin="round" />

        {/* 마지막 점 강조 */}
        <circle
          cx={toX(dailyStats.length - 1)}
          cy={toY(dailyStats[dailyStats.length - 1].views)}
          r={4} fill={C.primary} stroke={C.card} strokeWidth={2}
        />
      </svg>
    </div>
  );
}
