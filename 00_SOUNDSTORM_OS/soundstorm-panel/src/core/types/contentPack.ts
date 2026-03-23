// ─── ContentPack Types ────────────────────────────────────────────────────────
// Creator OS 핵심 데이터 구조 — 헌법 §2, §2-A, §2-B 기준
//
// video_id 원칙:
//   upload 이전 : video_id = null
//   upload 이후 : video_id 저장 → Analytics 자동 매핑 시작 (STAGE 7)
//
// Lifecycle:
//   idea → draft → ready → uploaded → analyzing

// ─── Status ───────────────────────────────────────────────────────────────────

export type ContentPackStatus =
  | "idea"       // 후보 테마 (Pack 미생성)
  | "draft"      // Pack 생성됨 (AUTO 미완료)
  | "ready"      // 모든 AUTO 완료 (업로드 준비)
  | "uploaded"   // YouTube 업로드 완료
  | "analyzing"; // 성과 수집 중 (video_id 연결됨)

// ─── AUTO 필드 목록 ───────────────────────────────────────────────────────────
// 버튼 1개 = AutoField 1개 = ContentPack 필드 1개

export type AutoField =
  | "title"
  | "suno_prompt"
  | "thumbnail_text"
  | "description"
  | "hashtags"
  | "keywords";

// ─── Performance (STAGE 7: YouTube Analytics 연결 기반) ───────────────────────

export interface ContentPerformance {
  views?:       number;
  ctr?:         number;   // Click-Through Rate (%)
  watch_time?:  number;   // 총 시청시간 (분)
  impressions?: number;
}

// ─── Hypothesis (STAGE 7.5: 가설 레이어) ──────────────────────────────────────
// Content Pack = 실험 단위 — 각 Pack에 가설을 붙여 패턴 학습
//
// 예) Theme: Oriental Trap / Thumbnail: Red Epic / Hook: War Cry / Emotion: Intense
// Analytics가 들어오면 → "Red Epic + War Cry → CTR 상승" 같은 패턴 데이터로 변환됨

export type BpmTag = "slow" | "ritual-slow" | "medium" | "fast" | "epic";

export interface PackHypothesis {
  theme?:          string;  // 콘텐츠 테마 가설 (예: "Oriental Trap")
  thumbnailStyle?: string;  // 썸네일 스타일 가설 (예: "Red Epic")
  hookType?:       string;  // 훅 유형 가설 (예: "War Cry")
  targetEmotion?:  string;  // 목표 감정 가설 (예: "Intense")
  bpm?:            BpmTag;  // BPM 대역 가설 (SunoPromptEngine 입력)
}

// ─── ContentPack ──────────────────────────────────────────────────────────────

export interface ContentPack {
  id:               string;              // 로컬 UUID (video_id와 별개)
  video_id:         string | null;       // 절대 키 — 업로드 전 null, 업로드 후 YouTube ID

  // 콘텐츠 정보
  theme:            string;              // AI 추천 / 수동 입력
  title:            string;             // AUTO: CTR 패턴 + 키워드 + 테마
  suno_prompt:      string;             // AUTO: 테마 + 장르 패턴
  thumbnail:        string | null;      // AUTO: ThumbnailStudio 생성 결과
  thumbnail_text:   string;             // AUTO: ThumbnailIntelligence 스타일 분석
  description:      string;             // AUTO: 키워드 + 플레이리스트 + 테마
  hashtags:         string[];           // AUTO: OpportunityEngine 키워드 + 트렌드
  keywords:         string[];           // AUTO: ContentStrategyEngine
  playlist:         string;             // 수동 입력

  // 상태
  status:           ContentPackStatus;

  // 성과 (STAGE 7에서 자동 수집)
  performance:      ContentPerformance | null;

  // 가설 (STAGE 7.5 — 실험 단위 메타데이터)
  hypothesis:       PackHypothesis | null;

  // 배포
  campaign_links:   string[];
  distribution_data: Record<string, unknown>;

  // 메타
  createdAt:        string;             // ISO timestamp
  updatedAt:        string;             // ISO timestamp
}

// ─── Manager State ────────────────────────────────────────────────────────────

export interface ContentPackManagerState {
  packs:      ContentPack[];
  activePack: ContentPack | null;
  // Pack 단위로 분리 — generating[packId][field]
  // 여러 Pack 동시 생성 시에도 상태 충돌 없음
  generating: Record<string, Partial<Record<AutoField, boolean>>>;
  // STAGE 7: Analytics 동기화 중인 Pack ID 목록
  syncing:    Record<string, boolean>;
  error:      string | null;
}

// ─── 상태 전이 규칙 (헌법 §2-B) ──────────────────────────────────────────────
// idea      → draft     : "+ 새 Pack" 클릭
// draft     → ready     : 모든 AUTO 완료 시 자동 전이
// ready     → uploaded  : YouTube 업로드 후 video_id 수신 (STAGE 4)
// uploaded  → analyzing : video_id 저장 완료 후 자동 전이 (STAGE 4)
// analyzing → —         : 성과 수집 완료 → GrowthLoop 입력 (STAGE 6)

export const AUTO_FIELDS_REQUIRED: AutoField[] = [
  "title",
  "suno_prompt",
  "thumbnail_text",
  "description",
  "hashtags",
  "keywords",
];

/** draft → ready 전이 조건: 필수 AUTO 필드 전체 완료 여부 */
export function isPackReady(pack: ContentPack): boolean {
  return (
    pack.title.trim() !== "" &&
    pack.suno_prompt.trim() !== "" &&
    pack.thumbnail_text.trim() !== "" &&
    pack.description.trim() !== "" &&
    pack.hashtags.length > 0 &&
    pack.keywords.length > 0
  );
}

/** 빈 ContentPack 초기값 생성 */
export function createEmptyPack(theme: string): ContentPack {
  const now = new Date().toISOString();
  return {
    id:               crypto.randomUUID(),
    video_id:         null,
    theme,
    title:            "",
    suno_prompt:      "",
    thumbnail:        null,
    thumbnail_text:   "",
    description:      "",
    hashtags:         [],
    keywords:         [],
    playlist:         "",
    status:           "draft",
    performance:      null,
    hypothesis:       null,
    campaign_links:   [],
    distribution_data: {},
    createdAt:        now,
    updatedAt:        now,
  };
}
