// ─── ContentStrategyGenerator ────────────────────────────────────────────────
// PHASE 8E — Opportunity → 콘텐츠 전략 아이디어 생성
//
// 입력: OpportunityResult (Phase 8D)
// 출력: ContentStrategy[]
//
// 매핑 규칙:
//   searchOpportunity(hot)       → 시리즈 기획 (priority: high)
//   searchOpportunity(growing)   → 단일 트랙 (priority: medium)
//   algorithmOpp(high_retention) → 확장 포맷 / 플레이리스트 (priority: high)
//   algorithmOpp(viral)          → Shorts 클립 (priority: medium)
//   externalOpp(trending)        → 커뮤니티 타겟 콘텐츠 (priority: high)
//   redirectRecommendation       → 홍보용 단일 트랙 (priority: medium)

import type { OpportunityResult } from "@/engines/opportunity/OpportunityEngine";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ContentType     = "series" | "single" | "playlist" | "shorts";
export type ContentPriority = "high" | "medium" | "low";
export type ContentSource   = "search" | "algorithm" | "external" | "promotion";

export interface ContentStrategy {
  title:      string;
  type:       ContentType;
  typeLabel:  string;
  reason:     string;
  priority:   ContentPriority;
  source:     ContentSource;
  tags:       string[];
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function typeLabel(t: ContentType): string {
  if (t === "series")   return "시리즈";
  if (t === "single")   return "단일 트랙";
  if (t === "playlist") return "플레이리스트";
  return "Shorts";
}

/** keyword → 영어 타이틀 케이스 변환 (단순) */
function toTitleCase(str: string): string {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── 생성 ─────────────────────────────────────────────────────────────────────

export function generateContentStrategies(
  opp: OpportunityResult,
): ContentStrategy[] {
  const results: ContentStrategy[] = [];
  const seenTitles = new Set<string>();

  function add(s: ContentStrategy) {
    if (!seenTitles.has(s.title)) {
      seenTitles.add(s.title);
      results.push(s);
    }
  }

  // ── 검색 기회 → 콘텐츠 아이디어 ──────────────────────────────────────────
  for (const s of opp.searchOpportunities.slice(0, 5)) {
    const base = toTitleCase(s.keyword);
    if (s.signal === "hot") {
      add({
        title:     `${base} Series`,
        type:      "series",
        typeLabel: typeLabel("series"),
        reason:    `검색 유입 ${s.ratioLabel} 차지 — 수요 검증된 키워드`,
        priority:  "high",
        source:    "search",
        tags:      [s.keyword, "series", "ambient"],
      });
    } else if (s.signal === "growing") {
      add({
        title:     `${base} — Vol.1`,
        type:      "single",
        typeLabel: typeLabel("single"),
        reason:    `성장 중인 검색 키워드 (${s.ratioLabel})`,
        priority:  "medium",
        source:    "search",
        tags:      [s.keyword, "single"],
      });
    }
  }

  // ── 알고리즘 기회 → 포맷 전략 ────────────────────────────────────────────
  for (const a of opp.algorithmOpportunities.slice(0, 4)) {
    if (a.signal === "high_retention") {
      add({
        title:     `${a.title} — Extended Playlist`,
        type:      "playlist",
        typeLabel: typeLabel("playlist"),
        reason:    `시청유지율 채널 대비 ${(a.retentionRatio * 100).toFixed(0)}% — 장편 포맷 확장 기회`,
        priority:  "high",
        source:    "algorithm",
        tags:      [a.title, "playlist", "extended"],
      });
    } else if (a.signal === "viral") {
      add({
        title:     `${a.title} — Shorts Cut`,
        type:      "shorts",
        typeLabel: typeLabel("shorts"),
        reason:    `조회 ${a.views.toLocaleString("ko-KR")}회 — Shorts 클립으로 노출 확장`,
        priority:  "medium",
        source:    "algorithm",
        tags:      [a.title, "shorts", "clip"],
      });
    }
  }

  // ── 외부 기회 → 커뮤니티 타겟 콘텐츠 ────────────────────────────────────
  for (const e of opp.externalOpportunities.slice(0, 3)) {
    const community = e.community.replace(/_/g, " ");
    if (e.signal === "trending" || e.signal === "active") {
      add({
        title:     `${toTitleCase(e.topSlug || community)} — Community Cut`,
        type:      "single",
        typeLabel: typeLabel("single"),
        reason:    `${community} 커뮤니티 ${e.clicks}회 클릭 — 타겟 콘텐츠 제작 기회`,
        priority:  e.signal === "trending" ? "high" : "medium",
        source:    "external",
        tags:      [e.community, e.topSlug, "community"],
      });
    }
  }

  // ── 홍보 추천 → 프로모션 콘텐츠 ─────────────────────────────────────────
  for (const r of opp.redirectRecommendations.slice(0, 3)) {
    if (r.confidence >= 0.5) {
      add({
        title:     `${r.title} — Promo Version`,
        type:      "single",
        typeLabel: typeLabel("single"),
        reason:    `${r.targetCommunity.replace(/_/g, " ")} 홍보용 — 신뢰도 ${Math.round(r.confidence * 100)}%`,
        priority:  r.confidence >= 0.7 ? "high" : "medium",
        source:    "promotion",
        tags:      [r.slug, r.targetCommunity, "promo"],
      });
    }
  }

  // priority 순 정렬 (high → medium → low)
  const order: Record<ContentPriority, number> = { high: 0, medium: 1, low: 2 };
  return results.sort((a, b) => order[a.priority] - order[b.priority]);
}
