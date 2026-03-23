// ─── packPerformanceEngine ────────────────────────────────────────────────────
// Content Pack 성과 Score 계산 엔진
//
// 공식:
//   score = CTR_score * 0.4 + Retention_score * 0.4 + ViewsVelocity_score * 0.2
//
// 각 항목 정규화 기준 (0~100):
//   CTR:           업계 평균 4% 기준 → 0%=0, 8%+=100
//   Retention:     watch_time / (views * 가정 영상 길이 5분) 기준 → 대리 지표
//   ViewsVelocity: views 구간별 점수 (채널 규모 무관한 상대 평가)
//
// 사용처: ContentPackCard (PerformanceSection), GrowthLoopMonitor
// UI 레이어에서 직접 계산 금지 — 이 엔진 함수만 사용

import type { ContentPerformance } from "@/core/types/contentPack";

// ─── 내부 정규화 함수 ─────────────────────────────────────────────────────────

/** CTR (0~1 범위) → 0~100 점수 */
function ctrScore(ctr?: number): number {
  if (!ctr || ctr <= 0) return 0;
  // 0% = 0pt, 4%(0.04) = 50pt, 8%(0.08)+ = 100pt
  return Math.min(100, Math.round((ctr / 0.08) * 100));
}

/** views 구간 → 0~100 점수 (상대 평가) */
function viewsScore(views?: number): number {
  if (!views || views <= 0) return 0;
  if (views >= 100_000) return 100;
  if (views >= 50_000)  return 85;
  if (views >= 20_000)  return 70;
  if (views >= 10_000)  return 55;
  if (views >= 5_000)   return 40;
  if (views >= 1_000)   return 25;
  return 10;
}

/**
 * Retention 대리 지표 → 0~100 점수
 * watch_time(분) / (views * 5분) — 평균 시청 비율 추정
 * watch_time 없을 경우 0 반환 (없는 데이터를 임의 추정하지 않음)
 */
function retentionScore(perf: ContentPerformance): number {
  if (!perf.watch_time || !perf.views || perf.views <= 0) return 0;
  const assumedLength = 5; // 분 단위 가정 영상 길이
  const ratio = perf.watch_time / (perf.views * assumedLength);
  return Math.min(100, Math.round(ratio * 100));
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export interface PerformanceScore {
  total:     number;  // 0~100 종합 점수
  ctr:       number;  // CTR 항목 점수 (0~100)
  retention: number;  // Retention 항목 점수 (0~100)
  velocity:  number;  // ViewsVelocity 항목 점수 (0~100)
  grade:     "S" | "A" | "B" | "C" | "F";
}

/**
 * ContentPerformance → PerformanceScore 계산
 * score = CTR*0.4 + Retention*0.4 + ViewsVelocity*0.2
 */
export function calcPerformanceScore(perf: ContentPerformance): PerformanceScore {
  const ctr       = ctrScore(perf.ctr);
  const retention = retentionScore(perf);
  const velocity  = viewsScore(perf.views);

  const total = Math.round(ctr * 0.4 + retention * 0.4 + velocity * 0.2);

  const grade: PerformanceScore["grade"] =
    total >= 80 ? "S" :
    total >= 65 ? "A" :
    total >= 45 ? "B" :
    total >= 25 ? "C" : "F";

  return { total, ctr, retention, velocity, grade };
}

/**
 * Score → 표시 색상 매핑
 * 사용처: PerformanceSection, GrowthLoopMonitor
 */
export function scoreColor(total: number): string {
  if (total >= 65) return "#22C55E";  // T.color.success
  if (total >= 40) return "#F59E0B";  // T.color.warning
  return "#EF4444";                   // T.color.danger
}
