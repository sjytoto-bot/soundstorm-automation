// ─── External Platform Map ────────────────────────────────────────────────────
// referrer string (traffic_source_detail) → platform ID 매핑
// 순서 중요: 더 구체적인 패턴을 먼저 배치
//
// 매칭 방식 (ReferrerClassifier 참고):
//   1. 완전 일치
//   2. referrer.toLowerCase().includes(mapKey.toLowerCase())

export const EXTERNAL_PLATFORM_MAP: Record<string, string> = {
  // ── 국내 검색 ──────────────────────────────────────────────────────────────
  "naver.com":              "NAVER",
  "search.naver.com":       "NAVER",
  "m.search.naver.com":     "NAVER",
  "search.daum.net":        "DAUM",
  "daum.net":               "DAUM",

  // ── 해외 검색 ──────────────────────────────────────────────────────────────
  "search.brave.com":       "BRAVE",
  "google.com":             "GOOGLE",
  "bing.com":               "BING",
  "duckduckgo.com":         "DUCKDUCKGO",

  // ── AI 검색 ────────────────────────────────────────────────────────────────
  "perplexity.ai":          "PERPLEXITY",
  "com.openai.chatgpt":     "CHATGPT",
  "chatgpt.com":            "CHATGPT",
  "openai.com":             "CHATGPT",
  "com.microsoft.copilot":  "COPILOT",
  "copilot.microsoft.com":  "COPILOT",
  "claude.ai":              "CLAUDE",
  "gemini.google.com":      "GEMINI",

  // ── 소셜 ───────────────────────────────────────────────────────────────────
  "Instagram":              "INSTAGRAM",
  "instagram.com":          "INSTAGRAM",
  "com.instagram.barcelona": "INSTAGRAM",
  "com.instagram.android":  "INSTAGRAM",
  "l.instagram.com":        "INSTAGRAM",
  "facebook.com":           "FACEBOOK",
  "m.facebook.com":         "FACEBOOK",
  "l.facebook.com":         "FACEBOOK",
  "Twitter":                "TWITTER",
  "twitter.com":            "TWITTER",
  "t.co":                   "TWITTER",
  "x.com":                  "TWITTER",

  // ── 메신저 ────────────────────────────────────────────────────────────────
  "Facebook Messenger":     "MESSENGER",
  "l.messenger.com":        "MESSENGER",
  "WhatsApp Business":      "WHATSAPP",
  "whatsapp.com":           "WHATSAPP",
  "wa.me":                  "WHATSAPP",
  "kakaotalk.com":          "KAKAOTALK",
  "kakao.com":              "KAKAOTALK",
  "open.kakao.com":         "KAKAOTALK",
  "line.me":                "LINE",
  "telegram.org":           "TELEGRAM",
  "t.me":                   "TELEGRAM",

  // ── 커뮤니티 ──────────────────────────────────────────────────────────────
  "Discord":                "DISCORD",
  "discord.com":            "DISCORD",
  "discord.gg":             "DISCORD",
  "arca.live":              "ARCA",
  "dcinside.com":           "DCINSIDE",
  "reddit.com":             "REDDIT",
  "old.reddit.com":         "REDDIT",

  // ── 블로그 ────────────────────────────────────────────────────────────────
  "tistory.com":            "TISTORY",
  "blog.naver.com":         "NAVER_BLOG",
  "velog.io":               "VELOG",
  "medium.com":             "MEDIUM",

  // ── 협업 / 문서 ───────────────────────────────────────────────────────────
  "notion.site":            "NOTION",
  "notion.so":              "NOTION",
  "docs.google.com":        "GOOGLE_DOCS",
  "drive.google.com":       "GOOGLE_DRIVE",

  // ── 미디어 / 음악 ─────────────────────────────────────────────────────────
  "jukebox.today":          "JUKEBOX",
  "sync-tube.de":           "SYNC_TUBE",
  "soundcloud.com":         "SOUNDCLOUD",
  "spotify.com":            "SPOTIFY",
};
