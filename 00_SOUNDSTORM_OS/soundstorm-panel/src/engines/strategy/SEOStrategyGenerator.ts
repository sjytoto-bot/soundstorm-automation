// ─── SEOStrategyGenerator ────────────────────────────────────────────────────
// PHASE 8E — 검색 기회 → SEO 키워드 전략 생성
//
// 입력: SearchOpportunity[]
// 출력: SEOStrategy[]
//
// 전략:
//   hot keyword    → 제목 전면 배치 + 시리즈 태그
//   growing keyword → 조합 태그 + 롱테일 제목 제안
//   niche keyword  → 틈새 타겟 제목 + 전문 태그

import type { SearchOpportunity, SearchSignal } from "@/engines/opportunity/SearchOpportunityAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type SEOPriority = "high" | "medium" | "low";

export interface SEOStrategy {
  keyword:       string;
  signal:        SearchSignal;
  ratioLabel:    string;
  priority:      SEOPriority;
  titleTemplate: string;     // 영상 제목 템플릿 예시
  description:   string;     // 설명문 키워드 제안
  tags:          string[];   // YouTube 태그 추천
}

// ─── 빌더 ─────────────────────────────────────────────────────────────────────

function buildTitleTemplate(keyword: string, signal: SearchSignal): string {
  const k = keyword.toLowerCase();

  if (signal === "hot") {
    return `${keyword} 🎵 Epic ${titleCase(keyword)} Music | No Copyright`;
  }
  if (signal === "growing") {
    // 장르 추측 기반 조합
    if (k.includes("ambient") || k.includes("lofi") || k.includes("bgm")) {
      return `${keyword} | 1 Hour Study & Focus Music`;
    }
    if (k.includes("battle") || k.includes("war") || k.includes("epic")) {
      return `${keyword} | Intense Battle Soundtrack`;
    }
    if (k.includes("dark") || k.includes("noir") || k.includes("shadow")) {
      return `${keyword} | Dark Atmospheric Music`;
    }
    return `${keyword} | Best ${titleCase(keyword)} Music 2025`;
  }
  return `${keyword} Music — Royalty Free`;
}

function buildTags(keyword: string, signal: SearchSignal): string[] {
  const base = keyword.toLowerCase().split(/\s+/);
  const common = ["no copyright music", "royalty free", "background music"];

  if (signal === "hot") {
    return [...base, ...base.map(w => `${w} music`), "epic music", "gaming music", ...common];
  }
  if (signal === "growing") {
    return [...base, `${keyword} playlist`, `${keyword} 1 hour`, ...common];
  }
  return [...base, `${keyword} soundtrack`, ...common.slice(0, 2)];
}

function buildDescription(keyword: string): string {
  return `${keyword} | free background music | no copyright | ${keyword} soundtrack | ${keyword} playlist`;
}

function titleCase(str: string): string {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function signalToPriority(signal: SearchSignal): SEOPriority {
  if (signal === "hot")     return "high";
  if (signal === "growing") return "medium";
  return "low";
}

// ─── 생성 ─────────────────────────────────────────────────────────────────────

export function generateSEOStrategies(
  searchOpportunities: SearchOpportunity[],
): SEOStrategy[] {
  if (!searchOpportunities || searchOpportunities.length === 0) return [];

  return searchOpportunities.map(s => ({
    keyword:       s.keyword,
    signal:        s.signal,
    ratioLabel:    s.ratioLabel,
    priority:      signalToPriority(s.signal),
    titleTemplate: buildTitleTemplate(s.keyword, s.signal),
    description:   buildDescription(s.keyword),
    tags:          buildTags(s.keyword, s.signal),
  }));
}
