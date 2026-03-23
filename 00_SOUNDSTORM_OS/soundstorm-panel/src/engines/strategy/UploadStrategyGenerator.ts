// ─── UploadStrategyGenerator ─────────────────────────────────────────────────
// PHASE 8E — 업로드 전략 추천
//
// 분석 기준:
//   TimePattern[]          → 최적 업로드 시간
//   AlgorithmOpportunity[] → 추천 포맷 (길이·형식)
//   ExternalOpportunity[]  → 외부 커뮤니티 활동 기반 업로드 주기
//
// 출력: UploadStrategy[]

import type { TimePattern } from "@/engines/redirectIntelligence/TimePatternAnalyzer";
import type { AlgorithmOpportunity } from "@/engines/opportunity/AlgorithmOpportunityAnalyzer";
import type { ExternalOpportunity } from "@/engines/opportunity/ExternalOpportunityAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type UploadStrategyType = "timing" | "format" | "frequency" | "platform";

export interface UploadStrategy {
  type:           UploadStrategyType;
  typeLabel:      string;
  recommendation: string;
  reason:         string;
  confidence:     number;   // 0.0–1.0
  icon:           string;   // 표시용 기호 (텍스트)
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function typeLabel(t: UploadStrategyType): string {
  if (t === "timing")   return "업로드 시간";
  if (t === "format")   return "콘텐츠 포맷";
  if (t === "frequency") return "업로드 주기";
  return "플랫폼 전략";
}

function hourToKR(hour: number): string {
  const suffix = hour < 12 ? "오전" : hour < 18 ? "오후" : "저녁";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${suffix} ${display}시 (${String(hour).padStart(2, "0")}:00)`;
}

// ─── 전략 생성 ────────────────────────────────────────────────────────────────

export function generateUploadStrategies(
  timePatterns:         TimePattern[],
  algorithmOpps:        AlgorithmOpportunity[],
  externalOpps:         ExternalOpportunity[],
): UploadStrategy[] {
  const strategies: UploadStrategy[] = [];

  // ── 1. 최적 업로드 시간 ─────────────────────────────────────────────────
  if (timePatterns.length > 0) {
    const peak    = timePatterns.find(p => p.isPeak) ?? timePatterns[0];
    const top3    = timePatterns.slice(0, 3);
    const totalClicks = timePatterns.reduce((s, p) => s + p.clicks, 0);
    const peakRatio   = totalClicks > 0 ? peak.clicks / totalClicks : 0;

    strategies.push({
      type:           "timing",
      typeLabel:      typeLabel("timing"),
      recommendation: `${hourToKR(peak.hour)} 업로드 권장`,
      reason:         `외부 클릭의 ${(peakRatio * 100).toFixed(0)}%가 이 시간대에 집중 (top3: ${top3.map(p => `${p.hour}시`).join(", ")})`,
      confidence:     Math.min(0.5 + peakRatio * 2, 0.95),
      icon:           "[시간]",
    });
  } else {
    strategies.push({
      type:           "timing",
      typeLabel:      typeLabel("timing"),
      recommendation: "오후 8–10시 업로드 권장 (업계 표준)",
      reason:         "Redirect 클릭 데이터 없음 — 일반 권장 시간대 적용",
      confidence:     0.4,
      icon:           "[시간]",
    });
  }

  // ── 2. 콘텐츠 포맷 ─────────────────────────────────────────────────────
  const highRetentionCount = algorithmOpps.filter(a => a.signal === "high_retention").length;
  const viralCount         = algorithmOpps.filter(a => a.signal === "viral").length;

  if (highRetentionCount > 0) {
    const avgDuration = algorithmOpps
      .filter(a => a.signal === "high_retention")
      .reduce((s, a) => s + a.avgDurationSec, 0) / highRetentionCount;

    const formatHint = avgDuration > 3600
      ? "3–4시간 롱폼 플레이리스트"
      : avgDuration > 1200
      ? "20–30분 믹스 포맷"
      : "5–10분 단일 트랙";

    strategies.push({
      type:           "format",
      typeLabel:      typeLabel("format"),
      recommendation: `추천 포맷: ${formatHint}`,
      reason:         `시청유지율 상위 ${highRetentionCount}개 영상 평균 ${Math.round(avgDuration / 60)}분 — 같은 포맷 유지`,
      confidence:     Math.min(0.6 + highRetentionCount * 0.05, 0.90),
      icon:           "[포맷]",
    });
  } else if (viralCount > 0) {
    strategies.push({
      type:           "format",
      typeLabel:      typeLabel("format"),
      recommendation: "추천 포맷: 60초 Shorts + 풀버전 병행 업로드",
      reason:         `바이럴 가능성 ${viralCount}개 탐지 — Shorts로 노출 확장 후 풀버전으로 전환 유도`,
      confidence:     0.65,
      icon:           "[포맷]",
    });
  } else {
    strategies.push({
      type:           "format",
      typeLabel:      typeLabel("format"),
      recommendation: "추천 포맷: 1시간 테마 플레이리스트",
      reason:         "알고리즘 신호 미약 — 표준 롱폼 포맷으로 시청 시간 확보",
      confidence:     0.45,
      icon:           "[포맷]",
    });
  }

  // ── 3. 업로드 주기 ─────────────────────────────────────────────────────
  const trendingCount = externalOpps.filter(e => e.signal === "trending").length;
  const activeCount   = externalOpps.filter(e => e.signal === "active").length;

  if (trendingCount > 0) {
    strategies.push({
      type:           "frequency",
      typeLabel:      typeLabel("frequency"),
      recommendation: "주 2회 이상 업로드 권장",
      reason:         `트렌딩 외부 커뮤니티 ${trendingCount}개 — 모멘텀 유지 필요`,
      confidence:     0.80,
      icon:           "[주기]",
    });
  } else if (activeCount > 0) {
    strategies.push({
      type:           "frequency",
      typeLabel:      typeLabel("frequency"),
      recommendation: "주 1회 정기 업로드 권장",
      reason:         `활성 외부 커뮤니티 ${activeCount}개 — 꾸준한 콘텐츠 공급 유지`,
      confidence:     0.65,
      icon:           "[주기]",
    });
  } else {
    strategies.push({
      type:           "frequency",
      typeLabel:      typeLabel("frequency"),
      recommendation: "격주 1회 이상 업로드 권장",
      reason:         "외부 반응 초기 단계 — 품질 우선 전략 유지",
      confidence:     0.50,
      icon:           "[주기]",
    });
  }

  // ── 4. 플랫폼 전략 ─────────────────────────────────────────────────────
  if (externalOpps.length > 0) {
    const topPlatforms = externalOpps
      .slice(0, 2)
      .map(e => e.community.replace(/_/g, " "))
      .join(", ");

    strategies.push({
      type:           "platform",
      typeLabel:      typeLabel("platform"),
      recommendation: `${topPlatforms} 우선 배포`,
      reason:         `해당 커뮤니티에서 가장 높은 외부 클릭 반응 확인`,
      confidence:     0.75,
      icon:           "[플랫폼]",
    });
  }

  return strategies.sort((a, b) => b.confidence - a.confidence);
}
