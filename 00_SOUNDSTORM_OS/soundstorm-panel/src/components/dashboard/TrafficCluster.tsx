// ─── TrafficCluster v2 ────────────────────────────────────────────────────────
// 트래픽 소스 분류: RELATED_VIDEO → Algorithm, YT_SEARCH → Search,
//                   EXTERNAL → External, SUBSCRIBER → Subscriber
// 데이터: analytics.current.trafficSources (DimensionRow[])
// v2: QuickInsightBar 추가

import { useMemo } from "react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import QuickInsightBar from "./QuickInsightBar";
import {
  generateClusterInsights,
  generateClusterActions,
  zipPairs,
} from "@/engines/PanelInsightEngine";

// ─── 분류 맵 ─────────────────────────────────────────────────────────────────

const CLUSTER_MAP: Record<string, string> = {
  RELATED_VIDEO:        "Algorithm",
  YT_SEARCH:            "Search",
  EXTERNAL:             "External",
  SUBSCRIBER:           "Subscriber",
  YT_CHANNEL:           "Channel",
  YT_PLAYLIST_PAGE:     "Playlist",
  END_SCREEN:           "End Screen",
  NOTIFICATION:         "Notification",
  DIRECT_OR_UNKNOWN:    "Direct",
};

const CLUSTER_COLOR: Record<string, string> = {
  Algorithm:    T.primary,
  Search:       T.success,
  External:     "#f59e0b",
  Subscriber:   "#8b5cf6",
  Channel:      "#06b6d4",
  Playlist:     "#ec4899",
  "End Screen": "#6366f1",
  Notification: "#84cc16",
  Direct:       T.muted,
};

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtViews(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

// ─── 클러스터 집계 ────────────────────────────────────────────────────────────

interface ClusterItem {
  label:  string;
  views:  number;
  ratio:  number;
  color:  string;
}

function buildClusters(sources: DimensionRow[]): ClusterItem[] {
  const clusterMap = new Map<string, { views: number; ratio: number }>();

  for (const row of sources) {
    const label = CLUSTER_MAP[row.key] ?? row.key;
    const existing = clusterMap.get(label) ?? { views: 0, ratio: 0 };
    clusterMap.set(label, {
      views: existing.views + row.views,
      ratio: existing.ratio + row.ratio,
    });
  }

  return Array.from(clusterMap.entries())
    .map(([label, { views, ratio }]) => ({
      label,
      views,
      ratio,
      color: CLUSTER_COLOR[label] ?? T.muted,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

// ─── ClusterBar ───────────────────────────────────────────────────────────────

function ClusterBar({ item, maxRatio }: { item: ClusterItem; maxRatio: number }) {
  const barWidth = maxRatio > 0 ? (item.ratio / maxRatio) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      {/* 레이블 + 수치 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   item.color,
            flexShrink:   0,
          }} />
          <span style={{
            fontSize:   T.font.size.sm,
            color:      T.text,
          }}>
            {item.label}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            color:      T.muted,
          }}>
            {fmtViews(item.views)}
          </span>
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            color:      T.sub,
            minWidth:   40,
            textAlign:  "right",
          }}>
            {fmtPct(item.ratio)}
          </span>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div style={{
        height:       4,
        background:   T.bgSection,
        borderRadius: 2,
        overflow:     "hidden",
      }}>
        <div style={{
          width:        `${barWidth}%`,
          height:       "100%",
          background:   item.color,
          borderRadius: 2,
          transition:   "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

// ─── TrafficCluster ───────────────────────────────────────────────────────────

export default function TrafficCluster() {
  const { analytics, loadingAnalytics } = useAnalyticsContext();
  const sources = analytics?.current?.trafficSources ?? [];

  const clusters = useMemo(() => buildClusters(sources), [sources]);
  const maxRatio = clusters[0]?.ratio ?? 0;

  const pairs = useMemo(() => {
    const top = clusters[0];
    return zipPairs(
      generateClusterInsights(top?.label ?? "", top?.ratio ?? 0, clusters.length),
      generateClusterActions(top?.label ?? "", top?.ratio ?? 0),
    );
  }, [clusters]);

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
          유입 경로 분석
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          fontFamily: T.font.familyMono,
        }}>
          {clusters.length}개 소스
        </span>
      </div>

      {/* 데이터 */}
      {loadingAnalytics ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>로딩 중···</div>
      ) : clusters.length === 0 ? (
        <div style={{
          fontSize:  T.font.size.sm,
          color:     T.muted,
          textAlign: "center",
          padding:   `${T.spacing.xl}px 0`,
        }}>
          트래픽 데이터 없음
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.lg }}>
          {clusters.map((item) => (
            <ClusterBar key={item.label} item={item} maxRatio={maxRatio} />
          ))}
        </div>
      )}

      {/* Quick Insight Bar */}
      {!loadingAnalytics && <QuickInsightBar pairs={pairs} />}
    </div>
  );
}
