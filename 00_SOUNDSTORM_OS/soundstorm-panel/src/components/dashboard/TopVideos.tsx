// ─── TopVideos v2 ─────────────────────────────────────────────────────────────
// 히트 영상 순위 테이블: rank · title · views
// 데이터: analytics.hitVideos (DimensionRow[])
// v2: QuickInsightBar 추가

import { useMemo } from "react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { useReachData } from "@/controllers/ReachDataContext";
import { buildSelectedVideo } from "@/lib/buildSelectedVideo";
import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { SelectedVideo } from "./VideoDetailModal";
import QuickInsightBar from "./QuickInsightBar";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import {
  generateVideoInsights,
  generateVideoActions,
  zipPairs,
} from "@/engines/PanelInsightEngine";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

// ─── VideoRow ─────────────────────────────────────────────────────────────────

function VideoRow({
  rank, video, onVideoClick, reachRows, hitVideos, diagnostics, onCreatePack,
}: {
  rank:           number;
  video:          DimensionRow;
  onVideoClick?:  (v: SelectedVideo) => void;
  reachRows:      ReturnType<typeof useReachData>;
  hitVideos:      DimensionRow[];
  diagnostics:    any[];
  onCreatePack?:  () => void;
}) {
  const isTop3 = rank <= 3;
  const isTop1 = rank === 1;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           isTop1 ? T.spacing.xs : 0,
    }}>
      <div
        onClick={() => onVideoClick?.(
          buildSelectedVideo(video.key, [], reachRows, hitVideos, diagnostics),
        )}
        style={{
          display:             "grid",
          gridTemplateColumns: "28px 1fr 72px",
          gap:                 T.spacing.sm,
          alignItems:          "center",
          padding:             `${T.spacing.sm}px 0`,
          borderBottom:        isTop1 ? "none" : `1px solid ${T.borderSoft}`,
          cursor:              onVideoClick ? "pointer" : "default",
          borderRadius:        T.radius.btn,
          transition:          "background 0.15s",
        }}
        onMouseEnter={e => { if (onVideoClick) (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {/* 순위 */}
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          color:      isTop3 ? T.primary : T.muted,
          fontWeight: isTop3 ? T.font.weight.bold : T.font.weight.regular,
          textAlign:  "center",
        }}>
          {rank}
        </span>

        {/* 제목 */}
        <span style={{
          fontSize:     T.font.size.sm,
          color:        T.text,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          lineHeight:   T.font.lineHeight.normal,
        }}>
          {video.title ?? video.key}
        </span>

        {/* 조회수 */}
        <span style={{
          fontSize:   T.font.size.sm,
          fontFamily: T.font.familyMono,
          color:      T.sub,
          textAlign:  "right",
        }}>
          {fmtViews(video.views)}
        </span>
      </div>

      {/* #1 영상 전용: Pack 생성 CTA */}
      {isTop1 && onCreatePack && (
        <div style={{
          paddingLeft:  36,
          paddingBottom: T.spacing.sm,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onCreatePack(); }}
            style={{
              padding:      "3px 10px",
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.semibold,
              color:        T.primary,
              background:   "transparent",
              border:       `1px solid ${T.primaryBorder ?? T.primary}`,
              borderRadius: T.radius.badge,
              cursor:       "pointer",
              transition:   "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${T.primary}18`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            이 테마로 Pack 생성 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TopVideos ────────────────────────────────────────────────────────────────

interface TopVideosProps {
  onVideoClick?: (v: SelectedVideo) => void;
}

export default function TopVideos({ onVideoClick }: TopVideosProps) {
  const { analytics, videoDiagnostics, loadingAnalytics } = useAnalyticsContext();
  const reachRows = useReachData();
  const { createPack } = useContentPackCtx();
  const hitVideos = analytics?.hitVideos ?? [];

  const pairs = useMemo(() => zipPairs(
    generateVideoInsights(hitVideos),
    generateVideoActions(hitVideos),
  ), [hitVideos]);

  function handleCreatePack(video: DimensionRow) {
    const theme = video.title ?? video.key;
    createPack(theme);
  }

  return (
    <div style={{
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.md,
      height:        "100%",
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontWeight:    T.font.weight.semibold,
          color:         T.sub,
          letterSpacing: "0.06em",
          fontFamily:    T.font.familyMono,
        }}>
          인기 영상
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          fontFamily: T.font.familyMono,
        }}>
          전체 기간
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "28px 1fr 72px",
        gap:                 T.spacing.sm,
      }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "center" }}>#</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>영상</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "right" }}>조회수</span>
      </div>

      {/* 데이터 */}
      {loadingAnalytics ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>로딩 중···</div>
      ) : hitVideos.length === 0 ? (
        <div style={{
          fontSize:       T.font.size.sm,
          color:          T.muted,
          textAlign:      "center",
          padding:        `${T.spacing.xl}px 0`,
        }}>
          데이터 없음
        </div>
      ) : (
        hitVideos.slice(0, 10).map((video, i) => (
          <VideoRow
            key={`${video.key}-${i}`}
            rank={i + 1}
            video={video}
            onVideoClick={onVideoClick}
            reachRows={reachRows}
            hitVideos={hitVideos}
            diagnostics={videoDiagnostics}
            onCreatePack={i === 0 ? () => handleCreatePack(video) : undefined}
          />
        ))
      )}

      {/* Quick Insight Bar */}
      {!loadingAnalytics && <QuickInsightBar pairs={pairs} />}
    </div>
  );
}
