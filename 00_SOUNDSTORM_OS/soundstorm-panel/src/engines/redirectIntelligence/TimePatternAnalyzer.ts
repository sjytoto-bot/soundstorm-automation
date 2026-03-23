// ─── redirectIntelligence / TimePatternAnalyzer ──────────────────────────────
// PHASE 8C — 외부 클릭 시간 패턴 분석
//
// timestamp (ISO 8601, UTC) → 시간대별(0~23시) 클릭 분포
// peak 시간대 자동 감지
//
// 입력: RedirectLog[]
// 출력: TimePattern[]

import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface TimePattern {
  hour:   number;   // 0–23 (UTC 기준)
  clicks: number;
  isPeak: boolean;  // 최다 클릭 시간대 여부
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeTimePatterns(logs: RedirectLog[]): TimePattern[] {
  if (!logs || logs.length === 0) return [];

  const counts = new Array<number>(24).fill(0);

  for (const log of logs) {
    const ts = log.timestamp;
    if (!ts) continue;

    // ISO 8601: "2026-03-11T18:55:27" → hour
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    if (isNaN(d.getTime())) continue;

    counts[d.getUTCHours()] += 1;
  }

  const maxClicks = Math.max(...counts);

  return counts
    .map((clicks, hour) => ({
      hour,
      clicks,
      isPeak: clicks > 0 && clicks === maxClicks,
    }))
    .filter(p => p.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks);
}

// ─── 피크 시간대 레이블 ───────────────────────────────────────────────────────

export function peakHourLabel(hour: number): string {
  if (hour >= 6  && hour < 9)  return "아침";
  if (hour >= 9  && hour < 12) return "오전";
  if (hour >= 12 && hour < 14) return "점심";
  if (hour >= 14 && hour < 18) return "오후";
  if (hour >= 18 && hour < 22) return "저녁";
  return "심야";
}
