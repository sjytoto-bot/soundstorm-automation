// ─── Normalized Data Types v1 ──────────────────────────────────────────────────
// YouTube / Google Sheets 원본 데이터를 엔진 레이어에서 공통으로 사용하는 정규화 타입
// 모든 어댑터는 이 타입으로 변환하여 반환한다.

// ─── NormalizedVideo ──────────────────────────────────────────────────────────
// 단일 영상 단위의 정규화 데이터
// 출처: YouTube API / Google Sheets 모두 이 구조로 통일

export interface NormalizedVideo {
  /** YouTube video ID (primary key) */
  videoId: string;

  /** 영상 제목 */
  title: string;

  /** 업로드 날짜 (ISO 8601) */
  publishedAt: string;

  /** 총 조회수 */
  views: number;

  /** 좋아요 수 */
  likes: number;

  /** 댓글 수 */
  comments: number;

  /** 총 시청 시간 (분) */
  watchTimeMinutes: number;

  /** 평균 시청 지속률 (0~1) */
  averageViewDuration: number;

  /** 추정 수익 (USD) */
  estimatedRevenue: number;

  /** 구독자 변화 (해당 영상 유입 기준) */
  subscriberChange: number;

  /** 트래픽 소스 맵 (소스명 → 조회 비율 0~1) */
  trafficSources: Record<string, number>;

  /** 썸네일 URL (원본) */
  thumbnailUrl: string;

  /** 태그 목록 */
  tags: string[];

  /** 영상 길이 (초) */
  durationSeconds: number;

  /** 원본 데이터 출처 식별자 */
  source: "youtube_api" | "google_sheet" | "mock";

  // ── Traffic 집계 필드 (선택) ─────────────────────────────────────────────────
  // trafficEngine 또는 컨트롤러에서 trafficSources → 파생 계산 후 채워진다.
  traffic?: {
    /** trafficSources 합계 (비율 합계 ≈ 1.0, 또는 실제 조회수 합계) */
    totalViews:    number;
    /** 소스별 비율 맵 (trafficSources와 동일 참조) */
    groups:        Record<string, number>;
    /** INTERNAL_SOURCES 합산 비율 (0~1) */
    internalRatio: number;
  };

  // ── YouTube Analytics API 보강 필드 (선택) ──────────────────────────────────
  // fetchYTAnalytics() 결과를 어댑터에서 join 후 채워진다.
  // 자격증명 미설정 시 undefined.

  /** 노출수 (YouTube Analytics: impressions) */
  impressions?: number;

  /** 클릭률 (YouTube Analytics: impressionsCtr, 0~1) */
  ctr?: number;
}

// ─── ThumbnailFeature ─────────────────────────────────────────────────────────
// 썸네일 비주얼 분석 결과 (Vision 레이어 출력)

export interface ThumbnailFeature {
  /** 대상 videoId */
  videoId: string;

  /** 주 색상 팔레트 (hex) */
  dominantColors: string[];

  /** 텍스트 존재 여부 */
  hasText: boolean;

  /** 감지된 텍스트 내용 (없으면 빈 문자열) */
  detectedText: string;

  /** 얼굴 감지 수 */
  faceCount: number;

  /** 밝기 점수 (0~1) */
  brightness: number;

  /** 대비 점수 (0~1) */
  contrast: number;

  /** 분석 신뢰도 (0~1) */
  confidence: number;

  /** 분석 타임스탬프 (ISO 8601) */
  analyzedAt: string;
}

// ─── ThumbnailComparison ──────────────────────────────────────────────────────
// 두 영상 썸네일 간 비교 결과

export interface ThumbnailComparison {
  videoIdA: string;
  videoIdB: string;

  /** 색상 유사도 (0~1) */
  colorSimilarity: number;

  /** 구성 유사도 (0~1, 텍스트·얼굴 위치 기반) */
  compositionSimilarity: number;

  /** 종합 유사도 점수 (0~1) */
  overallSimilarity: number;

  /** 비교 기준 메타데이터 */
  meta: {
    method: "cosine" | "histogram" | "perceptual_hash";
    comparedAt: string;
  };
}

// ─── NormalizedVideoWithFeature ───────────────────────────────────────────────
// 썸네일 피처가 조인된 확장 타입 (featureJoin 레이어 출력)

export interface NormalizedVideoWithFeature extends NormalizedVideo {
  thumbnailFeature?: ThumbnailFeature;
}
