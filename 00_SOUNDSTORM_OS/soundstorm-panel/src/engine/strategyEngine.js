// ─── strategyEngine.js ──────────────────────────────────────────────────────
// 진단 결과 + 액션 성공률 → 오늘의 전략 합성
//
// computeDailyStrategy(diagnostics, typeRates) → StrategyOutput | null
//
// StrategyOutput:
//   nextContent       string     — 콘텐츠 방향 (DailyStrategyPanel)
//   bestUploadTime    string     — 업로드 추천 시간 (DailyStrategyPanel)
//   strategicNote     string     — 전략 근거 (DailyStrategyPanel)
//   secondaryNote     string?    — 보조 이슈 1줄 힌트 (DailyStrategyPanel)
//   quickActions      Action[]   — 즉시 실행 액션 { key, label, action_type }
//   expectedViews     number?    — 예상 조회수 하한 (NextStrategyPanel)
//   expectedViewsHigh number?    — 예상 조회수 상한 (NextStrategyPanel)
//   thumbnailAdvice   string     — 썸네일 전략 힌트 (NextStrategyPanel)
//   confidence        number     — 0~1 전략 신뢰도 (NextStrategyPanel)
//   topIssue          object     — 가장 심각한 진단 항목
//   secondaryIssue    object?    — 두 번째 이슈 (다른 problemType)

export { computeChannelHealth } from "./channelHealthEngine";

// ─── 영상 제목 안전 처리 ──────────────────────────────────────────────────────
// title이 YouTube video ID 형식이면 표시하지 않는다.
// (reachAdapter / diagnosticsEngine에서 title = videoId fallback이 들어오는 경우 방지)

const _VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function _safeTitle(title, videoId) {
  if (!title || !title.trim() || _VIDEO_ID_RE.test(title.trim())) {
    return "제목 없음";
  }
  return title.trim();
}

// ─── 우선순위: RETENTION > IMPRESSION > CTR ──────────────────────────────────

const PRIORITY = {
  RETENTION_WEAK:  3,
  IMPRESSION_DROP: 2,
  CTR_WEAK:        1,
};

// ─── 진단 조합 → 전략 카피 ───────────────────────────────────────────────────

const STRATEGY_COPY = {
  RETENTION_WEAK: {
    INTRO_DROP: {
      nextContent:   "인트로 15초 집중 개편",
      strategicNote: "초반 이탈이 가장 심각한 영상 발견 — 인트로 훅 강화가 최우선. 첫 5초에 결론·핵심 장면 배치.",
    },
    MID_DROP: {
      nextContent:   "중반 편집 강화",
      strategicNote: "중반 이탈 패턴 감지 — 챕터 마커 추가 및 중반 페이스 개선 권장. 지루한 구간 컷 편집.",
    },
    FLAT_DROP: {
      nextContent:   "전체 구조 재편성",
      strategicNote: "전반적 유지율 저하 — 핵심 내용 앞배치 + 러닝타임 단축. 15분 초과 영상 분할 검토.",
    },
    DEFAULT: {
      nextContent:   "시청유지율 개선",
      strategicNote: "채널 평균 대비 시청시간 저하 — 인트로 재편집 우선, YouTube Analytics 이탈 지점 직접 확인.",
    },
  },
  IMPRESSION_DROP: {
    DEFAULT: {
      nextContent:   "알고리즘 신호 복구",
      strategicNote: "노출수 급감 — 커뮤니티 포스트 + 업로드 주기 정상화로 알고리즘 신호 회복. 쇼츠 연계 고려.",
    },
  },
  CTR_WEAK: {
    DEFAULT: {
      nextContent:   "썸네일 A/B 테스트",
      strategicNote: "CTR 저하 — 썸네일 실험 우선(클로즈업·텍스트 대비), 제목 패턴 병행 개선.",
    },
  },
};

// ─── 보조 이슈 → 1줄 힌트 ────────────────────────────────────────────────────

const SECONDARY_NOTE = {
  RETENTION_WEAK:  "⚡ 시청유지율 이슈 병행 — 인트로 개선 우선 검토",
  IMPRESSION_DROP: "⚡ 노출수 감소 병행 — 업로드 주기·커뮤니티 포스트 점검",
  CTR_WEAK:        "⚡ CTR 저하 병행 — 다음 업로드 시 썸네일 A/B 테스트",
};

// ─── 즉시 실행 액션 정의 ─────────────────────────────────────────────────────
// key: action_label (VideoDetailModal ACTION_MAP과 동일 키)
// action_type: problemType (registerActionComplete의 action_type)

const QUICK_ACTIONS = {
  RETENTION_WEAK: {
    INTRO_DROP: [
      { key: "INTRO_EDIT", label: "인트로 5초 재구성",  action_type: "RETENTION_WEAK" },
      { key: "CHAPTER",    label: "챕터 마커 추가",     action_type: "RETENTION_WEAK" },
    ],
    MID_DROP: [
      { key: "CHAPTER",    label: "챕터 마커 추가",     action_type: "RETENTION_WEAK" },
      { key: "INTRO_EDIT", label: "중반 컷 편집",       action_type: "RETENTION_WEAK" },
    ],
    FLAT_DROP: [
      { key: "INTRO_EDIT", label: "전체 구조 재편성",   action_type: "RETENTION_WEAK" },
      { key: "CHAPTER",    label: "핵심 내용 앞배치",   action_type: "RETENTION_WEAK" },
    ],
    DEFAULT: [
      { key: "INTRO_EDIT", label: "인트로 재편집",      action_type: "RETENTION_WEAK" },
    ],
  },
  IMPRESSION_DROP: {
    DEFAULT: [
      { key: "COMMUNITY",  label: "커뮤니티 포스트",    action_type: "IMPRESSION_DROP" },
      { key: "TITLE",      label: "제목 최적화",        action_type: "IMPRESSION_DROP" },
    ],
  },
  CTR_WEAK: {
    DEFAULT: [
      { key: "THUMBNAIL",  label: "썸네일 A/B 테스트",  action_type: "CTR_WEAK" },
      { key: "TITLE",      label: "제목 패턴 개선",     action_type: "CTR_WEAK" },
    ],
  },
};

// ─── Bayesian cold-start blend ────────────────────────────────────────────────

