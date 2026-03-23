import { T } from "../../styles/tokens";

function fmt(n) {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtRevenue(n) {
  return `${(n / 10000).toFixed(1)}만원`;
}

function RankBadge({ rank }) {
  const bg    = rank === 1 ? T.warnBg    : rank === 2 ? T.bgSection : rank === 3 ? T.warnBg : T.bgApp;
  const color = rank === 1 ? T.warn      : rank === 2 ? T.status.planned.text : rank === 3 ? T.warn : T.muted;
  return (
    <div style={{
      width: 24, height: 24, borderRadius: T.radius.btn,
      background: bg, color,
      fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {rank}
    </div>
  );
}

// ─── MomentumBadge ────────────────────────────────────────────────────────────
function MomentumBadge({ status }) {
  if (!status) return null;
  const isRising   = status === "Rising";
  const isDeclining= status === "Declining";
  const icon  = isRising ? "↑" : isDeclining ? "↓" : "→";
  const color = isRising ? T.color.success : isDeclining ? T.color.danger : T.muted;
  return (
    <span style={{
      fontSize:   T.font.size.xxs,
      fontWeight: T.font.weight.bold,
      fontFamily: T.font.familyMono,
      color,
    }}>
      {icon}
    </span>
  );
}

// ─── TopVideoList ─────────────────────────────────────────────────────────────
export default function TopVideoList({ topVideos }) {
  return (
    <div>
      {/* 헤더 */}
      <div style={{
        padding:      `${T.spacing.md}px ${T.spacing.xl}px`,
        borderBottom: `1px solid ${T.border}`,
        background:   T.bgApp,
      }}>
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>인기 동영상 TOP 5</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, marginLeft: T.spacing.sm }}>전체 누적 조회수 기준</span>
      </div>

      {/* 리스트 */}
      <div>
        {topVideos.map((video, i) => (
          <div
            key={video.id}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          T.spacing.md,
              padding:      `${T.spacing.md}px ${T.spacing.xl}px`,
              borderBottom: i < topVideos.length - 1 ? `1px solid ${T.border}` : "none",
            }}
          >
            <RankBadge rank={i + 1} />

            {/* 제목 + Momentum */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize:     T.font.size.md,
                fontWeight:   T.font.weight.semibold,
                color:        T.text,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {video.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginTop: 2 }}>
                <span style={{ fontSize: T.font.size.xxs, color: T.muted }}>상승 추세</span>
                <MomentumBadge status={video.momentum} />
              </div>
            </div>

            {/* 메타 */}
            <div style={{ display: "flex", gap: T.spacing.lg, flexShrink: 0 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.bold, color: T.text }}>{fmt(video.views)}</div>
                <div style={{ fontSize: T.font.size.xxs, color: T.muted }}>조회수</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.bold, color: T.text }}>
                  {fmtRevenue(video.revenue)}
                </div>
                <div style={{ fontSize: T.font.size.xxs, color: T.muted }}>수익</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
