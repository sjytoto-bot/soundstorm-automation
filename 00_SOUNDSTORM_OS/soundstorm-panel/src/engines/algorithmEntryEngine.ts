// ─── algorithmEntryEngine v2 ──────────────────────────────────────────────────
// Momentum / Growth / Traffic 데이터를 기반으로
// 영상의 YouTube 추천 알고리즘 진입 상태를 판단한다.
//
// 입력: TrackResult[]
//   — velocity, momentumScore, retentionRate, traffic.internalRatio 를 직접 참조
//   — 파이프라인의 TrackResult mutate 구조에 의존 (enginePipeline.ts)
//
// entryScore 공식 (가중 합산):
//   (velocity      ?? 0)   * 0.4
// + (momentumScore ?? 1.0) * 0.3   ← 미제공 시 중립값 1.0
// + internalRatio          * 0.2
// + (retentionRate ?? 0)   * 0.1
//
// 판단 기준:
//   score > 1.2  → "Algorithm Boost"
//   score > 0.9  → "Entering"
//   그 외         → "Normal"
//
// 4개 조건 플래그 (conditionsMet에 표시):
//   internalRatio > 0.55
//   velocity      > 0.15
//   momentumScore > 1.1
//   retentionRate > 0.35

import type { TrackResult } from "../core/enginePipeline";

// ─── 조건 플래그 ──────────────────────────────────────────────────────────────

export type AlgorithmCondition =
  | "HIGH_INTERNAL_TRAFFIC"  // internalRatio > 0.55
  | "VELOCITY_POSITIVE"      // velocity      > 0.15
  | "MOMENTUM_ELEVATED"      // momentumScore > 1.1
  | "RETENTION_ADEQUATE";    // retentionRate > 0.35

// ─── Result Types ─────────────────────────────────────────────────────────────

export type EntryStatus = "Normal" | "Entering" | "Algorithm Boost";

export interface AlgorithmEntryResult {
  videoId:       string;
  entryScore:    number;
  entryStatus:   EntryStatus;
  /** 충족된 조건 목록 */
  conditionsMet: AlgorithmCondition[];
  /** 각 입력값 스냅샷 (디버그 및 UI 표시용) */
  inputs: {
    velocity:      number;
    momentumScore: number;
    internalRatio: number;
    retentionRate: number;
  };
}

export interface AlgorithmEntryAnalysis {
  byVideo:       AlgorithmEntryResult[];
  boostCount:    number;
  enteringCount: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toStatus(score: number): EntryStatus {
  if (score > 1.2) return "Algorithm Boost";
  if (score > 0.9) return "Entering";
  return "Normal";
}

function checkConditions(
  velocity:      number,
  momentumScore: number,
  internalRatio: number,
  retentionRate: number,
): AlgorithmCondition[] {
  const met: AlgorithmCondition[] = [];
  if (internalRatio > 0.55) met.push("HIGH_INTERNAL_TRAFFIC");
  if (velocity      > 0.15) met.push("VELOCITY_POSITIVE");
  if (momentumScore > 1.1)  met.push("MOMENTUM_ELEVATED");
  if (retentionRate > 0.35) met.push("RETENTION_ADEQUATE");
  return met;
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 영상별 알고리즘 진입 상태를 분석한다.
 * TrackResult의 뮤테이션된 필드(velocity, momentumScore, retentionRate)를 직접 읽는다.
 *
 * @param tracks  TrackResult[]  enginePipeline tracks 출력 (mutate 완료 상태)
 * @returns       AlgorithmEntryAnalysis
 */
export function run(tracks: TrackResult[]): AlgorithmEntryAnalysis {
  const byVideo: AlgorithmEntryResult[] = tracks.map(t => {
    const velocity      = t.velocity      ?? 0;
    const momentumScore = t.momentumScore ?? 1.0; // 미제공(7일 초과) → 중립
    const internalRatio = t.traffic.internalRatio;
    const retentionRate = t.retentionRate ?? 0;

    const entryScore =
      velocity      * 0.4 +
      momentumScore * 0.3 +
      internalRatio * 0.2 +
      retentionRate * 0.1;

    return {
      videoId:       t.videoId,
      entryScore,
      entryStatus:   toStatus(entryScore),
      conditionsMet: checkConditions(velocity, momentumScore, internalRatio, retentionRate),
      inputs:        { velocity, momentumScore, internalRatio, retentionRate },
    };
  });

  return {
    byVideo,
    boostCount:    byVideo.filter(r => r.entryStatus === "Algorithm Boost").length,
    enteringCount: byVideo.filter(r => r.entryStatus === "Entering").length,
  };
}