function bayesBlend(rate, n, defaultRate = 0.5, k = 3) {
  return (rate * n + defaultRate * k) / (n + k);
}

// ─── 업로드 추천 시간 (요일 기반 휴리스틱) ───────────────────────────────────

function bestUploadTime() {
  const day = new Date().getDay();
  if (day <= 2) return "화/목 오후 8 – 10시";
  if (day <= 4) return "목 오후 8 – 10시";
  return "다음 화 오후 8 – 10시";
}

// ─── computeVideoPortfolio ───────────────────────────────────────────────────
// diagnostics[] → { hits, opportunities }
//
// hits:          rank, title, views, avgDurationSec, expansionHint
// opportunities: videoId, title, signal, opportunityScore (0~1)
//
// opportunityScore = W1*impressionsGrowth + W2*ctrPotential + W3*retentionGap

const W1 = 0.40;  // 노출 성장세
const W2 = 0.35;  // CTR 개선 여지
const W3 = 0.25;  // 유지율 개선 여지
const CTR_TARGET = 0.06;  // 목표 CTR 6%
const CTR_HIGH   = 0.04;  // 정상 판단 기준 4%

function _clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

function _computeScore(d, medianViews, maxImpressions) {
  // w1: impressionsGrowth — 노출 증가율 (0~1 정규화)
  const impressionsGrowth = d.impressionsChange != null
    ? _clamp(d.impressionsChange)
    : 0;

  // w2: ctrPotential — 노출 많은데 CTR 낮음 = 썸네일 개선 효과 큼
  const impRatio     = maxImpressions > 0 ? _clamp((d.impressions ?? 0) / maxImpressions) : 0;
  const ctrGapRatio  = CTR_TARGET > 0 ? _clamp((CTR_TARGET - (d.ctr ?? 0)) / CTR_TARGET) : 0;
  const ctrPotential = impRatio * ctrGapRatio;

  // w3: retentionGap — 조회수 많은데 유지율 낮음 = 편집 후 큰 성과
  const viewRatio    = medianViews > 0 ? _clamp((d.views ?? 0) / (medianViews * 3)) : 0;
  const retGapRatio  = d.retentionRate != null
    ? _clamp((0.5 - d.retentionRate) / 0.5)
    : (d.problemType === "RETENTION_WEAK" ? 0.6 : 0);
  const retentionGap = viewRatio * retGapRatio;

  return _clamp(W1 * impressionsGrowth + W2 * ctrPotential + W3 * retentionGap);
}

// ── 히트 영상 확장 전략 힌트 ─────────────────────────────────────────────────
function _expansionHint(video, d, rank) {
  if (!d) return "유사 콘텐츠 제작";
  if (rank <= 2)                                           return "Shorts 변환 권장";
  if ((d.ctr ?? 0) >= CTR_HIGH && d.problemType !== "RETENTION_WEAK") return "시리즈화 추천";
  if (d.problemType === "RETENTION_WEAK")                  return "하이라이트 제작";
  return "유사 콘텐츠 제작";
}

export function computeVideoPortfolio(diagnostics) {
  if (!diagnostics?.length) return { hits: [], opportunities: [] };

  // 기준값 계산
  const viewsSorted   = [...diagnostics].map(d => d.views ?? 0).sort((a, b) => a - b);
  const medianViews   = viewsSorted[Math.floor(viewsSorted.length / 2)] ?? 0;
  const maxImpressions = Math.max(...diagnostics.map(d => d.impressions ?? 0), 1);

  // ── 히트 영상: views 상위 10개 + expansionHint ────────────────────────────
  const diagById = new Map(diagnostics.map(d => [d.videoId, d]));
  const hits = [...diagnostics]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10)
    .map((v, i) => {
      const rank = i + 1;
      return {
        key:            v.videoId,
        rank,
        title:          _safeTitle(v.title, v.videoId),
        views:          v.views,
        likes:          null,
        avgDurationSec: v.avgWatchTime,
        expansionHint:  _expansionHint(v, diagById.get(v.videoId), rank),
      };
    });

  // ── 기회 영상: 시그널 분류 + opportunityScore 계산 ───────────────────────
  const seen         = new Set();
  const opportunities = [];

  for (const d of diagnostics) {
    if (seen.has(d.videoId)) continue;
    let signal = null;

    if (d.impressionsChange != null && d.impressionsChange > 0.5) {
      signal = "노출 폭발 ↑↑";
    } else if (d.problemType === "RETENTION_WEAK" && (d.views ?? 0) > medianViews) {
      signal = "편집 후 부스트 가능";
    } else if (d.problemType === "CTR_WEAK" && (d.impressions ?? 0) > 10_000) {
      signal = "썸네일 A/B → 조회수 ↑";
    } else if (d.problemType === "IMPRESSION_DROP" && d.severity === "MEDIUM") {
      signal = "노출 회복 기대";
    } else if (
      (!d.problemType || d.problemType === "NORMAL" || d.severity === "NONE") &&
      (d.ctr ?? 0) >= CTR_HIGH && (d.views ?? 0) > 500
    ) {
      signal = "CTR 상승 중 ↑";
    }

    if (signal) {
      seen.add(d.videoId);
      const opportunityScore = _computeScore(d, medianViews, maxImpressions);
      opportunities.push({
        videoId: d.videoId,
        title:   _safeTitle(d.title, d.videoId),
        signal,
        opportunityScore,
      });
    }
  }

  // opportunityScore 내림차순 정렬 → Top 8
  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return { hits, opportunities: opportunities.slice(0, 8) };
}

// ─── 영상 진단 공통 헬퍼 ─────────────────────────────────────────────────────

