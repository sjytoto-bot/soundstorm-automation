// ─── dataHealthReport v2 ──────────────────────────────────────────────────────
// Google Sheets 데이터가 분석 파이프라인에 정상적으로 들어왔는지 자동 검사.
// runFullAnalysis 완료 후 콘솔에 사람이 읽기 쉬운 보고서를 출력한다.
// UI 변경 없음 — 콘솔 출력 전용.
//
// v2 추가:
//   - publishedAt 커버리지 검사 (이번 주 업로드 반영 여부의 핵심 선행 조건)
//   - 7일 이내 영상 목록 출력
//   - 최신 upload_date 표시 (Sheets 마지막 동기화 시점 추정)

import type { NormalizedVideo } from "../core/types/normalized";
import type { AnalysisResult }  from "../core/enginePipeline";
import type { ReachRow }        from "../adapters/reachAdapter";
import type { UploadedVideo }   from "../controllers/useExecutionController";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── 구조화된 Health 타입 ──────────────────────────────────────────────────────

export interface DataHealthIssue {
  type:     string;
  severity: "error" | "warning" | "info";
  cause:    string;
  action:   string;
}

export interface DataHealth {
  ok:     boolean;
  issues: DataHealthIssue[];
}

// ─── computeDataHealth ────────────────────────────────────────────────────────
// 콘솔 출력 없음 — 구조화된 DataHealth 반환 (UI 연결용)
// generateDataHealthReport (콘솔 전용)와 별도로 유지

