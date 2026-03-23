// ─── contentClusterEngine v2 ──────────────────────────────────────────────────
// 영상 콘텐츠 유형별 성과를 클러스터 단위로 분석한다.
//
// 입력: TrackResult[]
//   — tags, name(=title), avgViews, engagementRate, retentionRate, velocity 참조
//
// 클러스터 키 결정 우선순위:
//   1. track.tags 존재 → 각 tag를 클러스터 키로 사용 (멀티 클러스터 허용)
//   2. tags 없음 → GENRE_KEYWORDS 기준 name 매칭 (매칭된 모든 키워드 사용)
//   3. 매칭 없음 → "other"
//
// clusterScore 공식:
//   avgViews * 0.5 + avgEngagement * 0.3 + avgRetention * 0.2

import type { TrackResult } from "../core/enginePipeline";

// ─── 장르·테마 키워드 사전 ─────────────────────────────────────────────────────
// name 소문자 변환 후 단어 단위로 포함 여부 검사한다.

const GENRE_KEYWORDS: readonly string[] = [
  // 타악기 / 리듬
  "drum", "drums", "percussion", "beat", "beats",
  // 분위기
  "battle", "war", "epic", "ritual", "dark", "chill", "sad",
  "happy", "hype", "aggressive", "peaceful", "spiritual",
  // 장르
  "lofi", "lo-fi", "trap", "phonk", "ambient", "jazz", "hip-hop",
  "hiphop", "metal", "rock", "rnb", "soul", "funk",
  // 용도
  "study", "focus", "meditation", "workout", "sleep", "gaming",
  "background", "cinematic",
  // 악기
  "piano", "guitar", "bass", "violin", "synth", "flute",
];

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ClusterResult {
  /** 클러스터 이름 (tag 또는 title keyword) */
  cluster:        string;
  videoCount:     number;
  avgViews:       number;
  avgEngagement:  number;
  avgRetention:   number;
  avgVelocity:    number;
  /** 종합 점수: avgViews*0.5 + avgEngagement*0.3 + avgRetention*0.2 */
  clusterScore:   number;
}

export interface ContentClusterResult {
  clusters:    ClusterResult[];
  /** 분류된 총 영상 수 (멀티 클러스터 중복 포함) */
  totalMapped: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * TrackResult에 할당할 클러스터 키 목록을 반환한다.
 * 1. tags 있음 → 소문자 trim된 각 tag
 * 2. tags 없음 → name에서 GENRE_KEYWORDS 매칭
 * 3. 매칭 없음 → ["other"]
 */
function resolveClusterKeys(track: TrackResult): string[] {
  // 1. tags 우선
  const tagKeys = (track.tags ?? [])
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
  if (tagKeys.length > 0) return tagKeys;

  // 2. name keyword 매칭
  const nameLower = (track.name ?? "").toLowerCase();
  const matched = GENRE_KEYWORDS.filter(kw => {
    const re = new RegExp(`(?:^|[\\s/\\-_,])(${kw})(?:[\\s/\\-_,]|$)`);
    return re.test(nameLower) || nameLower.includes(kw);
  });
  if (matched.length > 0) return matched;

  // 3. fallback
  return ["other"];
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * TrackResult를 태그·타이틀 기준으로 클러스터링하고 성과를 집계한다.
 *
 * @param tracks  TrackResult[]  enginePipeline tracks 출력 (mutate 완료 상태)
 * @returns       ContentClusterResult
 */
export function run(tracks: TrackResult[]): ContentClusterResult {
  interface Bucket {
    views:      number[];
    engagement: number[];
    retention:  number[];
    velocity:   number[];
  }

  const buckets = new Map<string, Bucket>();

  const ensureBucket = (key: string): Bucket => {
    if (!buckets.has(key)) {
      buckets.set(key, { views: [], engagement: [], retention: [], velocity: [] });
    }
    return buckets.get(key)!;
  };

  let totalMapped = 0;

  for (const t of tracks) {
    const keys = resolveClusterKeys(t);
    totalMapped += keys.length;

    for (const key of keys) {
      const b = ensureBucket(key);
      b.views.push(t.avgViews);
      b.engagement.push(t.engagementRate);
      b.retention.push(t.retentionRate ?? 0);
      b.velocity.push(t.velocity ?? 0);
    }
  }

  // ── 집계 + clusterScore 계산 ─────────────────────────────────────────────────
  const clusters: ClusterResult[] = Array.from(buckets.entries())
    .map(([cluster, b]) => {
      const avgViews      = mean(b.views);
      const avgEngagement = mean(b.engagement);
      const avgRetention  = mean(b.retention);
      const avgVelocity   = mean(b.velocity);
      const clusterScore  =
        avgViews      * 0.5 +
        avgEngagement * 0.3 +
        avgRetention  * 0.2;
      return {
        cluster,
        videoCount:    b.views.length,
        avgViews,
        avgEngagement,
        avgRetention,
        avgVelocity,
        clusterScore: Math.max(0, clusterScore),
      };
    })
    // clusterScore 내림차순 정렬
    .sort((a, b) => b.clusterScore - a.clusterScore);

  return { clusters, totalMapped };
}