// 영상별 조회수 중앙값 (videoDiagnostics 기반 — kpiHistory 채널 합계와 혼용 금지)
function _medianVideoViews(videoDiagnostics) {
  const vals = videoDiagnostics
    .map(v => v.views ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return vals[Math.floor(vals.length / 2)];
}

// 채널 평균 CTR (impressions >= 500 기준)
function _channelAvgCTR(eligible) {
  const withCTR = eligible.filter(v => (v.ctr ?? 0) > 0);
  return withCTR.length > 0
    ? withCTR.reduce((s, v) => s + v.ctr, 0) / withCTR.length
    : null;
}

function _buildVideo(v, medianViews, channelAvgCTR, reasons) {
  const viewsDeltaPercent = medianViews
    ? Math.round(((v.views ?? 0) - medianViews) / medianViews * 100)
    : null;
  const ctrDelta = channelAvgCTR && (v.ctr ?? 0) > 0
    ? Math.round((v.ctr - channelAvgCTR) / channelAvgCTR * 100)
    : null;
  return {
    videoId: v.videoId,
    title:   _safeTitle(v.trackName || v.title, v.videoId),
    views:   v.views,
    viewsDeltaPercent,
    ctr:     (v.ctr ?? 0) > 0 ? v.ctr : null,
    ctrDelta,
    channelAvgCTR,
    reasons,
  };
}

// ─── getDecliningVideos ───────────────────────────────────────────────────────
// 최근 하락 트렌드 영상 — impressionsChange 기반 (이전 대비 급감)
//
// 조건: impressionsChange < -0.3  OR  problemType === "IMPRESSION_DROP"
// 정렬: impressionsChange 오름차순 (가장 급락한 영상 먼저)

export function getDecliningVideos(videoDiagnostics = []) {
  if (!videoDiagnostics.length) return [];

  const eligible = videoDiagnostics.filter(v => (v.impressions ?? 0) >= 500);
  if (!eligible.length) return [];

  const avgCTR     = _channelAvgCTR(eligible);
  const medianViews = _medianVideoViews(eligible);

  const declining = eligible.filter(v =>
    (v.impressionsChange != null && v.impressionsChange < -0.3) ||
    v.problemType === "IMPRESSION_DROP",
  );

  declining.sort((a, b) => (a.impressionsChange ?? 0) - (b.impressionsChange ?? 0));

  return declining.map(v => {
    const reasons = ["추천 노출 감소"];
    if (avgCTR && (v.ctr ?? 0) > 0 && v.ctr < avgCTR * 0.7) reasons.push("클릭률 저조");
    return _buildVideo(v, medianViews, avgCTR, reasons);
  });
}

// ─── getConsistentlyLowVideos ─────────────────────────────────────────────────
// 지속 저조 영상 — 채널 평균 대비 절대적으로 낮은 영상 (트렌드 무관)
//
// 조건: ctr < channelAvgCTR × 0.7  OR  views < medianViews × 0.8
//       단, 급감 영상(impressionsChange < -0.3)은 getDecliningVideos에서 처리
// 정렬: CTR 낮은 순 → 조회수 낮은 순

export function getConsistentlyLowVideos(videoDiagnostics = []) {
  if (!videoDiagnostics.length) return [];

  const eligible = videoDiagnostics.filter(v => (v.impressions ?? 0) >= 500);
  if (!eligible.length) return [];

  const avgCTR      = _channelAvgCTR(eligible);
  const medianViews = _medianVideoViews(eligible);

  const low = eligible.filter(v => {
    // 급락 영상은 제외 (getDecliningVideos 담당)
    if (v.impressionsChange != null && v.impressionsChange < -0.3) return false;
    if (v.problemType === "IMPRESSION_DROP") return false;

    const ctrLow   = avgCTR    && (v.ctr ?? 0) > 0 ? v.ctr < avgCTR * 0.7       : false;
    const viewsLow = medianViews                    ? (v.views ?? 0) < medianViews * 0.8 : false;
    return ctrLow || viewsLow;
  });

  low.sort((a, b) => {
    const ctrA = (a.ctr ?? 0) > 0 ? a.ctr : Infinity;
    const ctrB = (b.ctr ?? 0) > 0 ? b.ctr : Infinity;
    if (ctrA !== ctrB) return ctrA - ctrB;
    return (a.views ?? 0) - (b.views ?? 0);
  });

  return low.map(v => {
    const reasons = [];
    if (avgCTR && (v.ctr ?? 0) > 0 && v.ctr < avgCTR * 0.7) reasons.push("클릭률 저조");
    if (medianViews && (v.views ?? 0) < medianViews * 0.8)   reasons.push("조회수 하락");
    if (reasons.length === 0) reasons.push("조회수 하락");
    return _buildVideo(v, medianViews, avgCTR, reasons);
  });
}

// computeChannelHealth는 channelHealthEngine.js로 분리됨.

// ─── computeGrowthData ───────────────────────────────────────────────────────
// ChannelKPIRow[] → { summary, prev30, growth } for GrowthPanel
//
// history는 date 오름차순 정렬을 가정 (ChannelKPIAdapter 보장)

export function computeGrowthData(kpiHistory) {
  if (!kpiHistory?.length) return { summary: null, prev30: null, growth: null };

  const sorted = [...kpiHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const summary = {
    views:        latest.views30d,
    likes:        null,
    watchTimeMin: latest.watchTimeMin,
    avgDurationSec: null,
    subscribers:  latest.subscribers,
    revenue:      latest.estimatedRevenueUsd,
  };

  const prev30 = prev ? {
    views:        prev.views30d,
    likes:        null,
    watchTimeMin: prev.watchTimeMin,
    avgDurationSec: null,
    subscribers:  prev.subscribers,
    revenue:      prev.estimatedRevenueUsd,
  } : null;

  function pct(cur, pre) {
    if (!pre || pre === 0 || cur == null) return null;
    return Math.round((cur - pre) / Math.abs(pre) * 100);
  }

  const growth = prev30 ? {
    views:       pct(summary.views,        prev30.views),
    likes:       null,
    watchTime:   pct(summary.watchTimeMin, prev30.watchTimeMin),
    avgDuration: null,
    subscribers: pct(summary.subscribers,  prev30.subscribers),
  } : null;

  return { summary, prev30, growth };
}

// ─── computeGoldenHour ───────────────────────────────────────────────────────
// (kpiHistory, reachRows) → 최적 업로드 타이밍 추천
//
// Level 1: KR 96% 음악 채널 휴리스틱
// Level 2: kpiHistory ≥ 4개 → 요일별 views30d 변화 보정
// Level 3: reachRows published_at → 요일×시간 heatmap (지수 가중치)
//
// 반환: { bestDay, bestHour, secondaryDay, secondaryHour,
//         leadTimeHours, timezone, confidence, basis, level, days[] }

const BASE_DAY_SCORES = [
  { day: "일요일", dayIdx: 0, score: 0.45, uploadHour: "17:00" },
  { day: "월요일", dayIdx: 1, score: 0.50, uploadHour: "22:00" },
  { day: "화요일", dayIdx: 2, score: 0.55, uploadHour: "21:00" },
  { day: "수요일", dayIdx: 3, score: 0.65, uploadHour: "21:00" },
  { day: "목요일", dayIdx: 4, score: 0.75, uploadHour: "20:00" },
  { day: "금요일", dayIdx: 5, score: 1.00, uploadHour: "19:00" },
  { day: "토요일", dayIdx: 6, score: 0.90, uploadHour: "16:00" },
];

const _DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function _hourRange(h) {
  return `${String(h).padStart(2, "0")}:00~${String((h + 2) % 24).padStart(2, "0")}:00`;
}

/**
 * published_at 문자열에서 KST 기준 { dayOfWeek, hour } 를 추출한다.
 *
 * 지원 형식:
 *   "2024-03-15T14:30:00+09:00"  → dayOfWeek=5, hour=14  (KST 직접 파싱)
 *   "2024-03-15T05:30:00Z"       → UTC → KST 변환 후 반환
 *   날짜만 ("2024-03-15")         → null 반환 (시간 정보 없음)
 */
function _parseKSTHour(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // ── +09:00 고정 KST 형식 — 문자열에서 직접 파싱 (locale 독립) ──────────
  const kstMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\+09:00/);
  if (kstMatch) {
    const [, y, mo, d, h] = kstMatch.map(Number);
    const dayOfWeek = new Date(y, mo - 1, d).getDay();
    return { dayOfWeek, hour: h };
  }

  // ── UTC "Z" 형식 → KST 변환 ───────────────────────────────────────────
  const utcMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/);
  if (utcMatch) {
    const pub = new Date(s);
    if (isNaN(pub.getTime())) return null;
    const kstMs = pub.getTime() + 9 * 60 * 60 * 1000;
    const kst   = new Date(kstMs);
    return { dayOfWeek: kst.getUTCDay(), hour: kst.getUTCHours() };
  }

  // ── 시간 포함 기타 형식 (로컬 파싱 허용) ─────────────────────────────
  if (s.includes("T") || /\d{4}-\d{2}-\d{2} \d{2}:/.test(s)) {
    const pub = new Date(s);
    if (isNaN(pub.getTime())) return null;
    return { dayOfWeek: pub.getDay(), hour: pub.getHours() };
  }

  return null; // 날짜 전용 → 시간 정보 없음
}

