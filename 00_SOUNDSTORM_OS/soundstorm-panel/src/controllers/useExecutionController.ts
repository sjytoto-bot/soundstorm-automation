// ─── useExecutionController v2 ────────────────────────────────────────────────
// Creator Control Panel 상태 계산
//
// 입력:
//   tracksWithScore   — useYouTubeController.tracksWithScore
//                       (publishedAt, name, strategy.total 포함)
//   opportunityVideos — useYouTubeController.opportunityVideos
//
// 출력:
//   uploadedThisWeek    — 최근 7일 업로드 목록
//   scheduledContent    — 기회 영상 상위 3개 (업로드 후보)
//   nextUploadDate      — 평균 업로드 주기 기반 예측
//   uploadMomentum      — "healthy" | "slowing" | "stalled" | "unknown"
//   daysSinceLastUpload — 마지막 업로드 이후 경과일
//   avgIntervalDays     — 평균 업로드 간격 (일)
//   topicMomentum       — 키워드별 성과 트렌드 (↑/↓)
//
// Momentum 기준:
//   ≤ 5일  → healthy
//   ≤ 10일 → slowing
//   > 10일 → stalled

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface UploadedVideo {
  videoId:     string;
  title:       string;
  publishedAt: string;
}

// 통합 업로드 후보 타입 (HOT = 전략 엔진, MOMENTUM = 기회 신호)
export interface UploadCandidate {
  id:       string;
  type:     "HOT" | "MOMENTUM";
  title:    string;
  reason:   string;
  actions?: Array<{ priority: number; text: string }>;
  insight?: CandidateInsight;
}

export interface CandidateInsight {
  strategyScore?:  number;  // strategy.total
  strategyGrade?:  string;  // strategy.grade (A/B/C)
  growthStatus?:   string;  // trafficGrowth.growthStatus
  momentumStatus?: string;  // earlyMomentum.momentumStatus
  // 추가 데이터 연결 시 확장
  topVideoViews?:  string;
  ctr?:            string;
  trafficSource?:  string;
  keywordGrowth?:  string;
}

export interface ScheduledVideo {
  videoId:  string;
  title:    string;
  signal:   string;
  insight?: CandidateInsight;
}

export type UploadMomentum = "healthy" | "slowing" | "stalled" | "unknown";

export interface TopicSignal {
  topic: string;
  trend: "up" | "down";
  avgScore: number;
}

export interface ExecutionState {
  uploadedThisWeek:    UploadedVideo[];
  scheduledContent:    ScheduledVideo[];
  nextUploadDate:      Date | null;
  isOverdue:           boolean;
  overdueDays:         number;
  uploadMomentum:      UploadMomentum;
  daysSinceLastUpload: number | null;
  avgIntervalDays:     number | null;
  topicMomentum:       TopicSignal[];
}

// ─── 중앙값 계산 ─────────────────────────────────────────────────────────────

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── 업로드 간격 추정 ─────────────────────────────────────────────────────────
// 샘플 < 4개이면 기본값 7일 반환 (소수 샘플 왜곡 방지)
// 평균 ❌ → 중앙값 ✔ (이상값에 강건)

function estimateUploadInterval(
  datedTracks: Array<{ publishedAt: string }>,
): number {
  // 샘플 부족 → 주 1회 기본값
  if (datedTracks.length < 4) return 7 * MS_PER_DAY;

  const times = datedTracks
    .slice(0, 10)
    .map(t => new Date(t.publishedAt).getTime());

  const diffs: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const diff = times[i - 1] - times[i];
    if (diff > 0) diffs.push(diff);
  }

  if (diffs.length === 0) return 7 * MS_PER_DAY;
  return getMedian(diffs);
}

// ─── Topic Momentum 계산 ──────────────────────────────────────────────────────
// 영상 제목에서 의미 단어 추출 → 그룹별 strategy score 비교 → ↑/↓ 판정

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "is", "in", "on", "at",
  "to", "with", "by", "be", "as", "it", "이", "가", "을", "를", "은",
  "는", "의", "에", "도", "로", "와", "과", "한", "하는", "하다",
  "브금", "음악", "music", "bgm", "beat", "lofi", "lo-fi",
]);

