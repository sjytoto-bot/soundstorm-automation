// ─── External Intent Map ─────────────────────────────────────────────────────
// platform ID → user intent 매핑

export type ExternalIntent =
  | "SEARCH_INTENT"
  | "DISCOVERY_INTENT"
  | "SHARING_INTENT"
  | "COMMUNITY_INTENT"
  | "CONTENT_REFERENCE"
  | "PROJECT_USAGE"
  | "AI_DISCOVERY"
  | "MEDIA_DISCOVERY"
  | "UNKNOWN_INTENT";

export const PLATFORM_INTENT_MAP: Record<string, ExternalIntent> = {
  // 검색형 유입 — 능동적 키워드 검색
  NAVER:       "SEARCH_INTENT",
  DAUM:        "SEARCH_INTENT",
  BRAVE:       "SEARCH_INTENT",
  GOOGLE:      "SEARCH_INTENT",
  BING:        "SEARCH_INTENT",
  DUCKDUCKGO:  "SEARCH_INTENT",

  // AI 발견형 — AI 추천/검색 결과
  PERPLEXITY:  "AI_DISCOVERY",
  CHATGPT:     "AI_DISCOVERY",
  COPILOT:     "AI_DISCOVERY",
  CLAUDE:      "AI_DISCOVERY",
  GEMINI:      "AI_DISCOVERY",

  // 소셜 발견형 — 피드 노출
  INSTAGRAM:   "DISCOVERY_INTENT",
  FACEBOOK:    "DISCOVERY_INTENT",
  TWITTER:     "DISCOVERY_INTENT",

  // 메신저 공유형 — 링크 직접 전달
  MESSENGER:   "SHARING_INTENT",
  WHATSAPP:    "SHARING_INTENT",
  KAKAOTALK:   "SHARING_INTENT",
  LINE:        "SHARING_INTENT",
  TELEGRAM:    "SHARING_INTENT",

  // 커뮤니티 공유형 — 채널/스레드 내 공유
  DISCORD:     "COMMUNITY_INTENT",
  ARCA:        "COMMUNITY_INTENT",
  DCINSIDE:    "COMMUNITY_INTENT",
  REDDIT:      "COMMUNITY_INTENT",

  // 블로그 레퍼런스형 — 글에 임베드/링크
  TISTORY:     "CONTENT_REFERENCE",
  NAVER_BLOG:  "CONTENT_REFERENCE",
  VELOG:       "CONTENT_REFERENCE",
  MEDIUM:      "CONTENT_REFERENCE",

  // 협업 프로젝트 사용형 — 문서/노션 임베드
  NOTION:      "PROJECT_USAGE",
  GOOGLE_DOCS: "PROJECT_USAGE",
  GOOGLE_DRIVE: "PROJECT_USAGE",

  // 미디어 플레이어형 — 같이 듣기/재생
  JUKEBOX:     "MEDIA_DISCOVERY",
  SYNC_TUBE:   "MEDIA_DISCOVERY",
  SOUNDCLOUD:  "MEDIA_DISCOVERY",
  SPOTIFY:     "MEDIA_DISCOVERY",
};

export const INTENT_LABEL: Record<ExternalIntent, string> = {
  SEARCH_INTENT:    "검색 유입",
  DISCOVERY_INTENT: "소셜 발견",
  SHARING_INTENT:   "메신저 공유",
  COMMUNITY_INTENT: "커뮤니티 공유",
  CONTENT_REFERENCE: "블로그 레퍼런스",
  PROJECT_USAGE:    "협업 임베드",
  AI_DISCOVERY:     "AI 검색 발견",
  MEDIA_DISCOVERY:  "미디어 플레이어",
  UNKNOWN_INTENT:   "기타",
};