// ── Level 3: 요일×시간 heatmap (지수 가중치 decay=14일) ──────────────────────
function _buildHeatmap(reachRows) {
  if (!reachRows?.length) return null;

  const now = Date.now();
  // heatmap[dayIdx][hour] = { wSum: 누적가중조회수, wTotal: 누적가중치, count }
  const hm = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ wSum: 0, wTotal: 0, count: 0 }))
  );

  let totalRows = 0;
  let skippedCount = 0;
  for (const row of reachRows) {
    if (!row.published_at) continue;
    const kst = _parseKSTHour(row.published_at);
    if (!kst) { skippedCount++; continue; }  // 시간 정보 없음 → skip
    const views = Number(row.views) || 0;
    if (views <= 0) continue;

    const dayIdx = kst.dayOfWeek;
    const hour   = kst.hour;
    const pub     = new Date(row.published_at);
    const daysAgo = (now - pub.getTime()) / 86400000;
    const w       = Math.exp(-daysAgo / 14);   // 지수 감쇠 decay=14일

    hm[dayIdx][hour].wSum   += w * views;
    hm[dayIdx][hour].wTotal += w;
    hm[dayIdx][hour].count  += 1;
    totalRows++;
  }

  if (skippedCount > 0) {
    console.warn(`[GoldenHour] 시간 없는 데이터 ${skippedCount}개 제외됨 — published_at에 시간 포함 필요 (예: 2024-03-15T14:30:00+09:00)`);
  }
  if (totalRows < 3) return null;

  // 평면화 → 정렬
  // score = avgViews × log(count+1) — 샘플 많은 시간대 우대
  // count < 3 → ×0.5 페널티 (우연 패턴 억제)
  const cells = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = hm[d][h];
      if (cell.wTotal === 0) continue;
      const avg     = cell.wSum / cell.wTotal;
      const penalty = cell.count < 3 ? 0.5 : 1.0;
      const score   = avg * Math.log(cell.count + 1) * penalty;
      cells.push({ dayIdx: d, hour: h, avgViews: avg, count: cell.count, score });
    }
  }
  if (!cells.length) return null;
  cells.sort((a, b) => b.score - a.score);

  const top    = cells[0];
  // 2차: 다른 요일이거나 2시간 이상 차이
  const second = cells.find(c => c.dayIdx !== top.dayIdx || Math.abs(c.hour - top.hour) >= 2)
                 ?? cells[1];

  // confidence = min(0.90, log(n+1) / 5)
  const confidence = Math.min(0.90, Math.log(totalRows + 1) / 5);

  return {
    topDay:     _DAY_NAMES[top.dayIdx],
    topHour:    _hourRange(top.hour),
    topCount:   top.count,
    topDayIdx:  top.dayIdx,
    topHourRaw: top.hour,
    secondDay:  second ? _DAY_NAMES[second.dayIdx] : null,
    secondHour: second ? _hourRange(second.hour)   : null,
    secondCount: second ? second.count : null,
    sampleSize: totalRows,
    confidence,
    hm,         // UI 시각화용
  };
}

// ─── _buildPeakScore ─────────────────────────────────────────────────────────
// hourlyViews[{hour, views}] → 0~1 정규화된 배열 (인덱스 = 시간, 0~23)
function _buildPeakScore(hourlyViews) {
  if (!hourlyViews?.length) return null;
  const arr = new Array(24).fill(0);
  for (const { hour, views } of hourlyViews) {
    if (hour >= 0 && hour <= 23) arr[hour] = views;
  }
  const maxViews = Math.max(...arr);
  if (maxViews === 0) return null;
  return arr.map(v => v / maxViews);   // 0~1 정규화
}

