// ─── TrendingVideos v2 ────────────────────────────────────────────────────────
// 급상승 영상: current.videos vs prev30.videos → trend_score = cur / prev
// trend_score > 1.5인 영상만 표시
// v2: QuickInsightBar 추가

import { useMemo } from "react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { useReachData } from "@/controllers/ReachDataContext";
import { buildSelectedVideo } from "@/lib/buildSelectedVideo";
import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { SelectedVideo } from "./VideoDetailModal";
import QuickInsightBar from "./QuickInsightBar";
import {
  generateTrendingInsights,
  generateTrendingActions,
  zipPairs,
} from "@/engines/PanelInsightEngine";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtScore(score: number): string {
  return `×${score.toFixed(1)}`;
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface TrendingVideo {
  key:        string;
  title:      string;   // video.title ?? video.key (실제 제목)
  views:      number;
  prevViews:  number;
  trendScore: number;
}

// ─── calcTrending ─────────────────────────────────────────────────────────────

function calcTrending(
  current: DimensionRow[],
  prev:    DimensionRow[],
  threshold = 1.5,
): TrendingVideo[] {
  if (!current.length) return [];

  const prevMap = new Map<string, number>();
  for (const v of prev) prevMap.set(v.key, v.views);

  return current
    .filter(v => {
      const prevViews = prevMap.get(v.key);
      if (prevViews == null || prevViews === 0) return false;
      return v.views / prevViews > threshold;
    })
    .map(v => {
      const prevViews = prevMap.get(v.key)!;
      return {
        key:        v.key,
        title:      v.title ?? v.key,
        views:      v.views,
        prevViews,
        trendScore: Math.round((v.views / prevViews) * 10) / 10,
      };
    })
    .sort((a, b) => b.trendScore - a.trendScore);
}

// ─── TrendRow ─────────────────────────────────────────────────────────────────

function TrendRow({
  video, onVideoClick, reachRows, hitVideos, diagnostics,
}: {
  video:         TrendingVideo;
  onVideoClick?: (v: SelectedVideo) => void;
  reachRows:     ReturnType<typeof useReachData>;
  hitVideos:     DimensionRow[];
  diagnostics:   any[];
}) {
  const hot = video.trendScore >= 3.0;

  return (
    <div
      onClick={() => onVideoClick?.(
        buildSelectedVideo(video.key, [], reachRows, hitVideos, diagnostics),
      )}
      style={{
        display:             "grid",
        gridTemplateColumns: "1fr 64px 48px",
        gap:                 T.spacing.sm,
        alignItems:          "center",
        padding:             `${T.spacing.sm}px 0`,
        borderBottom:        `1px solid ${T.borderSoft}`,
        cursor:              onVideoClick ? "pointer" : "default",
        borderRadius:        T.radius.btn,
        transition:          "background 0.15s",
      }}
      onMouseEnter={e => { if (onVideoClick) (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* 제목 */}
      <span style={{
        fontSize:     T.font.size.sm,
        color:        T.text,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {video.title}
      </span>

      {/* 조회수 */}
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        color:      T.sub,
        textAlign:  "right",
      }}>
        {fmtViews(video.views)}
      </span>

      {/* 트렌드 스코어 */}
      <span style={{
        fontSize:     T.font.size.xs,
        fontFamily:   T.font.familyMono,
        fontWeight:   T.font.weight.bold,
        color:        hot ? T.danger : T.success,
        background:   hot ? T.dangerBg : T.successBg,
        borderRadius: T.radius.badge,
        padding:      `1px ${T.spacing.xs}px`,
        textAlign:    "center",
      }}>
        {fmtScore(video.trendScore)}
      </span>
    </div>
  );
}

// ─── TrendingVideos ───────────────────────────────────────────────────────────

interface TrendingVideosProps {
  onVideoClick?: (v: SelectedVideo) => void;
}

export default function TrendingVideos({ onVideoClick }: TrendingVideosProps) {
  const { analytics, loadingAnalytics, videoDiagnostics } = useAnalyticsContext();
  const reachRows = useReachData();
  const hitVideos = analytics?.hitVideos ?? [];

  // prev30는 AnalyticsSummary (videos 없음) → hitVideos를 all-time 기준으로 사용
  const trending = useMemo(() => calcTrending(
    analytics?.current?.videos ?? [],
    hitVideos,
  ), [analytics, hitVideos]);

  const pairs = useMemo(() => {
    const top = trending[0];
    return zipPairs(
      generateTrendingInsights(trending.length, top?.trendScore ?? 0, top?.title ?? ""),
      generateTrendingActions(trending.length, top?.trendScore ?? 0, top?.title ?? ""),
    );
  }, [trending]);

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
          급상승 영상
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          fontFamily: T.font.familyMono,
        }}>
          score &gt; 1.5×
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 64px 48px",
        gap:                 T.spacing.sm,
      }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>영상</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "right" }}>조회수</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "center" }}>트렌드</span>
      </div>

      {/* 데이터 */}
      {loadingAnalytics ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>로딩 중···</div>
      ) : trending.length === 0 ? (
        <div style={{
          fontSize:   T.font.size.sm,
          color:      T.muted,
          textAlign:  "center",
          padding:    `${T.spacing.xl}px 0`,
        }}>
          급상승 영상 없음
        </div>
      ) : (
        trending.slice(0, 8).map((v, i) => (
          <TrendRow
            key={`${v.key}-${i}`}
            video={v}
            onVideoClick={onVideoClick}
            reachRows={reachRows}
            hitVideos={hitVideos}
            diagnostics={videoDiagnostics}
          />
        ))
      )}

      {/* Quick Insight Bar */}
      {!loadingAnalytics && <QuickInsightBar pairs={pairs} />}
    </div>
  );
}
