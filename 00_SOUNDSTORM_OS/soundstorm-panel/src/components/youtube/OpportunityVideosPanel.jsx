import { Sparkles } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── signal 색상 ──────────────────────────────────────────────────────────────
function signalStyle(signal) {
  if (signal.includes("폭발") || signal.includes("부스트")) {
    return { color: T.color.success, bg: T.successBg };
  }
  if (signal.includes("↑") || signal.includes("진입") || signal.includes("상승")) {
    return { color: T.color.primary, bg: T.primarySoft };
  }
  return { color: T.muted, bg: T.bgSection };
}

// ─── 점수 색상 ────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 0.7) return T.color.success;
  if (score >= 0.4) return T.color.primary;
  return T.muted;
}

// ─── VideoRow ─────────────────────────────────────────────────────────────────
function VideoRow({ item, onVideoClick }) {
  const s     = signalStyle(item.signal);
  const score = item.opportunityScore ?? 0;
  const pct   = Math.round(score * 100);
  const sCol  = scoreColor(score);

  return (
    <div
      onClick={() => onVideoClick?.(item.videoId)}
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `${T.spacing.sm}px 0`,
        borderBottom:   `1px solid ${T.border}`,
        gap:            T.spacing.md,
        cursor:         onVideoClick ? "pointer" : "default",
      }}
      onMouseEnter={e => { if (onVideoClick) e.currentTarget.style.background = T.bgSection; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* 점수 배지 */}
      <div style={{
        minWidth:      40,
        textAlign:     "center",
        flexShrink:    0,
      }}>
        <div style={{
          fontSize:     13,
          fontWeight:   800,
          fontFamily:   "monospace",
          color:        sCol,
          lineHeight:   1,
        }}>
          {pct}
        </div>
        <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>점수</div>
      </div>

      {/* 제목 */}
      <span style={{
        fontSize:     T.font.size.sm,
        fontWeight:   T.font.weight.semibold,
        color:        T.text,
        flex:         1,
        minWidth:     0,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {item.title}
      </span>

      {/* 시그널 배지 */}
      <span style={{
        fontSize:      10,
        fontWeight:    T.font.weight.bold,
        fontFamily:    "monospace",
        letterSpacing: "0.04em",
        color:         s.color,
        background:    s.bg,
        borderRadius:  T.radius.badge,
        padding:       `2px ${T.spacing.sm}px`,
        flexShrink:    0,
        whiteSpace:    "nowrap",
      }}>
        {item.signal}
      </span>
    </div>
  );
}

// ─── OpportunityVideosPanel ───────────────────────────────────────────────────
// Props:
//   videos        — { videoId, title, signal, opportunityScore }[]
//   title         — 카드 헤더 제목 (optional)
//   onVideoClick  — (videoId: string) => void  클릭 시 Strategy 연결
export default function OpportunityVideosPanel({ videos, title = "기회 영상", onVideoClick }) {
  if (!videos || videos.length === 0) return null;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
      height:       "100%",
      boxSizing:    "border-box",
    }}>
      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: T.spacing.sm, marginBottom: T.spacing.lg,
      }}>
        <Sparkles size={14} color={T.primary} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>{title}</span>
        <span style={{
          fontSize: 11, color: T.primary,
          background: T.primarySoft ?? `${T.primary}15`,
          borderRadius: T.radius.badge, padding: "1px 6px",
          fontWeight: 600, marginLeft: "auto",
        }}>
          {videos.length}개
        </span>
      </div>

      {/* 영상 목록 — 점수 내림차순 (이미 정렬된 상태) */}
      <div>
        {videos.map((v, i) => (
          <VideoRow
            key={v.videoId ? `${v.videoId}-${i}` : i}
            item={v}
            onVideoClick={onVideoClick}
          />
        ))}
      </div>

      {/* 클릭 안내 */}
      {onVideoClick && (
        <div style={{
          marginTop: T.spacing.md,
          fontSize:  10,
          color:     T.muted,
          textAlign: "center",
        }}>
          영상 클릭 → 상세 전략 + 액션 바로 연결
        </div>
      )}
    </div>
  );
}