// ─── GoldenHourResult 계약 (JSDoc typedef) ───────────────────────────────────
// 모든 레벨 함수는 반드시 이 shape을 반환해야 한다.
// 새 필드 추가 시: ① 여기 typedef ② _createBaseResult() ③ 해당 레벨 함수 순서로 작업.
/**
 * @typedef {Object} GoldenHourResult
 * @property {string|null}     bestDay        최적 업로드 요일
 * @property {string|null}     bestHour       최적 업로드 시간대 ("HH:00~HH:00")
 * @property {number|null}     bestCount      해당 요일×시간대 영상 수
 * @property {Array|undefined} bestVideos     해당 요일×시간대 영상 목록 (조회수 내림차순, 최대 10개)
 * @property {string|null}     peakHour       시청 피크 시간대
 * @property {string|null}     secondaryDay   2차 추천 요일
 * @property {string|null}     secondaryHour  2차 추천 시간대
 * @property {number|null}     secondaryCount 2차 시간대 영상 수
 * @property {number}          leadTimeHours  업로드 준비 리드타임 (고정 3)
 * @property {string}          timezone       기준 타임존 (고정 "KST (UTC+9)")
 * @property {number}          confidence     신뢰도 0~1
 * @property {string}          basis          신뢰도 근거 설명
 * @property {1|2|3|4}         level          데이터 품질 레벨
 * @property {Array}           days           요일별 점수 목록
 * @property {Array|undefined} heatmapData    heatmap 원본 (Lv.3/4 전용, 나머지 undefined)
 */

// ── 팩토리: 항상 fresh object, 기본값 보장 ────────────────────────────────────
// Object.freeze로 기본 템플릿 보호 → 직접 변경 시 strict mode에서 즉시 에러
/** @returns {GoldenHourResult} */
function _createBaseResult() {
  return Object.freeze({
    bestDay:        null,
    bestHour:       null,
    bestCount:      null,
    bestVideos:     undefined,
    videosByDay:    {},
    peakHour:       null,
    secondaryDay:   null,
    secondaryHour:  null,
    secondaryCount: null,
    leadTimeHours:  3,
    timezone:       "KST (UTC+9)",
    confidence:     0.55,
    basis:          "",
    level:          1,
    days:           [],
    heatmapData:    undefined,
  });
}

// ── 검증: 레벨별 필수 필드 확인 → 조용한 오류를 즉시 크래시로 전환 ───────────
function _validateResult(result) {
  if (!result.bestDay)
    throw new Error(`[GoldenHour Lv${result.level}] bestDay 누락`);
  if (!result.bestHour)
    throw new Error(`[GoldenHour Lv${result.level}] bestHour 누락`);
  if (result.confidence < 0 || result.confidence > 1)
    throw new Error(`[GoldenHour Lv${result.level}] confidence 범위 오류: ${result.confidence}`);
  if (![1, 2, 3, 4].includes(result.level))
    throw new Error(`[GoldenHour] 유효하지 않은 level: ${result.level}`);
  if (result.level >= 3) {
    if (result.bestCount == null)
      throw new Error(`[GoldenHour Lv${result.level}] bestCount 누락 (Lv3+ 필수)`);
    if (!result.heatmapData)
      throw new Error(`[GoldenHour Lv${result.level}] heatmapData 누락 (Lv3+ 필수)`);
  }
  return Object.freeze(result);  // 최종 반환값도 freeze → 외부 변경 방지
}

// ── 레벨별 builder: level 자동 주입 + 검증 통과해야 반환 ─────────────────────
function _buildLv1Result(partial) {
  return _validateResult({ ..._createBaseResult(), level: 1, ...partial });
}
function _buildLv2Result(partial) {
  return _validateResult({ ..._createBaseResult(), level: 2, ...partial });
}
function _buildLv3or4Result(partial) {
  // level(3 또는 4)은 partial에서 반드시 제공해야 함
  return _validateResult({ ..._createBaseResult(), ...partial });
}

// ── 공통 헬퍼: 전체 요일별 영상 맵 생성 (dayIdx → videos[]) ─────────────────
function _computeVideosByDay(reachRows) {
  const map = {};
  for (const d of BASE_DAY_SCORES) {
    const videos = _videosByDayIdx(reachRows, d.dayIdx);
    if (videos.length > 0) map[d.dayIdx] = videos;
  }
  return map;
}

// ── 공통 헬퍼: reachRows에서 특정 요일 영상 추출 (날짜 전용 형식도 지원) ─────
function _videosByDayIdx(reachRows, dayIdx) {
  return (reachRows ?? [])
    .filter(r => {
      if (!r.published_at) return false;
      const m = String(r.published_at).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return false;
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() === dayIdx;
    })
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);
}

// ── 공통 헬퍼: peakScore 배열에서 최고점 시간대 → _hourRange 문자열 ──────────
function _peakHourStr(peakScore) {
  if (!peakScore) return null;
  const idx = peakScore.reduce((bH, v, h) => v > peakScore[bH] ? h : bH, 0);
  return _hourRange(idx);
}

// ── Level 1: KR 음악 채널 휴리스틱 ───────────────────────────────────────────
function _computeLv1(peakScore, reachRows) {
  const days   = BASE_DAY_SCORES.map(d => ({ ...d, adjusted: d.score }))
                   .sort((a, b) => b.adjusted - a.adjusted);
  const best   = days[0];
  const second = days[1];
  const videos = _videosByDayIdx(reachRows, best.dayIdx);
  return _buildLv1Result({
    bestDay:       best.day,
    bestHour:      best.uploadHour,
    bestCount:     videos.length > 0 ? videos.length : null,
    bestVideos:    videos.length > 0 ? videos : undefined,
    videosByDay:   _computeVideosByDay(reachRows),
    peakHour:      _peakHourStr(peakScore),
    secondaryDay:  second.day,
    secondaryHour: second.uploadHour,
    confidence:    0.55,
    basis:         "업로드 시간 데이터 없음 — KR 음악 채널 패턴 기반 추정 (정확도 제한)",
    days,
  });
}

