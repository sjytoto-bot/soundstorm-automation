// ─── HitVideosPanel v1 ────────────────────────────────────────────────────────
// 히트 영상 패널 (상위 5개).
// 기본: 순위 + 제목 + 조회수 + 좋아요 목록 | 자세히 보기: 전체 테이블
//
// Props:
//   videos — DimensionRow[]  (rank 기준 오름차순 정렬됨)

import { useState } from "react";
import { T } from "../../styles/tokens";
import DrillDownTable from "./DrillDownTable";

// ─── 순위 배지 색상 ───────────────────────────────────────────────────────────
function rankBadgeStyle(rank) {
  if (rank === 1) return { background: T.warnBg,    color: T.warn   };
  if (rank === 2) return { background: T.bgSection, color: T.sub    };
  if (rank === 3) return { background: T.warnBg,    color: T.warn    }; // 브론즈
  return           { background: T.bgApp,    color: T.muted  };
}

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────
function fmtCount(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("ko-KR");
}

function fmtAvgDuration(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── 영상 행 ──────────────────────────────────────────────────────────────────
function VideoRow({ video }) {
  const rank       = video.rank ?? 0;
  const badgeStyle = rankBadgeStyle(rank);

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.md,
      padding:      `${T.spacing.sm}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      {/* 순위 배지 */}
      <span style={{
        ...badgeStyle,
        fontSize:     T.font.size.xs,
        fontWeight:   T.font.weight.bold,
        fontFamily:   "monospace",
        borderRadius: T.radius.badge,
        padding:      `${T.spacing.xs / 2}px ${T.spacing.xs}px`,
        minWidth:     24,
        textAlign:    "center",
        flexShrink:   0,
      }}>
        {rank}
      </span>

      {/* 제목 + 확장 전략 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     T.font.size.sm,
          color:        T.text,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {video.title ?? video.key ?? "—"}
        </div>
        {video.expansionHint && (
          <span style={{
            fontSize:     10,
            color:        T.sub,
            background:   T.bgSection,
            borderRadius: T.radius.badge,
            padding:      "1px 5px",
            marginTop:    2,
            display:      "inline-block",
          }}>
            {video.expansionHint}
          </span>
        )}
      </div>

      {/* 조회수 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.sub,
        fontFamily: "monospace",
        flexShrink: 0,
      }}>
        {fmtCount(video.views)}
      </span>

      {/* 좋아요 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontFamily: "monospace",
        flexShrink: 0,
      }}>
        ♥ {fmtCount(video.likes)}
      </span>
    </div>
  );
}

// ─── HitVideosPanel ───────────────────────────────────────────────────────────

const DRILL_COLUMNS = [
  { key: "rank",        label: "순위",      align: "center" },
  { key: "title",       label: "제목",      align: "left"   },
  { key: "views",       label: "조회수",    align: "right"  },
  { key: "likes",       label: "좋아요",    align: "right"  },
  { key: "avgDuration", label: "평균시청시간", align: "right" },
];

export default function HitVideosPanel({ videos }) {
  const [showDrill, setShowDrill] = useState(false);

  const list = videos ?? [];

  const drillRows = list.map((v, i) => ({
    rank:        v.rank ?? i + 1,
    title:       v.title ?? v.key ?? "—",
    views:       fmtCount(v.views),
    likes:       fmtCount(v.likes),
    avgDuration: fmtAvgDuration(v.avgDurationSec),
  }));

  if (list.length === 0) {
    return (
      <div style={{ fontSize: T.font.size.xs, color: T.muted, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  return (
    <div>
      {/* 기본 뷰: 상위 5개 */}
      {list.slice(0, 5).map((video, i) => (
        <VideoRow key={video.key ? `${video.key}-${i}` : i} video={video} />
      ))}

      {/* 드릴다운 토글 버튼 */}
      {list.length > 5 && (
        <button
          onClick={() => setShowDrill(true)}
          style={{
            marginTop:  T.spacing.sm,
            fontSize:   T.font.size.xs,
            color:      T.color.primary,
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    0,
            fontFamily: "monospace",
            display:    "block",
          }}
        >
          자세히 보기 ({list.length}개)
        </button>
      )}

      {/* 드릴다운 테이블 */}
      {showDrill && (
        <DrillDownTable
          columns={DRILL_COLUMNS}
          rows={drillRows}
          onClose={() => setShowDrill(false)}
        />
      )}
    </div>
  );
}
