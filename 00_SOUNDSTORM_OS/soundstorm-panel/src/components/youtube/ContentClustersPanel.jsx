import { T } from "../../styles/tokens";

const MAX_VISIBLE = 5;

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtViews(n) {
  if (!n || n <= 0) return "—";
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtEngagement(r) {
  if (r === null || r === undefined) return "—";
  return `${(r * 100).toFixed(1)}%`;
}

// ─── ClusterCard ──────────────────────────────────────────────────────────────
function ClusterCard({ cluster }) {
  const { name, videoCount, avgViews, engagement } = cluster;

  return (
    <div style={{
      padding:      `${T.spacing.sm}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        fontSize:      T.font.size.sm,
        fontWeight:    T.font.weight.bold,
        color:         T.text,
        textTransform: "capitalize",
        marginBottom:  T.spacing.xs,
      }}>
        {name}
      </div>

      <div style={{ display: "flex", gap: T.spacing.lg }}>
        <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: "monospace" }}>
          영상 수: <strong style={{ color: T.text }}>{videoCount}</strong>
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: "monospace" }}>
          평균 조회수: <strong style={{ color: T.color.primary }}>{fmtViews(avgViews)}</strong>
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: "monospace" }}>
          참여율: <strong style={{ color: T.color.success }}>{fmtEngagement(engagement)}</strong>
        </span>
      </div>
    </div>
  );
}

// ─── EtcRow ───────────────────────────────────────────────────────────────────
function EtcRow({ clusters }) {
  const totalVideos = clusters.reduce((s, c) => s + c.videoCount, 0);
  return (
    <div style={{
      padding:   `${T.spacing.sm}px ${T.spacing.lg}px`,
      display:   "flex",
      alignItems:"center",
      gap:       T.spacing.sm,
    }}>
      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: "monospace" }}>
        기타 {clusters.length}개 유형
      </span>
      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: "monospace" }}>
        ({totalVideos}개 영상)
      </span>
    </div>
  );
}

// ─── ContentClustersPanel ─────────────────────────────────────────────────────
// Props:
//   clusters — { name, videoCount, avgViews, engagement }[]
export default function ContentClustersPanel({ clusters }) {
  if (!clusters || clusters.length === 0) return null;

  const visible = clusters.slice(0, MAX_VISIBLE);
  const hidden  = clusters.slice(MAX_VISIBLE);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 상위 5개 */}
      <div>
        {visible.map(c => (
          <ClusterCard key={c.name} cluster={c} />
        ))}
      </div>

      {/* 기타 */}
      {hidden.length > 0 && <EtcRow clusters={hidden} />}
    </div>
  );
}