// ── Level 2: kpiHistory 요일 보정 ─────────────────────────────────────────────
function _computeLv2(kpiHistory, peakScore, reachRows) {
  const dayBoosts = {};
  const sorted = [...kpiHistory].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const cur  = sorted[i];
    const prev = sorted[i - 1];
    if (!cur.date || !prev.date || prev.views30d == null || prev.views30d === 0) continue;
    const change = (cur.views30d - prev.views30d) / prev.views30d;
    const dayIdx = new Date(cur.date).getDay();
    if (!dayBoosts[dayIdx]) dayBoosts[dayIdx] = [];
    dayBoosts[dayIdx].push(change);
  }

  const days = BASE_DAY_SCORES.map(d => {
    const boosts = dayBoosts[d.dayIdx] ?? [];
    let adjusted = d.score;
    if (boosts.length >= 2) {
      const avg = boosts.reduce((s, v) => s + v, 0) / boosts.length;
      adjusted  = Math.min(1.0, Math.max(0.1, d.score + avg * 0.2));
    }
    return { ...d, adjusted };
  }).sort((a, b) => b.adjusted - a.adjusted);

  const best   = days[0];
  const second = days[1];
  const videos = _videosByDayIdx(reachRows, best.dayIdx);
  return _buildLv2Result({
    bestDay:       best.day,
    bestHour:      best.uploadHour,
    bestCount:     videos.length > 0 ? videos.length : null,
    bestVideos:    videos.length > 0 ? videos : undefined,
    videosByDay:   _computeVideosByDay(reachRows),
    peakHour:      _peakHourStr(peakScore),
    secondaryDay:  second.day,
    secondaryHour: second.uploadHour,
    confidence:    0.72,
    basis:         `업로드 시간 데이터 부족 — 채널 스냅샷 ${kpiHistory.length}회 기반 추정 (정확도 제한)`,
    days,
  });
}

// ── Level 3/4: 실업로드 heatmap (± 시청 피크 결합) ───────────────────────────
function _computeLv3or4(hm, peakScore, reachRows) {
  const days = BASE_DAY_SCORES.map(d => ({ ...d, adjusted: d.score }));

  let finalDayIdx = hm.topDayIdx;
  let finalHour   = hm.topHourRaw;
  let level       = 3;
  let basis       = `실업로드 heatmap — ${hm.sampleSize}개 영상 × 14일 지수가중치`;
  let confidence  = hm.confidence;

  if (peakScore) {
    let bestCombined = null;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = hm.hm[d][h];
        if (cell.wTotal === 0) continue;
        const avg      = cell.wSum / cell.wTotal;
        const penalty  = cell.count < 3 ? 0.5 : 1.0;
        const upScore  = avg * Math.log(cell.count + 1) * penalty;
        const pk       = peakScore[h] ?? 0;
        const combined = 0.6 * upScore + 0.4 * pk * avg;
        if (!bestCombined || combined > bestCombined.score) {
          bestCombined = { d, h, score: combined, count: cell.count };
        }
      }
    }
    if (bestCombined) {
      finalDayIdx = bestCombined.d;
      finalHour   = bestCombined.h;
      level       = 4;
      basis       = `업로드 실적 × 시청 피크 결합 (60:40) — ${hm.sampleSize}개 영상`;
      confidence  = Math.min(0.95, hm.confidence + 0.05);
    }
  }

  const bestVideos = (reachRows ?? [])
    .filter(r => {
      const kst = _parseKSTHour(r.published_at);
      return kst && kst.dayOfWeek === finalDayIdx && kst.hour === finalHour;
    })
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  return _buildLv3or4Result({
    bestDay:        _DAY_NAMES[finalDayIdx],
    bestHour:       _hourRange(finalHour),
    bestCount:      hm.hm[finalDayIdx][finalHour]?.count ?? null,
    bestVideos:     bestVideos.length > 0 ? bestVideos : undefined,
    videosByDay:    _computeVideosByDay(reachRows),
    peakHour:       _peakHourStr(peakScore),
    secondaryDay:   hm.secondDay   ?? days[1].day,
    secondaryHour:  hm.secondHour  ?? days[1].uploadHour,
    secondaryCount: hm.secondCount ?? null,
    confidence,
    basis,
    level,
    days,
    heatmapData:    hm.hm,
  });
}

// ─── computeGoldenHour (public) ───────────────────────────────────────────────
// 새 필드 추가 프로세스 (반드시 이 순서로):
//   ① GoldenHourResult typedef에 필드 추가
//   ② _createBaseResult()에 기본값 추가
//   ③ 필요한 레벨 builder (_buildLvNResult)에서 override
// → _validateResult가 필수 필드 누락을 즉시 크래시로 전환한다.
export function computeGoldenHour(kpiHistory, reachRows, hourlyViews) {
  const hm        = _buildHeatmap(reachRows);
  const peakScore = _buildPeakScore(hourlyViews);

  if (hm)                             return _computeLv3or4(hm, peakScore, reachRows);
  if ((kpiHistory ?? []).length >= 4) return _computeLv2(kpiHistory, peakScore, reachRows);
  return _computeLv1(peakScore, reachRows);
}

// ─── computeRecommendationScore ──────────────────────────────────────────────
// 추천 항목 점수 계산 — 학습 기반 자동 정렬의 핵심
//
// baseScore =
//   clamp01(pattern_success_rate) * 0.4  — 해당 액션 타입 과거 성공률
//   clamp01(golden_hour_match)    * 0.3  — 현재 시간과 골든아워 근접도
//   clamp01(recency_weight)       * 0.2  — 이슈 최신성
//   clamp01(user_preference)      * 0.1  — 사용자가 이 타입을 완료한 경향
//
// 긴급도 보정 (승수 × 가산 조합):
//   CRITICAL: baseScore * 1.2 + 0.2  — 좋은 진단일수록 더 올라감
//   HIGH:     baseScore * 1.1 + 0.1
//
// @param {object} item         — DecisionItem 후보
// @param {object} goldenHour   — computeGoldenHour 반환값
// @param {object} typeRates    — loadActionTypeRates 반환값
// @param {number} [now]        — Date.now() 기준 (테스트 주입용)
// @returns {number}            — 0~1 점수

// 각 요소가 0~1 범위를 보장하기 위한 clamp (가중치 의미 보존)
function _clamp01(v) { return Math.max(0, Math.min(1, v)); }

