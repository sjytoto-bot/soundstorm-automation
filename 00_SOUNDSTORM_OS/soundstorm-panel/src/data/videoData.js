// ─── Normalized Video Data ────────────────────────────────────────────────────
// NormalizedVideo[] 형식 — 실제 YouTube API 연동 전까지 사용하는 정적 목업 데이터
// 타입 참조: src/core/types/normalized.ts
//
// 변환 공식 (이전 TRACKS mock → NormalizedVideo):
//   subscriberChange = round(subGrowthRate * avgViews)
//   likes            = round(engagementRate * avgViews * 0.7)
//   comments         = round(engagementRate * avgViews * 0.3)
//   watchTimeMinutes = round(avgViews * 3.5)
//   estimatedRevenue = round(rpmIndex * avgViews / 1000 * 3.0 * 100) / 100

export const NORMALIZED_VIDEOS = [
  {
    // Lo-Fi Study  (subGrowthRate:0.85, avgViews:3800, engagementRate:0.82, rpmIndex:0.75)
    videoId:             "lofi",
    title:               "Lo-Fi Study",
    publishedAt:         "2024-01-15T00:00:00Z",
    views:               3800,
    subscriberChange:    3230,    // round(0.85 * 3800)
    likes:               2183,    // round(0.82 * 3800 * 0.7)
    comments:            936,     // round(0.82 * 3800 * 0.3)
    watchTimeMinutes:    13300,   // round(3800 * 3.5)
    averageViewDuration: 0.55,
    estimatedRevenue:    8.55,    // round(0.75 * 3800 / 1000 * 3.0 * 100) / 100
    thumbnailUrl:        "",
    tags:                [],
    durationSeconds:     210,
    source:              "mock",
    trafficSources: {
      RELATED_VIDEO:   0.45,
      WHAT_TO_WATCH:   0.18,
      YT_SEARCH:       0.22,
      BROWSE_FEATURES: 0.15,
    },
  },
  {
    // Trap / Urban  (subGrowthRate:0.62, avgViews:2200, engagementRate:0.48, rpmIndex:0.55)
    videoId:             "trap",
    title:               "Trap / Urban",
    publishedAt:         "2024-02-10T00:00:00Z",
    views:               2200,
    subscriberChange:    1364,    // round(0.62 * 2200)
    likes:               739,     // round(0.48 * 2200 * 0.7)
    comments:            317,     // round(0.48 * 2200 * 0.3)
    watchTimeMinutes:    7700,    // round(2200 * 3.5)
    averageViewDuration: 0.55,
    estimatedRevenue:    3.63,    // round(0.55 * 2200 / 1000 * 3.0 * 100) / 100
    thumbnailUrl:        "",
    tags:                [],
    durationSeconds:     210,
    source:              "mock",
    trafficSources: {
      RELATED_VIDEO:   0.38,
      WHAT_TO_WATCH:   0.22,
      YT_SEARCH:       0.28,
      BROWSE_FEATURES: 0.12,
    },
  },
  {
    // Ambient Piano  (subGrowthRate:0.35, avgViews:1100, engagementRate:0.58, rpmIndex:0.28)
    videoId:             "ambient",
    title:               "Ambient Piano",
    publishedAt:         "2024-03-05T00:00:00Z",
    views:               1100,
    subscriberChange:    385,     // round(0.35 * 1100)
    likes:               447,     // round(0.58 * 1100 * 0.7)
    comments:            191,     // round(0.58 * 1100 * 0.3)
    watchTimeMinutes:    3850,    // round(1100 * 3.5)
    averageViewDuration: 0.55,
    estimatedRevenue:    0.92,    // round(0.28 * 1100 / 1000 * 3.0 * 100) / 100
    thumbnailUrl:        "",
    tags:                [],
    durationSeconds:     210,
    source:              "mock",
    trafficSources: {
      RELATED_VIDEO:   0.28,
      WHAT_TO_WATCH:   0.16,
      YT_SEARCH:       0.38,
      BROWSE_FEATURES: 0.18,
    },
  },
  {
    // Phonk  (subGrowthRate:0.90, avgViews:1800, engagementRate:0.52, rpmIndex:0.45)
    videoId:             "phonk",
    title:               "Phonk",
    publishedAt:         "2024-04-20T00:00:00Z",
    views:               1800,
    subscriberChange:    1620,    // round(0.90 * 1800)
    likes:               655,     // round(0.52 * 1800 * 0.7)
    comments:            281,     // round(0.52 * 1800 * 0.3)
    watchTimeMinutes:    6300,    // round(1800 * 3.5)
    averageViewDuration: 0.55,
    estimatedRevenue:    2.43,    // round(0.45 * 1800 / 1000 * 3.0 * 100) / 100
    thumbnailUrl:        "",
    tags:                [],
    durationSeconds:     210,
    source:              "mock",
    trafficSources: {
      RELATED_VIDEO:   0.42,
      WHAT_TO_WATCH:   0.14,
      YT_SEARCH:       0.30,
      BROWSE_FEATURES: 0.14,
    },
  },
  {
    // Jazz Hip-Hop  (subGrowthRate:0.20, avgViews:750, engagementRate:0.28, rpmIndex:0.38)
    videoId:             "jazz",
    title:               "Jazz Hip-Hop",
    publishedAt:         "2024-05-12T00:00:00Z",
    views:               750,
    subscriberChange:    150,     // round(0.20 * 750)
    likes:               147,     // round(0.28 * 750 * 0.7)
    comments:            63,      // round(0.28 * 750 * 0.3)
    watchTimeMinutes:    2625,    // round(750 * 3.5)
    averageViewDuration: 0.55,
    estimatedRevenue:    0.86,    // round(0.38 * 750 / 1000 * 3.0 * 100) / 100
    thumbnailUrl:        "",
    tags:                [],
    durationSeconds:     210,
    source:              "mock",
    trafficSources: {
      RELATED_VIDEO:   0.18,
      WHAT_TO_WATCH:   0.10,
      YT_SEARCH:       0.48,
      BROWSE_FEATURES: 0.24,
    },
  },
];