function extractKeywords(title: string): string[] {
  // 한글 2자 이상 단어 + 영문 3자 이상 단어
  const words = title
    .replace(/[|()[\]{}:,.\-_/\\]/g, " ")
    .split(/\s+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

function computeTopicMomentum(
  tracks: Array<{ name: string; strategy?: { total?: number } }>,
): TopicSignal[] {
  if (tracks.length === 0) return [];

  // 채널 평균 strategy score
  const scores = tracks
    .map(t => t.strategy?.total ?? 0)
    .filter(s => s > 0);
  if (scores.length === 0) return [];
  const channelAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // 키워드 → 영상 목록 그룹핑
  const topicMap = new Map<string, number[]>();
  for (const track of tracks) {
    const kws = extractKeywords(track.name);
    const score = track.strategy?.total ?? 0;
    for (const kw of kws) {
      if (!topicMap.has(kw)) topicMap.set(kw, []);
      topicMap.get(kw)!.push(score);
    }
  }

  // 2개 이상 영상이 있는 키워드만 — 채널 평균 대비 판정
  const signals: TopicSignal[] = [];
  for (const [topic, scoreList] of topicMap) {
    if (scoreList.length < 2) continue;
    const avg = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
    signals.push({
      topic:    topic.toUpperCase(),
      trend:    avg >= channelAvg ? "up" : "down",
      avgScore: Math.round(avg),
    });
  }

  // 상위 4개 (up → down, avgScore 내림차순)
  signals.sort((a, b) => {
    if (a.trend !== b.trend) return a.trend === "up" ? -1 : 1;
    return b.avgScore - a.avgScore;
  });

  return signals.slice(0, 4);
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export function useExecutionController(data: {
  tracksWithScore:   Array<{ videoId: string; name: string; publishedAt?: string; strategy?: { total?: number } }>;
  opportunityVideos: ScheduledVideo[];
}): ExecutionState {
  const { tracksWithScore, opportunityVideos } = data;

  const empty: ExecutionState = {
    uploadedThisWeek:    [],
    scheduledContent:    (opportunityVideos ?? []).slice(0, 3),
    nextUploadDate:      null,
    isOverdue:           false,
    overdueDays:         0,
    uploadMomentum:      "unknown",
    daysSinceLastUpload: null,
    avgIntervalDays:     null,
    topicMomentum:       [],
  };

  if (!tracksWithScore || tracksWithScore.length === 0) return empty;

  const now = new Date();

  // publishedAt 유효한 트랙만 최신순 정렬
  const dated = tracksWithScore
    .filter(t => Boolean(t.publishedAt))
    .sort(
      (a, b) =>
        new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime(),
    );

  if (dated.length === 0) {
    console.error(
      "[useExecutionController] No valid upload dates — " +
      "publishedAt 데이터 없음. 시트 upload_date / published_at / 업로드일 컬럼 확인 필요",
    );
    return { ...empty, scheduledContent: (opportunityVideos ?? []).slice(0, 3) };
  }

  // 최근 업로드 (30일 이내)
  const uploadedThisWeek: UploadedVideo[] = dated
    .filter(t => {
      const diff =
        (now.getTime() - new Date(t.publishedAt!).getTime()) / MS_PER_DAY;
      return diff <= 30;
    })
    .map(t => ({
      videoId:     t.videoId,
      title:       t.name,
      publishedAt: t.publishedAt!,
    }));

  // ── Execution 진단 로그 ────────────────────────────────────────────────────
  console.group("[ExecutionController] 업로드 진단");
  console.log(`publishedAt 있는 트랙: ${dated.length}개 / 전체: ${tracksWithScore.length}개`);
  console.log(`최신 upload_date: ${dated[0]?.publishedAt?.slice(0, 10) ?? "(없음)"}`);
  console.log(`최근 업로드(30일 이내): ${uploadedThisWeek.length}개`);
  uploadedThisWeek.forEach(v => {
    const days = ((now.getTime() - new Date(v.publishedAt).getTime()) / MS_PER_DAY).toFixed(1);
    console.log(`  ✅ [${days}일 전] ${v.title.slice(0, 60)}`);
  });
  if (uploadedThisWeek.length === 0) {
    console.warn(
      "  ⚠️  이번 주 업로드 없음 — 시트 _RawData_Master의 upload_date 컬럼과 GitHub Actions 실행 여부를 확인하세요",
    );
    console.log(
      "  최근 영상 5개 날짜:",
      dated.slice(0, 5).map(t => `${t.videoId}: ${t.publishedAt?.slice(0, 10)}`),
    );
  }
  console.groupEnd();

  // 업로드 후보 (opportunityVideos 상위 3개)
  const scheduledContent: ScheduledVideo[] = (opportunityVideos ?? []).slice(0, 3);

  // 마지막 업로드 이후 경과일
  const lastUpload = dated.length > 0 ? new Date(dated[0].publishedAt!) : null;
  const daysSinceLastUpload =
    lastUpload != null
      ? (now.getTime() - lastUpload.getTime()) / MS_PER_DAY
      : null;

  // 업로드 모멘텀 (≤5 → healthy, ≤10 → slowing, >10 → stalled)
  let uploadMomentum: UploadMomentum = "unknown";
  if (daysSinceLastUpload !== null) {
    if (daysSinceLastUpload <= 5)       uploadMomentum = "healthy";
    else if (daysSinceLastUpload <= 10) uploadMomentum = "slowing";
    else                                 uploadMomentum = "stalled";
  }

  // 평균 업로드 간격 & 다음 업로드 예측일
  const avgIntervalMs   = estimateUploadInterval(dated as { publishedAt: string }[]);
  const avgIntervalDays = avgIntervalMs / MS_PER_DAY;
  const nextUploadDate  =
    lastUpload != null ? new Date(lastUpload.getTime() + avgIntervalMs) : null;

  // Overdue 판정: 예측일이 현재보다 과거이면 지연
  const isOverdue   = nextUploadDate != null && now.getTime() > nextUploadDate.getTime();
  const overdueDays = isOverdue
    ? Math.floor((now.getTime() - nextUploadDate!.getTime()) / MS_PER_DAY)
    : 0;

  // Topic Momentum
  const topicMomentum = computeTopicMomentum(tracksWithScore);

  return {
    uploadedThisWeek,
    scheduledContent,
    nextUploadDate,
    isOverdue,
    overdueDays,
    uploadMomentum,
    daysSinceLastUpload,
    avgIntervalDays,
    topicMomentum,
  };
}