function computeRecommendationScore(item, goldenHour, typeRates, now) {
  const nowMs = now ?? Date.now();

  // 1. pattern_success_rate (0.4): 액션 타입 성공률 — Bayesian cold-start 보호
  const rateKey  = item.problemType ?? item.type ?? "unknown";
  const rateData = typeRates?.[rateKey];
  const successRate = _clamp01(rateData
    ? bayesBlend(rateData.rate, rateData.total)
    : 0.5);

  // 2. golden_hour_match (0.3): 현재 시간 ↔ 골든아워 근접도
  let rawGoldenMatch = 0.5;  // neutral
  if (item.type === "upload" && goldenHour?.bestHour) {
    const m = String(goldenHour.bestHour).match(/^(\d{1,2}):/);
    if (m) {
      const recHour  = parseInt(m[1], 10);
      const curHour  = new Date(nowMs).getHours();
      const diff     = Math.abs(curHour - recHour);
      const wrapDiff = Math.min(diff, 24 - diff);
      // 0h = 1.0, 4h = 0.5, 8h = 0.0
      rawGoldenMatch = 1 - wrapDiff / 8;
    }
  } else if (item.type === "danger" || item.type === "warning") {
    rawGoldenMatch = 0.8;  // 진단 이슈: 즉시 조치 — 항상 높게
  }
  const goldenMatch = _clamp01(rawGoldenMatch);

  // 3. recency_weight (0.2): 이슈 최신성
  let rawRecency;
  if (item._severity === "CRITICAL") {
    rawRecency = 1.0;  // CRITICAL: 항상 최신 취급
  } else if (item._severity === "HIGH") {
    rawRecency = 0.85;
  } else if (item._severity === "MEDIUM") {
    rawRecency = 0.70;
  } else if (item._date) {
    const daysAgo = (nowMs - new Date(item._date).getTime()) / 86400000;
    rawRecency = Math.exp(-Math.max(0, daysAgo) / 7);
  } else {
    rawRecency = 0.5;
  }
  const recencyWeight = _clamp01(rawRecency);

  // 4. user_preference (0.1): skip_rate 기반 — 자주 무시한 타입은 점수 낮춤
  // typeRates 키는 uppercase (예: "STRATEGY"), item.type은 lowercase → 정규화 필요
  const skipRateData = typeRates?.[(item.type ?? "").toUpperCase()];
  const skipRate     = _clamp01(skipRateData?.skip_rate ?? 0);
  const userPref     = _clamp01(1 - skipRate);

  const baseScore = _clamp01(
    successRate  * 0.4 +
    goldenMatch  * 0.3 +
    recencyWeight * 0.2 +
    userPref     * 0.1,
  );

  // 긴급도 보정: 승수 × 가산 — "좋은 진단일수록 더 올라간다"
  // 단순 가산(+0.30)과 달리, 낮은 baseScore가 무조건 튀어오르지 않음
  const { mult, bonus } =
    item._severity === "CRITICAL" ? { mult: 1.2, bonus: 0.2 } :
    item._severity === "HIGH"     ? { mult: 1.1, bonus: 0.1 } :
                                    { mult: 1.0, bonus: 0.0 };

  return _clamp01(baseScore * mult + bonus);
}

// ─── computeDecisionBar ──────────────────────────────────────────────────────
// diagnostics[] + strategy + goldenHour + typeRates
//   → { items: DecisionItem[], urgent: boolean }
//
// DecisionItem: {
//   id, label, tag, type: "danger"|"warning"|"strategy"|"upload",
//   videoId?, problemType?, level?, recommendedHour?, pattern_tags?,
//   _score  (내부 정렬용, 외부 노출 불필요)
// }
//
// 변경점 (학습 기반 자동 정렬):
//   - 모든 후보 항목에 computeRecommendationScore 적용
//   - score 내림차순 정렬 후 TOP 3 반환
//   - CRITICAL: severityBoost +0.30 → 항상 상위 보장