export function computeDataHealth(
  reachRows:        ReachRow[],
  uploadedThisWeek: UploadedVideo[],
): DataHealth {
  const sevenDaysAgo = Date.now() - 7 * MS_PER_DAY;
  const issues: DataHealthIssue[] = [];

  // ── 이번 주 업로드 체크 ──────────────────────────────────────────────────────
  const recentUploads = uploadedThisWeek.filter(v => {
    if (!v.publishedAt) return false;
    const t = new Date(v.publishedAt).getTime();
    return !isNaN(t) && t >= sevenDaysAgo;
  });

  if (recentUploads.length === 0) {
    // 자동 원인 분석
    const hasDateCol     = reachRows.some(r => r.published_at != null);
    const hasInvalidDate = uploadedThisWeek.some(
      v => v.publishedAt && isNaN(new Date(v.publishedAt).getTime()),
    );

    const cause = !hasDateCol
      ? "upload_date 컬럼 없음"
      : hasInvalidDate
      ? "날짜 파싱 실패 (형식 오류)"
      : "크롤링 미실행 또는 최근 업로드 없음";

    issues.push({
      type:     "NO_UPLOAD_THIS_WEEK",
      severity: "warning",
      cause,
      action:   "_RawData_Master upload_date 컬럼 확인",
    });
  }

  // ── publishedAt 커버리지 체크 ────────────────────────────────────────────────
  if (reachRows.length > 0) {
    const withDate = reachRows.filter(r => r.published_at).length;
    const pct      = Math.round(withDate / reachRows.length * 100);
    if (pct < 80) {
      issues.push({
        type:     "LOW_DATE_COVERAGE",
        severity: "warning",
        cause:    `${100 - pct}% 영상에 upload_date 없음`,
        action:   "시트 upload_date 컬럼 채우기",
      });
    }
  }

  // ── 노출/CTR 데이터 누락 감지 (studio_csv_ingestor 미실행 감지) ─────────────
  // impressions=0 또는 null → YouTube 데이터가 시트에 미동기화 상태
  // 최근 7일 영상의 50% 이상에서 발생하면 WARNING
  const recentReach = reachRows.filter(r =>
    r.published_at && new Date(r.published_at).getTime() >= sevenDaysAgo
  );

  if (recentReach.length > 0) {
    const missing     = recentReach.filter(r => !r.impressions).length;
    const missingRate = missing / recentReach.length;

    if (missingRate >= 0.5) {
      issues.push({
        type:     "IMPRESSIONS_MISSING",
        severity: "warning",
        cause:    `최근 7일 영상 ${missing}/${recentReach.length}개에 노출수(impressions) 없음 — 시트 미동기화`,
        action:   "studio_csv_ingestor.py 실행 또는 YouTube Studio CSV를 수동 업로드",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);
}

function avgFloat(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10000) / 10000;
}

// ─── generateDataHealthReport ─────────────────────────────────────────────────

export function generateDataHealthReport(
  videos: NormalizedVideo[],
  result: AnalysisResult,
): void {
  const now = Date.now();

  // ── publishedAt 커버리지 ──────────────────────────────────────────────────────
  const withDate    = videos.filter(v => Boolean(v.publishedAt));
  const withoutDate = videos.filter(v => !v.publishedAt);
  const dateRate    = videos.length > 0
    ? Math.round((withDate.length / videos.length) * 100)
    : 0;

  // 최신 publishedAt
  const sortedByDate = [...withDate].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const latestDate = sortedByDate[0]?.publishedAt ?? "(없음)";

  // 7일 이내 영상
  const thisWeek = withDate.filter(
    v => (now - new Date(v.publishedAt).getTime()) / MS_PER_DAY <= 7,
  );

  // ── 기타 지표 ────────────────────────────────────────────────────────────────
  const engagementRates = videos.map(v =>
    (v.likes + v.comments) / Math.max(v.views, 1),
  );

  const warnings: string[] = [];

  if (videos.length < 10) warnings.push("Low video count (<10)");
  if (!result.contentClusters?.clusters?.length) warnings.push("Cluster engine returned empty result");
  if (!result.trendDetection?.length) warnings.push("Trend detection returned empty result");
  if (dateRate < 80) warnings.push(`publishedAt 누락률 높음 — ${100 - dateRate}% 영상에 날짜 없음`);
  if (thisWeek.length === 0) warnings.push("이번 주 업로드 없음 — 최근 7일 내 publishedAt 있는 영상 0개");

  // ── 보고서 출력 ───────────────────────────────────────────────────────────────
  console.log("===== DATA HEALTH REPORT v2 =====");

  console.table({
    "Total Videos":        videos.length,
    "Sample Video":        videos[0]?.title ?? "(none)",
    "Avg Views":           average(videos.map(v => v.views)),
    "Avg Engagement":      avgFloat(engagementRates),
  });

  // publishedAt 진단
  console.log("── publishedAt 커버리지 ──");
  console.table({
    "날짜 있음":           withDate.length,
    "날짜 없음 ❌":        withoutDate.length,
    "커버리지":            `${dateRate}%`,
    "최신 upload_date":    latestDate.slice(0, 10),
    "이번 주 업로드 수":   thisWeek.length,
  });

  if (thisWeek.length > 0) {
    console.log("── 이번 주 업로드 목록 (7일 이내) ──");
    thisWeek.forEach(v => {
      const days = ((now - new Date(v.publishedAt).getTime()) / MS_PER_DAY).toFixed(1);
      console.log(`  ✅ [${days}일 전] ${v.title.slice(0, 60)}`);
    });
  } else {
    console.warn("  ⚠️  이번 주 업로드 목록 비어있음");
    console.warn("     원인 후보: (1) GitHub Actions 미실행 (2) upload_date 컬럼 누락 (3) 날짜 파싱 실패");
    console.warn("     확인: 시트 _RawData_Master 최신 upload_date 값 직접 조회");
  }

  if (withoutDate.length > 0) {
    console.warn("── publishedAt 누락 영상 (최대 5개) ──");
    withoutDate.slice(0, 5).forEach(v =>
      console.warn(`  ❌ ${v.videoId} | ${v.title.slice(0, 50)}`),
    );
  }

  console.table({
    "Tracks":   result.tracks?.length    ?? 0,
    "Clusters": result.contentClusters?.clusters?.length ?? 0,
    "Trends":   result.trendDetection?.length            ?? 0,
  });

  if (warnings.length > 0) {
    console.warn("⚠️  WARNINGS:", warnings);
  } else {
    console.log("✅  WARNINGS: None");
  }

  console.log("=================================");
}
