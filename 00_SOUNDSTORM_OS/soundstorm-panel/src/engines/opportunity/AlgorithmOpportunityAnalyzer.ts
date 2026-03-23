// ─── AlgorithmOpportunityAnalyzer ────────────────────────────────────────────
// PHASE 8D — 추천 알고리즘 확장 가능 콘텐츠 탐지
//
// 입력: videos: DimensionRow[]  (hitVideos — all-time rankings)
//        channelAvgDurationSec: number (채널 평균 시청 시간)
//
// 신호 분류:
//   avgDurationSec > channelAvg * 1.3 → "high_retention" (평균 대비 30% 이상 높음)
//   views top 20% && avgDurationSec >= channelAvg → "viral"
//   그 외 → "steady"

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type AlgorithmSignal = "high_retention" | "viral" | "steady";

export interface AlgorithmOpportunity {
  videoId:         string;
  title:           string;
  views:           number;
  avgDurationSec:  number;
  watchTimeMin:    number;
  signal:          AlgorithmSignal;
  signalLabel:     string;
  retentionRatio:  number;   // avgDurationSec / channelAvgDurationSec
  action:          string;
}

// ─── 분류 ─────────────────────────────────────────────────────────────────────

function classifySignal(
  avgDuration: number,
  channelAvg:  number,
  views:       number,
  topViewsThreshold: number,
): AlgorithmSignal {
  const retentionHigh = channelAvg > 0 && avgDuration > channelAvg * 1.3;
  if (retentionHigh) return "high_retention";
  if (views >= topViewsThreshold && avgDuration >= channelAvg) return "viral";
  return "steady";
}

function signalLabel(s: AlgorithmSignal): string {
  if (s === "high_retention") return "고 시청유지율";
  if (s === "viral")          return "바이럴 잠재력";
  return "안정 성과";
}

function buildAction(title: string, signal: AlgorithmSignal): string {
  const t = title || "해당 영상";
  if (signal === "high_retention") return `"${t}" — 재생목록·엔드스크린 최적화로 알고리즘 확장`;
  if (signal === "viral")          return `"${t}" — 유사 콘텐츠 시리즈화 및 Shorts 클립 제작`;
  return `"${t}" — 썸네일·제목 A/B 테스트로 노출 개선`;
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeAlgorithmOpportunities(
  videos:               DimensionRow[],
  channelAvgDurationSec: number = 0,
): AlgorithmOpportunity[] {
  if (!videos || videos.length === 0) return [];

  const validVideos = videos.filter(v => v.key && v.views > 0);
  if (validVideos.length === 0) return [];

  // top 20% views 기준값
  const sorted = [...validVideos].sort((a, b) => b.views - a.views);
  const top20idx = Math.max(0, Math.floor(sorted.length * 0.2) - 1);
  const topViewsThreshold = sorted[top20idx]?.views ?? 0;

  const channelAvg = channelAvgDurationSec > 0
    ? channelAvgDurationSec
    : validVideos.reduce((s, v) => s + (v.avgDurationSec ?? 0), 0) / validVideos.length;

  return sorted
    .map(v => {
      const avgDuration = v.avgDurationSec ?? 0;
      const signal = classifySignal(avgDuration, channelAvg, v.views, topViewsThreshold);
      const retentionRatio = channelAvg > 0 ? avgDuration / channelAvg : 0;
      return {
        videoId:        v.key,
        title:          v.title ?? v.key,
        views:          v.views,
        avgDurationSec: avgDuration,
        watchTimeMin:   v.watchTimeMin ?? 0,
        signal,
        signalLabel:    signalLabel(signal),
        retentionRatio,
        action:         buildAction(v.title ?? v.key, signal),
      };
    })
    .sort((a, b) => {
      // high_retention → viral → steady 순, 같으면 views 내림차순
      const order: Record<AlgorithmSignal, number> = { high_retention: 0, viral: 1, steady: 2 };
      const diff = order[a.signal] - order[b.signal];
      return diff !== 0 ? diff : b.views - a.views;
    });
}