export function computeDecisionBar(diagnostics, strategy, goldenHour, typeRates) {
  const candidates = [];

  // ── 진단 후보 — 중복 problemType 제거, 최대 2개 ──────────────────────────
  const actionable = (diagnostics ?? [])
    .filter(d => d.problemType && d.problemType !== "OK" && d.severity !== "LOW")
    .sort((a, b) => {
      const sev = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
      const sd  = (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
      return sd !== 0 ? sd : (b.views ?? 0) - (a.views ?? 0);
    });

  const seenProblem = new Set();
  for (const d of actionable) {
    if (seenProblem.size >= 2) break;
    if (seenProblem.has(d.problemType)) continue;
    seenProblem.add(d.problemType);

    const tagLabel = {
      RETENTION_WEAK:  "Retention",
      IMPRESSION_DROP: "노출 저하",
      CTR_WEAK:        "CTR 저하",
    }[d.problemType] ?? d.problemType;

    const actionLabel = {
      RETENTION_WEAK:  `인트로 수정 — ${_safeTitle(d.title, d.videoId)}`,
      IMPRESSION_DROP: `알고리즘 복구 — ${_safeTitle(d.title, d.videoId)}`,
      CTR_WEAK:        `썸네일 교체 — ${_safeTitle(d.title, d.videoId)}`,
    }[d.problemType] ?? `점검 필요 — ${_safeTitle(d.title, d.videoId)}`;

    const item = {
      id:             `diag-${d.videoId ?? d.problemType}`,
      videoId:        d.videoId       ?? null,
      problemType:    d.problemType,
      videoTitle:     _safeTitle(d.title, d.videoId),
      ctr:            d.ctr            ?? null,
      label:          actionLabel,
      tag:            tagLabel,
      type:           d.severity === "CRITICAL" ? "danger" : "warning",
      level:          null,
      recommendedHour: null,
      pattern_tags:   [d.problemType],
      // 내부 정렬용 메타 (반환 시 제거)
      _severity:      d.severity,
      _date:          d.date ?? null,
    };
    item._score = computeRecommendationScore(item, goldenHour, typeRates);
    candidates.push(item);
  }

  // ── 전략 후보 ────────────────────────────────────────────────────────────
  if (strategy?.nextContent) {
    const item = {
      id:             "strategy-next",
      label:          strategy.nextContent,
      tag:            "전략",
      type:           "strategy",
      level:          Math.round((strategy.confidence ?? 0.5) * 4),
      recommendedHour: goldenHour?.bestHour ?? null,
      pattern_tags:   ["strategy"],
      _severity:      null,
      _date:          null,
    };
    item._score = computeRecommendationScore(item, goldenHour, typeRates);
    candidates.push(item);
  }

  // ── 골든아워 업로드 타이밍 후보 ──────────────────────────────────────────
  if (goldenHour?.bestDay) {
    const item = {
      id:             "upload-timing",
      label:          `${goldenHour.bestDay} ${goldenHour.bestHour} 업로드`,
      tag:            "골든아워",
      type:           "upload",
      level:          goldenHour.level ?? 1,
      recommendedHour: goldenHour.bestHour,
      pattern_tags:   ["upload", `lv${goldenHour.level ?? 1}`],
      _severity:      null,
      _date:          null,
    };
    item._score = computeRecommendationScore(item, goldenHour, typeRates);
    candidates.push(item);
  }

  // ── ε-greedy: 탐험(20%) vs 최적화(80%) ──────────────────────────────────
  // 20%: danger/warning 슬롯 이후 남은 자리를 랜덤 후보로 채움 → 새로운 패턴 발견
  // 80%: score 내림차순 (최적화)
  // danger/warning 아이템은 탐험 대상에서 제외 — 긴급 이슈는 항상 확정 노출
  // ε decay: 데이터가 쌓일수록 탐험 줄이고 최적화 집중 (최소 5%)
  // totalSamples: 완료(total) + 노출(view_count) 합산 → 실제 상호작용 총량
  const totalSamples = Object.values(typeRates ?? {})
    .filter(v => v && typeof v === "object")
    .reduce((s, r) => s + (r.total ?? 0) + (r.view_count ?? 0), 0);
  const EPSILON = Math.max(0.05, 0.3 - totalSamples * 0.01);

  const urgentItems  = candidates.filter(c => c.type === "danger" || c.type === "warning");
  const normalItems  = candidates.filter(c => c.type !== "danger" && c.type !== "warning");

  // 긴급 항목: score 정렬 후 최대 2개
  urgentItems.sort((a, b) => b._score - a._score);
  const pickedUrgent = urgentItems.slice(0, 2);

  // 일반 항목 채우기: 남은 슬롯 수만큼
  const remaining = 3 - pickedUrgent.length;
  let pickedNormal;
  if (remaining <= 0) {
    pickedNormal = [];
  } else if (normalItems.length <= remaining) {
    pickedNormal = normalItems;
  } else if (Math.random() < EPSILON) {
    // 탐험: 무작위 섞기 → 앞에서 remaining개 (새로운 패턴 노출 기회)
    const shuffled = [...normalItems].sort(() => Math.random() - 0.5);
    pickedNormal = shuffled.slice(0, remaining);
  } else {
    // 최적화: score 내림차순 → 앞에서 remaining개
    normalItems.sort((a, b) => b._score - a._score);
    pickedNormal = normalItems.slice(0, remaining);
  }

  // 내부 정렬 메타 제거 후 반환
  const items = [...pickedUrgent, ...pickedNormal]
    .map(({ _score, _severity, _date, ...rest }) => rest);

  const urgent = (diagnostics ?? []).some(d => d.severity === "CRITICAL");
  return { items, urgent };
}

// ─── computeDailyStrategy ────────────────────────────────────────────────────

export function computeDailyStrategy(diagnostics, typeRates) {
  if (!diagnostics?.length) return null;

  // 1. OK 제외 — 실질적 이슈만
  const actionable = diagnostics.filter(d => d.problemType && d.problemType !== "OK");
  if (!actionable.length) return null;

  // 2. 우선순위 정렬 (동순위 → views 높은 것)
  const sorted = [...actionable].sort((a, b) => {
    const pd = (PRIORITY[b.problemType] ?? 0) - (PRIORITY[a.problemType] ?? 0);
    return pd !== 0 ? pd : (b.views ?? 0) - (a.views ?? 0);
  });
  const top = sorted[0];

  // 3. 보조 이슈 — 메인과 다른 problemType 중 최우선
  //    동일 타입 복수 영상은 보조 이슈로 간주하지 않음
  const secondary = sorted.find(d => d.problemType !== top.problemType) ?? null;

  // 4. 전략 카피
  const typeMap = STRATEGY_COPY[top.problemType] ?? {};
  const copy    = typeMap[top.diagnosis] ?? typeMap.DEFAULT ?? {
    nextContent:   "콘텐츠 최적화",
    strategicNote: "진단 데이터 기반 개선 권장.",
  };

  // 5. 보조 이슈 1줄 힌트
  const secondaryNote = secondary ? (SECONDARY_NOTE[secondary.problemType] ?? null) : null;

  // 6. 즉시 실행 액션 (problemType + diagnosis 조합)
  const qMap       = QUICK_ACTIONS[top.problemType] ?? {};
  const quickActions = (qMap[top.diagnosis] ?? qMap.DEFAULT ?? []).slice(0, 2);

  // 7. 신뢰도 = type rate 샘플 수 기반
  const rateEntries  = Object.values(typeRates ?? {});
  const totalSamples = rateEntries.reduce((s, r) => s + (r.total ?? 0), 0);
  const confidence   = Math.min(0.95, 0.3 + totalSamples * 0.02);

  // 8. 썸네일 힌트 — composite key → fallback 순
  const thumbKeys = [
    `${top.problemType}_THUMBNAIL`,
    "CTR_WEAK_THUMBNAIL",
    `${top.problemType}`,
  ];
  const thumbRate  = thumbKeys.map(k => typeRates?.[k]).find(r => r != null) ?? null;
  const thumbBlend = thumbRate ? bayesBlend(thumbRate.rate, thumbRate.total) : null;
  const thumbnailAdvice = thumbBlend != null
    ? `성공률 추정 ${Math.round(thumbBlend * 100)}% — A/B 테스트 권장`
    : "A/B 테스트 권장";

  // 9. 예상 조회수: top 영상 현재 조회수 × 개선 계수
  const baseViews        = top.views ?? 0;
  const expectedViews    = baseViews > 0 ? Math.round(baseViews * 1.2) : null;
  const expectedViewsHigh = expectedViews ? Math.round(expectedViews * 1.6) : null;

  return {
    // DailyStrategyPanel
    nextContent:    copy.nextContent,
    bestUploadTime: bestUploadTime(),
    strategicNote:  copy.strategicNote,
    secondaryNote,
    quickActions,
    // NextStrategyPanel
    expectedViews,
    expectedViewsHigh,
    thumbnailAdvice,
    confidence,
    // 참조용
    topIssue:       top,
    secondaryIssue: secondary,
  };
}
