import { T } from "../../styles/tokens";

// ─── 색상 맵 ──────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  Rising:   { badge: T.color.success,  badgeBg: T.successBg,  bar: T.color.success  },
  Stable:   { badge: T.color.primary,  badgeBg: T.primarySoft, bar: T.color.primary  },
  Declining:{ badge: T.color.danger,   badgeBg: T.dangerBg,   bar: T.color.danger   },
};

// bar 너비: score 2.0 기준 100% 정규화, clamp 4~100%
function barWidth(score) {
  return Math.min(100, Math.max(4, (score / 2) * 100));
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.Stable;
  return (
    <span style={{
      fontSize:      10,
      fontWeight:    T.font.weight.semibold,
      letterSpacing: "0.06em",
      color:         c.badge,
      background:    c.badgeBg,
      borderRadius:  T.radius.badge,
      padding:       `2px ${T.spacing.sm}px`,
      fontFamily:    "monospace",
    }}>
      {status.toUpperCase()}
    </span>
  );
}

// ─── VideoRow ─────────────────────────────────────────────────────────────────
function VideoRow({ item }) {
  const c = STATUS_COLOR[item.momentumStatus] ?? STATUS_COLOR.Stable;
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xs,
      padding:       `${T.spacing.sm}px 0`,
      borderBottom:  `1px solid ${T.border}`,
    }}>
      {/* 상태 배지 */}
      <StatusBadge status={item.momentumStatus} />

      {/* 바 + 제목 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        {/* 모멘텀 바 */}
        <div style={{
          width:        `${barWidth(item.momentumScore)}%`,
          height:       6,
          borderRadius: T.radius.pill,
          background:   c.bar,
          flexShrink:   0,
          transition:   "width 0.3s ease",
          minWidth:     4,
          maxWidth:     "60%",
        }} />
        {/* 영상 제목 */}
        <span style={{
          fontSize:     T.font.size.sm,
          fontWeight:   T.font.weight.semibold,
          color:        T.text,
          whiteSpace:   "nowrap",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          flex:         1,
        }}>
          {item.title || "제목 없음"}
        </span>
      </div>

      {/* 점수 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.sub,
        fontFamily: "monospace",
      }}>
        Momentum Score {item.momentumScore.toFixed(2)}
      </span>
    </div>
  );
}

// ─── MomentumPanel ────────────────────────────────────────────────────────────
// Props:
//   earlyMomentum — EarlyMomentumResult from earlyMomentumEngine
//   tracks        — TrackResult[] (title 조회용)
export default function MomentumPanel({ earlyMomentum, tracks }) {
  if (!earlyMomentum) return null;

  const { byVideo, earlyCount } = earlyMomentum;

  // title 조회용 맵
  const titleMap = new Map((tracks ?? []).map(t => [t.videoId, t.name]));

  // score 내림차순 정렬
  const sorted = [...byVideo].sort((a, b) => b.momentumScore - a.momentumScore);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 헤더 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{
            fontSize:   T.font.size.xs,
            fontWeight: T.font.weight.bold,
            color:      T.text,
            letterSpacing: "0.05em",
          }}>
            TOP RISING VIDEOS
          </span>
          <span style={{
            fontSize:     T.font.size.xs,
            color:        T.sub,
            fontFamily:   "monospace",
          }}>
            최근 7일 이내
          </span>
        </div>
        {/* 분석 대상 수 배지 */}
        <span style={{
          fontSize:     10,
          fontFamily:   "monospace",
          color:        T.muted,
          background:   T.bgSection,
          borderRadius: T.radius.badge,
          padding:      `2px ${T.spacing.sm}px`,
        }}>
          {earlyCount}개 영상
        </span>
      </div>

      {/* 데이터 없음 */}
      {sorted.length === 0 ? (
        <div style={{
          textAlign: "center",
          color:     T.muted,
          fontSize:  T.font.size.sm,
          padding:   `${T.spacing.xl}px 0`,
        }}>
          최근 7일 이내 업로드된 영상이 없습니다.
        </div>
      ) : (
        <div>
          {sorted.map(item => (
            <VideoRow
              key={item.videoId}
              item={{ ...item, title: titleMap.get(item.videoId) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
