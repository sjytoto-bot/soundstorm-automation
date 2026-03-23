// ─── External Insight Rules ───────────────────────────────────────────────────
// category + intent + audience → strategy insight 규칙
//
// 각 Rule은 조건 함수(match)와 insight/action 생성 함수(build)로 구성.
// build 함수는 AudienceEnrichedReferrer를 받아 audience context를 reason에 반영.
// ExternalStrategyGenerator가 순서대로 평가하여 첫 번째 매칭 규칙을 적용.

import type { AudienceEnrichedReferrer } from "./AudienceAnalyzer";
import { PlatformCategory }              from "./externalPlatformCategory";

export interface ExternalInsight {
  platform:          string;
  category:          string;
  intent:            string;
  audience:          string;   // 추가: 주요 유입 사용자 유형
  consumptionReason: string;   // 추가: 콘텐츠 소비 이유
  action:            string;
  reason:            string;
  impact:            number;   // 0-100
  confidence:        number;   // 0-100
}

export interface InsightRule {
  id:    string;
  match: (r: AudienceEnrichedReferrer) => boolean;
  build: (r: AudienceEnrichedReferrer) => Pick<ExternalInsight, "action" | "reason">;
  baseImpact:     number;
  baseConfidence: number;
}

// ─── audience context 주입 헬퍼 ──────────────────────────────────────────────

function withAudience(base: string, r: AudienceEnrichedReferrer): string {
  if (!r.audienceProfile) return base;
  return `${base} 주요 유입 유저: ${r.audience}(${r.consumptionReason}).`;
}

// ─── 전략 규칙 정의 ───────────────────────────────────────────────────────────

export const EXTERNAL_INSIGHT_RULES: InsightRule[] = [

  // Rule 1 — 네이버 검색 SEO
  {
    id:    "naver_seo",
    match: r => r.platform === "NAVER",
    build: r => ({
      action: "네이버 SEO 키워드를 강화하세요",
      reason: withAudience(
        `네이버 검색 기반 외부 유입이 감지되었습니다 (${r.views.toLocaleString("ko-KR")}회).`,
        r,
      ),
    }),
    baseImpact:     75,
    baseConfidence: 80,
  },

  // Rule 2 — AI 검색 발견
  {
    id:    "ai_discovery",
    match: r => r.category === PlatformCategory.AI,
    build: r => ({
      action: "AI 검색 최적화 콘텐츠를 제작하세요",
      reason: withAudience(
        `${r.platformLabel}에서 AI 추천 기반 외부 유입이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 질문형 제목과 명확한 설명이 AI 인덱싱에 유리합니다.`,
        r,
      ),
    }),
    baseImpact:     82,
    baseConfidence: 72,
  },

  // Rule 3 — 메신저 공유
  {
    id:    "messaging_share",
    match: r => r.category === PlatformCategory.MESSAGING,
    build: r => ({
      action: "30초 음악 미리듣기 클립을 제작하세요",
      reason: withAudience(
        `${r.platformLabel}을 통한 메신저 공유 기반 트래픽이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 공유하기 쉬운 하이라이트 클립이 바이럴에 효과적입니다.`,
        r,
      ),
    }),
    baseImpact:     68,
    baseConfidence: 78,
  },

  // Rule 4 — Instagram 소셜 발견
  {
    id:    "instagram_discovery",
    match: r => r.platform === "INSTAGRAM",
    build: r => ({
      action: "Instagram용 Reels 형식 Short 클립을 제작하세요",
      reason: withAudience(
        `Instagram 발견형 트래픽이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 세로형 비율 + 훅 3초 이내 설계가 노출을 높입니다.`,
        r,
      ),
    }),
    baseImpact:     72,
    baseConfidence: 75,
  },

  // Rule 5 — 소셜 발견 (일반)
  {
    id:    "social_discovery",
    match: r => r.category === PlatformCategory.SOCIAL,
    build: r => ({
      action: "SNS 공유용 Short 콘텐츠를 제작하세요",
      reason: withAudience(
        `${r.platformLabel} SNS 발견형 트래픽이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). Short 콘텐츠 병행 제작으로 소셜 도달률을 확장하세요.`,
        r,
      ),
    }),
    baseImpact:     65,
    baseConfidence: 70,
  },

  // Rule 6 — Discord 커뮤니티
  {
    id:    "discord_community",
    match: r => r.platform === "DISCORD",
    build: r => ({
      action: "Discord 서버 채널 배포 전략을 구성하세요",
      reason: withAudience(
        `Discord 커뮤니티 기반 공유 트래픽이 감지되었습니다 (${r.views.toLocaleString("ko-KR")}회). 음악 관련 서버에 정기 신보 공유 루틴을 만드세요.`,
        r,
      ),
    }),
    baseImpact:     70,
    baseConfidence: 74,
  },

  // Rule 7 — 커뮤니티 공유 (일반)
  {
    id:    "community_share",
    match: r => r.category === PlatformCategory.COMMUNITY,
    build: r => ({
      action: "커뮤니티 배포 전략을 체계화하세요",
      reason: withAudience(
        `${r.platformLabel} 커뮤니티에서 공유 트래픽이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 해당 커뮤니티에 지속적으로 콘텐츠를 공유하세요.`,
        r,
      ),
    }),
    baseImpact:     62,
    baseConfidence: 68,
  },

  // Rule 8 — 블로그 레퍼런스
  {
    id:    "blog_reference",
    match: r => r.category === PlatformCategory.BLOG,
    build: r => ({
      action: "블로그 임베드용 콘텐츠를 강화하세요",
      reason: withAudience(
        `${r.platformLabel} 블로그에서 레퍼런스 유입이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 임베드하기 좋은 장르·분위기 설명을 영상 설명란에 추가하세요.`,
        r,
      ),
    }),
    baseImpact:     55,
    baseConfidence: 65,
  },

  // Rule 9 — 협업 도구 임베드
  {
    id:    "collab_embed",
    match: r => r.category === PlatformCategory.COLLAB,
    build: r => ({
      action: "협업/프로젝트 사용 맞춤 라이선스 패키지를 준비하세요",
      reason: withAudience(
        `${r.platformLabel}에서 프로젝트 임베드 기반 유입이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). BGM 라이선스 패키지를 전면에 내세우세요.`,
        r,
      ),
    }),
    baseImpact:     78,
    baseConfidence: 62,
  },

  // Rule 10 — 미디어 플레이어
  {
    id:    "media_player",
    match: r => r.category === PlatformCategory.MEDIA,
    build: r => ({
      action: "같이 듣기 플랫폼 전용 플레이리스트를 구성하세요",
      reason: withAudience(
        `${r.platformLabel} 미디어 플레이어를 통한 유입이 발생했습니다 (${r.views.toLocaleString("ko-KR")}회). 테마별 플레이리스트 큐레이션으로 연속 시청을 유도하세요.`,
        r,
      ),
    }),
    baseImpact:     60,
    baseConfidence: 65,
  },

  // Rule 11 — 일반 검색 (Daum, Brave 등)
  {
    id:    "search_general",
    match: r => r.category === PlatformCategory.SEARCH,
    build: r => ({
      action: `${r.platformLabel} 검색 키워드 최적화를 진행하세요`,
      reason: withAudience(
        `${r.platformLabel} 검색 기반 외부 유입이 감지되었습니다 (${r.views.toLocaleString("ko-KR")}회). 제목과 태그의 SEO 전략을 점검하세요.`,
        r,
      ),
    }),
    baseImpact:     65,
    baseConfidence: 70,
  },
];
