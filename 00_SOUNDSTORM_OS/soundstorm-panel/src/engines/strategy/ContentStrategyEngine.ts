// ─── ContentStrategyEngine v3 ────────────────────────────────────────────────
// Opportunity Signal → 콘텐츠 전략 카드 통합 생성
//
// 입력:
//   OpportunityResult  — search / algorithm / external signals
//   hitVideos          — 기존 콘텐츠 존재 여부 판단용
//
// 출력: StrategyCard[]  최대 7개
//   HOT_OPPORTUNITY  (2개)  — 알고리즘 고유지율·바이럴 포맷 확장
//   KEYWORD_STRATEGY (5개)  — 키워드별 그룹화된 전략 카드 (중복 제거)
//
// v3 변경:
//   - actions: string[] → StrategyAction[] (priority 번호 부여)
//   - HOT 카드도 actions[] 구조로 통일
//   - normalizeKeyword() 으로 키워드 중복 방지 ("국악비트" / "국악 비트" 통합)
//
// 정렬: type 우선순위 → growth DESC

import type { OpportunityResult } from "@/engines/opportunity/OpportunityEngine";
import type { DimensionRow }      from "@/adapters/AnalyticsAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type StrategyCardType =
  | "HOT_OPPORTUNITY"
  | "KEYWORD_STRATEGY";

export type StrategyLabel = "HOT" | "GROWING" | "STRATEGY";

export interface StrategyAction {
  priority: number;   // 1 = 가장 중요
  text:     string;
}

export interface StrategyCard {
  id:           string;
  cardType:     StrategyCardType;
  label:        StrategyLabel;
  title:        string;
  description?: string;
  growth?:      number;      // 표시용 성장 지표 (%)
  confidence?:  number;      // 0.0–1.0
  actions?:     StrategyAction[];
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

/** 공백 제거 + 소문자 → 동일 키워드 중복 방지 */
function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/g, "");
}

/** hitVideos 제목에 keyword가 포함되면 existingContent = true */
function hasExisting(keyword: string, hitVideos: DimensionRow[]): boolean {
  const kw = keyword.toLowerCase();
  return hitVideos.some(v => (v.title ?? v.key).toLowerCase().includes(kw));
}

function makeId(type: string, idx: number): string {
  return `cse_${type}_${idx}`;
}

// ─── HOT_OPPORTUNITY (알고리즘 기반) ─────────────────────────────────────────

function buildHotOpportunities(opp: OpportunityResult): StrategyCard[] {
  return opp.algorithmOpportunities
    .filter(a => a.signal !== "steady")
    .slice(0, 2)
    .map((a, i) => {
      const isLongForm = a.avgDurationSec > 3600;
      const title = isLongForm
        ? `"${a.title}" 장편 플레이리스트 전략`
        : a.signal === "high_retention"
        ? `"${a.title}" 시리즈 확장 전략`
        : `"${a.title}" 유사 콘텐츠 시리즈 전략`;

      const actions: StrategyAction[] = isLongForm
        ? [
            { priority: 1, text: "4시간 이상 플레이리스트를 추가 제작하세요" },
            { priority: 2, text: "기존 영상을 플레이리스트로 묶어 연속 재생을 유도하세요" },
            { priority: 3, text: "제목에 '전체 모음' 또는 '연속재생' 키워드를 포함하세요" },
          ]
        : [
            { priority: 1, text: `"${a.title}" 유사 포맷으로 시리즈를 연속 제작하세요` },
            { priority: 2, text: "엔드스크린에 관련 영상 링크를 추가하세요" },
            { priority: 3, text: "재생목록을 신규 시청자 진입 포인트로 설정하세요" },
          ];

      return {
        id:          makeId("hot", i),
        cardType:    "HOT_OPPORTUNITY" as const,
        label:       "HOT" as const,
        title,
        description: `${a.signalLabel} — 채널 평균 대비 ${(a.retentionRatio * 100).toFixed(0)}% 시청유지`,
        growth:      a.retentionRatio * 50,
        confidence:  a.signal === "high_retention" ? 0.88 : 0.65,
        actions,
      };
    });
}

// ─── KEYWORD_STRATEGY (검색 키워드 기반 — 키워드당 1카드) ────────────────────

function buildKeywordStrategies(
  opp:       OpportunityResult,
  hitVideos: DimensionRow[],
): StrategyCard[] {
  const seen = new Set<string>();
  const cards: StrategyCard[] = [];

  for (const s of opp.searchOpportunities.filter(s => s.signal !== "niche")) {
    if (cards.length >= 5) break;

    // normalizeKeyword 기반 중복 방지
    const norm = normalizeKeyword(s.keyword);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const existing = hasExisting(s.keyword, hitVideos);
    const label: StrategyLabel = s.signal === "hot" ? "HOT" : "GROWING";

    // 실행 우선순위 번호 부여 (priority 1 = 가장 중요)
    const actions: StrategyAction[] = [
      { priority: 1, text: `제목에 "${s.keyword}" 키워드를 포함하세요` },
      { priority: 2, text: `설명·해시태그에 "${s.keyword}" 동일 키워드를 적용하세요` },
      {
        priority: 3,
        text: existing
          ? "기존 영상 메타데이터를 일괄 업데이트하세요"
          : "소규모 테스트 업로드로 수요를 확인하세요",
      },
    ];

    cards.push({
      id:          makeId("kw", cards.length),
      cardType:    "KEYWORD_STRATEGY" as const,
      label,
      title:       `"${s.keyword}" 키워드 전략`,
      description: `검색 유입 ${s.ratioLabel} — ${existing ? "메타데이터 최적화" : "신규 시리즈 기회"}`,
      growth:      s.ratio * 100,
      confidence:  s.signal === "hot" ? 0.90 : 0.70,
      actions,
    });
  }

  return cards;
}

// ─── 통합 생성 함수 ───────────────────────────────────────────────────────────

const TYPE_ORDER: Record<StrategyCardType, number> = {
  HOT_OPPORTUNITY:  0,
  KEYWORD_STRATEGY: 1,
};

export function generateContentStrategy(
  opp:      OpportunityResult,
  hitVideos: DimensionRow[] = [],
): StrategyCard[] {
  const hot      = buildHotOpportunities(opp);
  const keywords = buildKeywordStrategies(opp, hitVideos);

  const all = [...hot, ...keywords];

  // type 우선순위 → growth 내림차순
  all.sort((a, b) => {
    const byType = TYPE_ORDER[a.cardType] - TYPE_ORDER[b.cardType];
    if (byType !== 0) return byType;
    return (b.growth ?? 0) - (a.growth ?? 0);
  });

  return all.slice(0, 7);
}
