// ─── Platform Category ────────────────────────────────────────────────────────
// PlatformCategory enum + platform → category 매핑

export enum PlatformCategory {
  SEARCH    = "SEARCH",
  SOCIAL    = "SOCIAL",
  MESSAGING = "MESSAGING",
  COMMUNITY = "COMMUNITY",
  BLOG      = "BLOG",
  AI        = "AI",
  COLLAB    = "COLLAB",
  MEDIA     = "MEDIA",
  UNKNOWN   = "UNKNOWN",
}

export const PLATFORM_CATEGORY_MAP: Record<string, PlatformCategory> = {
  // 검색
  NAVER:       PlatformCategory.SEARCH,
  DAUM:        PlatformCategory.SEARCH,
  BRAVE:       PlatformCategory.SEARCH,
  GOOGLE:      PlatformCategory.SEARCH,
  BING:        PlatformCategory.SEARCH,
  DUCKDUCKGO:  PlatformCategory.SEARCH,

  // AI 검색
  PERPLEXITY:  PlatformCategory.AI,
  CHATGPT:     PlatformCategory.AI,
  COPILOT:     PlatformCategory.AI,
  CLAUDE:      PlatformCategory.AI,
  GEMINI:      PlatformCategory.AI,

  // 소셜
  INSTAGRAM:   PlatformCategory.SOCIAL,
  FACEBOOK:    PlatformCategory.SOCIAL,
  TWITTER:     PlatformCategory.SOCIAL,

  // 메신저
  MESSENGER:   PlatformCategory.MESSAGING,
  WHATSAPP:    PlatformCategory.MESSAGING,
  KAKAOTALK:   PlatformCategory.MESSAGING,
  LINE:        PlatformCategory.MESSAGING,
  TELEGRAM:    PlatformCategory.MESSAGING,

  // 커뮤니티
  DISCORD:     PlatformCategory.COMMUNITY,
  ARCA:        PlatformCategory.COMMUNITY,
  DCINSIDE:    PlatformCategory.COMMUNITY,
  REDDIT:      PlatformCategory.COMMUNITY,

  // 블로그
  TISTORY:     PlatformCategory.BLOG,
  NAVER_BLOG:  PlatformCategory.BLOG,
  VELOG:       PlatformCategory.BLOG,
  MEDIUM:      PlatformCategory.BLOG,

  // 협업
  NOTION:      PlatformCategory.COLLAB,
  GOOGLE_DOCS: PlatformCategory.COLLAB,
  GOOGLE_DRIVE: PlatformCategory.COLLAB,

  // 미디어
  JUKEBOX:     PlatformCategory.MEDIA,
  SYNC_TUBE:   PlatformCategory.MEDIA,
  SOUNDCLOUD:  PlatformCategory.MEDIA,
  SPOTIFY:     PlatformCategory.MEDIA,
};

// 카테고리 한국어 레이블
export const CATEGORY_LABEL: Record<PlatformCategory, string> = {
  [PlatformCategory.SEARCH]:    "검색",
  [PlatformCategory.SOCIAL]:    "소셜",
  [PlatformCategory.MESSAGING]: "메신저",
  [PlatformCategory.COMMUNITY]: "커뮤니티",
  [PlatformCategory.BLOG]:      "블로그",
  [PlatformCategory.AI]:        "AI 검색",
  [PlatformCategory.COLLAB]:    "협업툴",
  [PlatformCategory.MEDIA]:     "미디어",
  [PlatformCategory.UNKNOWN]:   "기타",
};
