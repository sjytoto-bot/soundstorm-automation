// ─── ReferrerClassifier ───────────────────────────────────────────────────────
// referrer string → platform ID 분류
//
// 매칭 우선순위:
//   1. 완전 일치 (exact)
//   2. map key가 referrer에 포함 (key includes in referrer)
//   3. referrer가 map key에 포함 (referrer includes in key)
//   4. UNKNOWN

import { EXTERNAL_PLATFORM_MAP }    from "./externalPlatformMap";
import { PLATFORM_CATEGORY_MAP, PlatformCategory, CATEGORY_LABEL } from "./externalPlatformCategory";
import { PLATFORM_INTENT_MAP, INTENT_LABEL, type ExternalIntent }  from "./externalIntentMap";
import type { DimensionRow }        from "@/adapters/AnalyticsAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ClassifiedReferrer {
  referrer:      string;
  platform:      string;      // 플랫폼 ID (예: "NAVER", "INSTAGRAM")
  platformLabel: string;      // 표시 이름 (예: "네이버", "Instagram")
  category:      PlatformCategory;
  categoryLabel: string;
  intent:        ExternalIntent;
  intentLabel:   string;
  views:         number;
  watchTimeMin:  number;
  avgDurationSec: number;
  ratio:         number;
}

// ─── 플랫폼 표시 이름 ─────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  NAVER:       "네이버",
  DAUM:        "다음",
  BRAVE:       "Brave 검색",
  GOOGLE:      "구글",
  BING:        "Bing",
  DUCKDUCKGO:  "DuckDuckGo",
  PERPLEXITY:  "Perplexity",
  CHATGPT:     "ChatGPT",
  COPILOT:     "Microsoft Copilot",
  CLAUDE:      "Claude",
  GEMINI:      "Gemini",
  INSTAGRAM:   "Instagram",
  FACEBOOK:    "Facebook",
  TWITTER:     "Twitter/X",
  MESSENGER:   "Facebook Messenger",
  WHATSAPP:    "WhatsApp",
  KAKAOTALK:   "카카오톡",
  LINE:        "Line",
  TELEGRAM:    "Telegram",
  DISCORD:     "Discord",
  ARCA:        "아카라이브",
  DCINSIDE:    "디시인사이드",
  REDDIT:      "Reddit",
  TISTORY:     "티스토리",
  NAVER_BLOG:  "네이버 블로그",
  VELOG:       "Velog",
  MEDIUM:      "Medium",
  NOTION:      "Notion",
  GOOGLE_DOCS: "Google Docs",
  GOOGLE_DRIVE: "Google Drive",
  JUKEBOX:     "Jukebox",
  SYNC_TUBE:   "SyncTube",
  SOUNDCLOUD:  "SoundCloud",
  SPOTIFY:     "Spotify",
};

// ─── 매칭 로직 ────────────────────────────────────────────────────────────────

function findPlatform(referrer: string): string {
  const ref = referrer.toLowerCase();

  // 1. 완전 일치
  if (EXTERNAL_PLATFORM_MAP[referrer]) return EXTERNAL_PLATFORM_MAP[referrer];

  // 2. 대소문자 무시 완전 일치
  for (const [key, platform] of Object.entries(EXTERNAL_PLATFORM_MAP)) {
    if (key.toLowerCase() === ref) return platform;
  }

  // 3. referrer가 key를 포함 (더 구체적인 것 먼저)
  const sortedKeys = Object.keys(EXTERNAL_PLATFORM_MAP)
    .sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (ref.includes(key.toLowerCase())) {
      return EXTERNAL_PLATFORM_MAP[key];
    }
  }

  // 4. key가 referrer를 포함
  for (const key of sortedKeys) {
    if (key.toLowerCase().includes(ref)) {
      return EXTERNAL_PLATFORM_MAP[key];
    }
  }

  return "UNKNOWN";
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export function classifyReferrer(row: DimensionRow): ClassifiedReferrer {
  const platform = findPlatform(row.key);
  const category = PLATFORM_CATEGORY_MAP[platform] ?? PlatformCategory.UNKNOWN;
  const intent   = PLATFORM_INTENT_MAP[platform]   ?? "UNKNOWN_INTENT";

  return {
    referrer:       row.key,
    platform,
    platformLabel:  PLATFORM_LABEL[platform] ?? row.key,
    category,
    categoryLabel:  CATEGORY_LABEL[category],
    intent,
    intentLabel:    INTENT_LABEL[intent],
    views:          row.views,
    watchTimeMin:   row.watchTimeMin  ?? 0,
    avgDurationSec: row.avgDurationSec ?? 0,
    ratio:          row.ratio,
  };
}

export function classifyAll(rows: DimensionRow[]): ClassifiedReferrer[] {
  return rows
    .filter(r => r.views > 0)
    .map(classifyReferrer)
    .sort((a, b) => b.views - a.views);
}
