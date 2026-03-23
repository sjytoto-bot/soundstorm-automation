// ─── ThemeIntelligenceEngine (STAGE 4) ────────────────────────────────────────
// 채널 데이터 + ContentPack 이력 → 다음 테마 추천
//
// 소스 우선순위:
//   1. hypothesis  — 고성과 Pack 테마 파생 (가장 신뢰도 높음)
//   2. performance — 상위 CTR 영상 키워드 (채널 증명 데이터)
//   3. momentum    — 상승 중인 토픽 (트렌드 기반)
//   4. opportunity — 기회 영상 제목 (경쟁 분석)
//
// 출력: ThemeSuggestion[] (score 내림차순, 최대 8개)
// 사용: DashboardPage suggestedThemes → ContentPackManager / GrowthLoopMonitor

import type { ReachRow } from "@/adapters/reachAdapter";
import type { ContentPack } from "@/core/types/contentPack";
import { calcPerformanceScore } from "./packPerformanceEngine";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ThemeSource = "hypothesis" | "performance" | "momentum" | "opportunity";

export interface ThemeSuggestion {
  theme:      string;
  score:      number;      // 0–100
  confidence: number;      // 0.0–1.0
  reason:     string;
  source:     ThemeSource;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

/** 이미 진행 중인 테마 (idea/draft/ready/uploaded) → 중복 제외 */
function usedThemes(packs: ContentPack[]): Set<string> {
  return new Set(
    packs
      .filter(p => p.status !== "analyzing") // analyzing 완료된 건 재사용 가능
      .map(p => p.theme.trim().toLowerCase()),
  );
}

/**
 * 영상 제목에서 후보 키워드 추출
 * 구분자: | , – — · 를 기준으로 파트 분리
 * 조건: 3–40자, 숫자만 아닌 것
 */
function extractKeywords(title: string): string[] {
  return title
    .split(/[|,–—·]/)
    .map(s => s.trim())
    .filter(s => s.length >= 3 && s.length <= 40 && /[a-zA-Z가-힣]/.test(s));
}

// ─── 소스별 생성 ──────────────────────────────────────────────────────────────

/** 1. 고성과 Pack → 파생 테마 */
function fromHypothesis(
  packs:   ContentPack[],
  used:    Set<string>,
): ThemeSuggestion[] {
  const analyzed = packs.filter(
    p => p.status === "analyzing" && p.performance != null,
  );
  if (analyzed.length === 0) return [];

  return analyzed
    .map(p => ({ pack: p, score: calcPerformanceScore(p.performance!).total }))
    .filter(({ score }) => score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .filter(({ pack }) => !used.has(pack.theme.trim().toLowerCase()))
    .map(({ pack, score }) => ({
      theme:      pack.theme,
      score:      Math.min(93, score + 12),
      confidence: Math.min(0.90, 0.60 + score / 250),
      reason:     `유사 Pack 성과 ${score}점 — 검증된 테마`,
      source:     "hypothesis" as ThemeSource,
    }));
}

/** 2. 고성과 영상 제목 키워드 — CTR + 조회수 복합 점수 */
function fromPerformance(
  rows: ReachRow[],
  used: Set<string>,
): ThemeSuggestion[] {
  // 조회수 중앙값 계산 (상대적 인기 판단 기준)
  const viewsSorted = [...rows].map(r => r.views).sort((a, b) => a - b);
  const viewsMedian = viewsSorted[Math.floor(viewsSorted.length / 2)] ?? 0;

  const eligible = rows
    .filter(r => r.ctr != null && (r.ctr ?? 0) > 0.025 && (r.impressions ?? 0) >= 300)
    .map(r => {
      const ctr   = r.ctr ?? 0;
      // 조회수 보너스: 중앙값 대비 상위 영상에 +10점까지 추가
      const viewsBonus = viewsMedian > 0
        ? Math.min(10, Math.round((r.views / viewsMedian - 1) * 5))
        : 0;
      return { r, ctr, viewsBonus };
    })
    .sort((a, b) => {
      // CTR 점수 + views 보너스 복합 정렬
      const scoreA = a.ctr * 900 + a.viewsBonus;
      const scoreB = b.ctr * 900 + b.viewsBonus;
      return scoreB - scoreA;
    })
    .slice(0, 12);

  const out: ThemeSuggestion[] = [];
  for (const { r, ctr, viewsBonus } of eligible) {
    const kws = extractKeywords(r.title ?? "");
    for (const kw of kws.slice(0, 2)) {
      if (used.has(kw.toLowerCase())) continue;
      const baseScore = Math.min(90, Math.round(58 + ctr * 900));
      const reason = viewsBonus >= 5
        ? `CTR ${(ctr * 100).toFixed(1)}% + 조회수 상위 영상 키워드`
        : `CTR ${(ctr * 100).toFixed(1)}% 고성과 영상 키워드`;
      out.push({
        theme:      kw,
        score:      Math.min(90, baseScore + Math.max(0, viewsBonus)),
        confidence: Math.min(0.87, 0.52 + ctr * 4.5 + (viewsBonus >= 5 ? 0.05 : 0)),
        reason,
        source:     "performance",
      });
    }
  }
  return out;
}

/** 3. 상승 중인 토픽 */
function fromMomentum(
  topicMomentum: Array<{ topic: string; trend?: string }>,
  used:          Set<string>,
): ThemeSuggestion[] {
  return topicMomentum
    .filter(t => (t.trend === "up" || t.trend === "rising") && !used.has(t.topic.toLowerCase()))
    .map(t => {
      const theme = t.topic.charAt(0).toUpperCase() + t.topic.slice(1).toLowerCase();
      return {
        theme,
        score:      73,
        confidence: 0.68,
        reason:     "채널 내 상승 중인 토픽",
        source:     "momentum" as ThemeSource,
      };
    });
}

/** 4. 기회 영상 제목 → 키워드 추출 */
function fromOpportunity(
  titles: string[],
  used:   Set<string>,
): ThemeSuggestion[] {
  return titles.flatMap(title => {
    const kws = extractKeywords(title);
    return kws
      .filter(kw => !used.has(kw.toLowerCase()))
      .slice(0, 1)
      .map(kw => ({
        theme:      kw,
        score:      65,
        confidence: 0.60,
        reason:     "유사 채널 기회 영상 키워드",
        source:     "opportunity" as ThemeSource,
      }));
  });
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

/**
 * 채널 데이터 종합 → 다음 테마 추천
 *
 * @param reachRows        reachAdapter fetchReachData() 결과
 * @param packs            현재 ContentPack[]
 * @param topicMomentum    execution.topicMomentum (topic + trend 필드)
 * @param opportunityTitles opportunityVideos 제목 목록
 * @returns ThemeSuggestion[] score 내림차순, 최대 8개
 */
export function generateThemeSuggestions(
  reachRows:          ReachRow[],
  packs:              ContentPack[],
  topicMomentum:      Array<{ topic: string; trend?: string }>,
  opportunityTitles:  string[],
): ThemeSuggestion[] {
  const used = usedThemes(packs);

  const all = [
    ...fromHypothesis(packs, used),
    ...fromPerformance(reachRows, used),
    ...fromMomentum(topicMomentum, used),
    ...fromOpportunity(opportunityTitles, used),
  ];

  // 테마 이름 기준 중복 제거 — 높은 점수 우선
  const map = new Map<string, ThemeSuggestion>();
  for (const s of all) {
    const key = s.theme.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing || existing.score < s.score) {
      map.set(key, s);
    }
  }

  return [...map.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/** ThemeSuggestion[] → string[] (ContentPackManager 호환) */
export function toThemeStrings(suggestions: ThemeSuggestion[]): string[] {
  return suggestions.map(s => s.theme);
}
