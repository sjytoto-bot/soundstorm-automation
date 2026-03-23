// ─── Channel Static Data ──────────────────────────────────────────────────────
// 채널 레벨 정적 데이터 — 실제 YouTube API 연동 전까지 사용하는 목업 데이터
// (이전: src/mock/youtubeMock.js 에서 이동)

// ─── 채널 기본 KPI ────────────────────────────────────────────────────────────
export const CHANNEL_KPI = {
  subscribers:      12400,
  subscriberChange: +180,   // 최근 30일 증감
};

// ─── 최근 30일 일별 조회수 + 수익 ────────────────────────────────────────────
// 인덱스 0 = 30일 전, 인덱스 29 = 오늘
export const DAILY_STATS = [
  { date: "02-01", views: 1420, revenue: 4200 },
  { date: "02-02", views: 1580, revenue: 4800 },
  { date: "02-03", views: 2100, revenue: 6300 },
  { date: "02-04", views: 1890, revenue: 5700 },
  { date: "02-05", views: 1650, revenue: 4950 },
  { date: "02-06", views: 1340, revenue: 4020 },
  { date: "02-07", views: 1210, revenue: 3630 },
  { date: "02-08", views: 1780, revenue: 5340 },
  { date: "02-09", views: 2340, revenue: 7020 },
  { date: "02-10", views: 2560, revenue: 7680 },
  { date: "02-11", views: 2120, revenue: 6360 },
  { date: "02-12", views: 1960, revenue: 5880 },
  { date: "02-13", views: 1740, revenue: 5220 },
  { date: "02-14", views: 3200, revenue: 9600 },
  { date: "02-15", views: 2880, revenue: 8640 },
  { date: "02-16", views: 2450, revenue: 7350 },
  { date: "02-17", views: 2100, revenue: 6300 },
  { date: "02-18", views: 1830, revenue: 5490 },
  { date: "02-19", views: 1650, revenue: 4950 },
  { date: "02-20", views: 1920, revenue: 5760 },
  { date: "02-21", views: 2240, revenue: 6720 },
  { date: "02-22", views: 2680, revenue: 8040 },
  { date: "02-23", views: 2490, revenue: 7470 },
  { date: "02-24", views: 2150, revenue: 6450 },
  { date: "02-25", views: 1980, revenue: 5940 },
  { date: "02-26", views: 2360, revenue: 7080 },
  { date: "02-27", views: 2720, revenue: 8160 },
  { date: "02-28", views: 3100, revenue: 9300 },
  { date: "03-01", views: 2840, revenue: 8520 },
  { date: "03-02", views: 3050, revenue: 9150 },
];

// ─── 외부유입(트래픽 소스) 시트 데이터 ──────────────────────────────────────
// 실제 Google Sheets 트래픽 소스 탭에서 읽어오는 데이터를 시뮬레이션.
// 마스터(DAILY_STATS)와 달리 마지막 업데이트가 02-27에서 멈춘 상태 (3일 지연).
export const TRAFFIC_STATS = [
  { date: "02-01", ytSearch: 0.32, suggested: 0.28, browse: 0.24, external: 0.16 },
  { date: "02-04", ytSearch: 0.30, suggested: 0.29, browse: 0.25, external: 0.16 },
  { date: "02-07", ytSearch: 0.31, suggested: 0.27, browse: 0.26, external: 0.16 },
  { date: "02-10", ytSearch: 0.33, suggested: 0.28, browse: 0.23, external: 0.16 },
  { date: "02-13", ytSearch: 0.29, suggested: 0.31, browse: 0.24, external: 0.16 },
  { date: "02-16", ytSearch: 0.30, suggested: 0.30, browse: 0.25, external: 0.15 },
  { date: "02-19", ytSearch: 0.32, suggested: 0.29, browse: 0.24, external: 0.15 },
  { date: "02-22", ytSearch: 0.31, suggested: 0.28, browse: 0.26, external: 0.15 },
  { date: "02-25", ytSearch: 0.33, suggested: 0.27, browse: 0.25, external: 0.15 },
  { date: "02-27", ytSearch: 0.32, suggested: 0.29, browse: 0.24, external: 0.15 },
];

// ─── 상위 5개 동영상 (전체 누적 기준) ────────────────────────────────────────
export const TOP_VIDEOS = [
  {
    id:        "v001",
    title:     "Lo-Fi Hip Hop Beat — Midnight Study",
    views:     84200,
    watchTime: 412000, // 분
    revenue:   253800, // 원
    status:    "active",
    momentum:  "Rising",
  },
  {
    id:        "v002",
    title:     "Chill Trap Beat — 도시의 새벽",
    views:     61700,
    watchTime: 308500,
    revenue:   185100,
    status:    "active",
    momentum:  "Stable",
  },
  {
    id:        "v003",
    title:     "Ambient Piano — 조용한 오후",
    views:     47300,
    watchTime: 283800,
    revenue:   141900,
    status:    "active",
    momentum:  "Rising",
  },
  {
    id:        "v004",
    title:     "Jazz Hip Hop — Coffee Shop Vibes",
    views:     38900,
    watchTime: 233400,
    revenue:   116700,
    status:    "active",
    momentum:  "Stable",
  },
  {
    id:        "v005",
    title:     "Dark Phonk Beat — Neon Drift",
    views:     29500,
    watchTime: 177000,
    revenue:    88500,
    status:    "active",
    momentum:  "Declining",
  },
];
