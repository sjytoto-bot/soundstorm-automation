// ─── UpdateStatusBar ───────────────────────────────────────────────────────────
// AnalyticsHeader 하단 — 데이터 신뢰도 요약 (한 줄 인라인)
//
// 상태 우선순위:
//   1. 자동화(Actions) — 최상위 / 지연 시 자동 dispatch
//   2. 시트 연동(Sheets sync + Pipeline Health) — 두 소스 중 최악 상태 표시
//   3. CTR/Reach 동기화
//
// 각 항목에 시간 정보 표시:
//   🟢 자동화 정상 · 방금   🟢 시트 정상 · 방금
//   🟡 자동화 지연 · 79분 미실행   🔴 시트 장애 2개 · 10분 전

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { T } from "../../styles/tokens";

const ACTIONS_REPO      = "sjytoto-bot/soundstorm-automation";
const WORKFLOW_FILE     = "youtube-data-sync.yml";
const REACH_WORKFLOW    = "reach-data-sync.yml";
const ACTIONS_CACHE_MS  = 3 * 60_000;   // 3분 캐시

// CTR/Reach는 일 2회 기준 → 임계값 시간 단위
const REACH_DELAYED_H = 26;   // 26시간 초과 → 🟡 지연
const REACH_FAILED_H  = 50;   // 50시간 초과 → 🔴 중단
// AUTO_TRIGGER_MIN > cron 주기(25min) * 2 를 유지해야 중복 dispatch 방지
// cron 25분 → stale 기준 60분 (25 * 2 = 50 < 60)
const AUTO_TRIGGER_MIN  = 60;
const STUCK_TIMEOUT_MIN = 30;           // RUNNING 30분 초과 → stuck 판단
const SAFETY_LOCK_MS    = 5 * 60_000;   // 5분 중복 dispatch 방지 safety lock

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type Dot = "🟢" | "🟡" | "🔴";
type ActionsStatus   = "healthy" | "delayed" | "failed";
type SheetsStatus    = "healthy" | "degraded" | "failed";
type PipelineStatus  = "healthy" | "warn" | "failed" | "unknown";
type SheetsAndPipelineStatus = "healthy" | "degraded" | "warn" | "failed";

interface DispatchLog {
  at:     Date;
  status: "PENDING" | "SUCCESS" | "FAILED";
  reason: string;
}

interface ActionsRun {
  id:         number;
  updated_at: string;
  conclusion: string | null;
  status:     string;
  name:       string;
}

interface SummaryItem {
  dot:  Dot;
  main: string;   // 상태 레이블
  time: string;   // 시간 보조 텍스트
}

// ─── 시간 유틸 ────────────────────────────────────────────────────────────────

function timeAgo(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return "";
  const ms  = Date.now() - new Date(isoOrDate).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1)  return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  if (h < 24)   return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

// ─── shouldDispatch (pure, testable) ─────────────────────────────────────────
// dispatch 여부를 결정하는 순수 함수. 컴포넌트 외부에서 단독 테스트 가능.
//
// 반환값:
//   "dispatch"  — 지금 dispatch 해야 함
//   "running"   — 정상 실행 중, 대기
//   "cooldown"  — 쿨다운 기간 중, 대기
//   "ok"        — 최근에 성공, 불필요

export interface ShouldDispatchInput {
  runs:             ActionsRun[];
  now:              number;   // Date.now() 기준 ms
  lastDispatchAt:   number;   // 마지막 dispatch 시도 ms (0 = 없음)
  retryCount:       number;   // 연속 실패 횟수
}

export type DispatchDecision = "dispatch" | "running" | "cooldown" | "ok";

export function shouldDispatch({
  runs,
  now,
  lastDispatchAt,
  retryCount,
}: ShouldDispatchInput): DispatchDecision {
  if (!runs.length) return "cooldown";

  const latest    = runs[0];
  const updatedMs = new Date(latest.updated_at).getTime();
  const isRunning = latest.status === "in_progress" || latest.status === "queued";

  // ① RUNNING이지만 30분 이상 업데이트 없으면 → stuck → "dispatch"로 진행
  if (isRunning) {
    const stuckMin = Math.round((now - updatedMs) / 60_000);
    if (stuckMin < STUCK_TIMEOUT_MIN) return "running";
    // stuck: fall through to dispatch logic
  }

  // ② 마지막 성공 시각 기준 (가장 최신 success, created_at 내림차순)
  const lastSuccess = runs
    .filter(r => r.conclusion === "success")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const successAt       = lastSuccess ? new Date(lastSuccess.updated_at).getTime() : 0;
  const minSinceSuccess = Math.round((now - successAt) / 60_000);

  // 최초 실행/이후 폴링 모두 동일하게 60분 기준을 적용한다.
  // bootstrap 예외를 두면 최신 success가 있어도 중복 dispatch가 발생할 수 있다.
  if (minSinceSuccess < AUTO_TRIGGER_MIN) return "ok";

  // ③ 5분 safety lock — 중복 dispatch 방지
  if (lastDispatchAt > 0 && now - lastDispatchAt < SAFETY_LOCK_MS) return "cooldown";

  // ④ exponential backoff: 45min × 2^retryCount (max 180min)
  if (lastDispatchAt > 0) {
    const backoffMin  = Math.min(45 * Math.pow(2, retryCount), 180);
    const sinceLastAt = Math.round((now - lastDispatchAt) / 60_000);
    if (sinceLastAt < backoffMin) return "cooldown";
  }

  return "dispatch";
}

// ─── GitHub Actions 자동 트리거 ───────────────────────────────────────────────

async function triggerWorkflow(): Promise<void> {
  const api = (window as any).api;
  const pat: string | undefined =
    (await api?.getGithubPat?.()) ??
    (import.meta as any).env?.VITE_GITHUB_PAT;

  if (!pat) {
    console.warn("[UpdateStatusBar] GitHub PAT 없음 — workflow dispatch 스킵");
    return;
  }

  const res = await fetch(
    `https://api.github.com/repos/${ACTIONS_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method:  "POST",
      headers: {
        Accept:         "application/vnd.github+json",
        Authorization:  `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      // inputs.trigger_source: workflow 측에서 cron vs dispatch 구분 가능
      body: JSON.stringify({ ref: "main", inputs: { trigger_source: "dispatch" } }),
    },
  );

  if (res.ok || res.status === 204) {
    console.log("[RUN] source: dispatch — workflow dispatch 성공");
  } else {
    console.warn("[RUN] source: dispatch — 실패:", res.status);
    throw new Error(`dispatch failed: ${res.status}`);
  }
}

// ─── fetchWithRetry ───────────────────────────────────────────────────────────

async function fetchWithRetry<T>(
  fn:      () => Promise<T>,
  retries = 3,
  delay   = 1_000,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
}

// ─── 상태 계산 ────────────────────────────────────────────────────────────────

function calcActionsStatus(runs: ActionsRun[] | null): {
  status:     ActionsStatus;
  main:       string;
  time:       string;
  minutesAgo: number;
} {
  if (!runs)        return { status: "delayed", main: "API 싱크 확인 중", time: "",            minutesAgo: 0 };
  if (!runs.length) return { status: "failed",  main: "API 싱크 연결 실패", time: "",           minutesAgo: 9999 };

  const failCount = runs.slice(0, 5).filter(r => r.conclusion === "failure").length;
  if (failCount >= 5) return { status: "failed", main: "API 싱크 중단", time: `${failCount}회 연속 실패`, minutesAgo: 9999 };

  const latest    = runs[0];
  const isRunning = latest.status === "in_progress" || latest.status === "queued";

  if (isRunning) {
    return { status: "healthy", main: "API 싱크 실행 중", time: timeAgo(latest.updated_at), minutesAgo: 0 };
  }

  if (latest.conclusion === "failure") {
    return { status: "failed", main: "API 싱크 중단", time: timeAgo(latest.updated_at), minutesAgo: 9999 };
  }

  const msAgo      = Date.now() - new Date(latest.updated_at).getTime();
  const minutesAgo = Math.round(msAgo / 60_000);
  const t          = timeAgo(latest.updated_at);

  if (minutesAgo < 30)  return { status: "healthy", main: "API 싱크 정상",   time: t,                         minutesAgo };
  if (minutesAgo < 90)  return { status: "delayed", main: "API 싱크 지연",   time: `${minutesAgo}분 미실행`,  minutesAgo };
  const h = Math.round(minutesAgo / 60);
  return               { status: "failed",  main: "API 싱크 중단",   time: `${h}시간 미실행`,     minutesAgo };
}

function calcSheetsStatus(syncError: string | null, lastSyncAt: string | null): {
  status:        SheetsStatus;
  main:          string;
  time:          string;
  usingSnapshot: boolean;
  snapshotAge?:  number;
} {
  if (!syncError) {
    const t = lastSyncAt ? timeAgo(lastSyncAt) : "";
    return { status: "healthy", main: "시트 싱크 정상", time: t, usingSnapshot: false };
  }
  if (syncError === "SYNC_FAILED") {
    return { status: "failed", main: "시트 싱크 실패", time: "", usingSnapshot: false };
  }
  if (syncError.startsWith("STALE_SNAPSHOT:")) {
    const savedAt    = syncError.replace("STALE_SNAPSHOT:", "");
    const msAgo      = Date.now() - new Date(savedAt).getTime();
    const minutesAgo = Math.round(msAgo / 60_000);
    return {
      status:        "degraded",
      main:          "시트 싱크 지연",
      time:          timeAgo(savedAt),
      usingSnapshot: true,
      snapshotAge:   minutesAgo,
    };
  }
  return { status: "degraded", main: "시트 싱크 확인 필요", time: "", usingSnapshot: false };
}

// ─── Reach (CTR/Impressions) 동기화 상태 ─────────────────────────────────────
// reach-data-sync.yml 마지막 성공 기준 — 일 2회 스케줄이므로 시간 단위 임계값 사용

function calcReachStatus(runs: ActionsRun[] | null): {
  status: ActionsStatus;
  main:   string;
  time:   string;
} {
  if (!runs)        return { status: "delayed", main: "스튜디오 싱크 확인 중",   time: "" };
  if (!runs.length) return { status: "failed",  main: "스튜디오 싱크 실패", time: "" };

  const lastSuccess = runs
    .filter(r => r.conclusion === "success")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

  if (!lastSuccess) {
    const latest = runs[0];
    if (latest.conclusion === "failure") {
      return { status: "failed", main: "스튜디오 싱크 실패", time: timeAgo(latest.updated_at) };
    }
    return { status: "delayed", main: "스튜디오 싱크 데이터 없음", time: "" };
  }

  const hoursAgo = Math.round((Date.now() - new Date(lastSuccess.updated_at).getTime()) / 3_600_000);
  const t = timeAgo(lastSuccess.updated_at);

  if (hoursAgo < REACH_DELAYED_H) return { status: "healthy", main: "스튜디오 싱크 정상",    time: t };
  if (hoursAgo < REACH_FAILED_H)  return { status: "delayed", main: "스튜디오 싱크 지연",    time: `${hoursAgo}시간 전` };
  return                                 { status: "failed",  main: "스튜디오 싱크 중단", time: `${hoursAgo}시간 전` };
}

// ─── _Pipeline_Health 탭 → 시트 상태 계산 ────────────────────────────────────

function calcPipelineHealth(rows: Record<string, string>[]): {
  status:    PipelineStatus;
  main:      string;
  time:      string;
  failCount: number;
  warnCount: number;
} {
  if (!rows || rows.length === 0)
    return { status: "unknown", main: "시트 싱크 미확인", time: "", failCount: 0, warnCount: 0 };

  const failCount = rows.filter(r => r.status === "FAIL" || r.status === "MISSING").length;
  const warnCount = rows.filter(r => r.status === "WARN").length;

  // checked_at — 가장 최신 값 사용 (KST 접미사 제거 후 파싱)
  const _sortedCheckedAt = rows.map(r => r.checked_at).filter(Boolean).sort();
  const checkedAt = _sortedCheckedAt.length > 0 ? _sortedCheckedAt[_sortedCheckedAt.length - 1] : null;
  const checkedAtNorm = checkedAt ? checkedAt.replace(/\s*KST$/, '').trim() : null;
  const time = checkedAtNorm ? timeAgo(checkedAtNorm) : "";

  if (failCount > 0)  return { status: "failed",  main: `시트 싱크 장애 ${failCount}개`,  time, failCount, warnCount };
  if (warnCount > 0)  return { status: "warn",    main: `시트 싱크 경고 ${warnCount}개`,  time, failCount, warnCount };
  return               { status: "healthy", main: "시트 싱크 정상",                       time, failCount, warnCount };
}

// ─── calcSheetsAndPipelineStatus ─────────────────────────────────────────────
// Sheets 동기화 + _Pipeline_Health 탭 → 두 소스 중 최악 상태를 단일 항목으로 반환
// 우선순위: failed > degraded > warn > healthy

function calcSheetsAndPipelineStatus(
  syncError:   string | null,
  lastSyncAt:  string | null,
  healthRows:  Record<string, string>[] | null,
): {
  status:        SheetsAndPipelineStatus;
  main:          string;
  time:          string;
  usingSnapshot: boolean;
  snapshotAge?:  number;
} {
  const s = calcSheetsStatus(syncError, lastSyncAt);
  const p = healthRows !== null && healthRows.length > 0
    ? calcPipelineHealth(healthRows)
    : null;

  // 수치 매핑: failed=3 > degraded/warn=2 > healthy/unknown=0
  const sheetsLevel =
    s.status === "failed"   ? 3 :
    s.status === "degraded" ? 2 : 0;
  const pipelineLevel = p
    ? (p.status === "failed" ? 3 : p.status === "warn" ? 2 : 0)
    : 0;

  // 양쪽 정상
  if (sheetsLevel === 0 && pipelineLevel === 0) {
    return { status: "healthy", main: "시트 싱크 정상", time: s.time || (p?.time ?? ""), usingSnapshot: false };
  }

  // 더 나쁜 쪽이 이긴다 (동점이면 sheets 우선 — 데이터 흐름의 상위 레이어)
  if (sheetsLevel >= pipelineLevel) {
    return {
      status:        s.status === "failed" ? "failed" : "degraded",
      main:          s.main,
      time:          s.time,
      usingSnapshot: s.usingSnapshot,
      snapshotAge:   s.snapshotAge,
    };
  } else {
    return {
      status:        p!.status === "failed" ? "failed" : "warn",
      main:          p!.main,
      time:          p!.time,
      usingSnapshot: false,
    };
  }
}

// ─── buildSummary ─────────────────────────────────────────────────────────────

function buildSummary(
  actionsMain:   string,
  actionsTime:   string,
  actionsStatus: ActionsStatus,
  sheetsMain:    string,
  sheetsTime:    string,
  sheetsStatus:  SheetsAndPipelineStatus,
  usingSnapshot: boolean,
  snapshotAge?:  number,
  triggered?:    boolean,
  reachMain?:    string,
  reachTime?:    string,
  reachStatus?:  ActionsStatus,
): SummaryItem[] {
  const items: SummaryItem[] = [];

  const actionsDot: Dot =
    actionsStatus === "healthy" ? "🟢" :
    actionsStatus === "delayed" ? "🟡" : "🔴";

  const actionsTimeLabel = triggered ? "▶ 자동 재실행 중" : actionsTime;
  items.push({ dot: actionsDot, main: actionsMain, time: actionsTimeLabel });

  // 시트 연동 — Sheets 동기화 + Pipeline Health 병합 결과
  const sheetsDot: Dot =
    sheetsStatus === "healthy"               ? "🟢" :
    sheetsStatus === "degraded" || sheetsStatus === "warn" ? "🟡" : "🔴";
  items.push({ dot: sheetsDot, main: sheetsMain, time: sheetsTime });

  // CTR/Impressions 동기화 상태 (reach-data-sync.yml)
  if (reachStatus && reachMain) {
    const dot: Dot =
      reachStatus === "healthy" ? "🟢" :
      reachStatus === "delayed" ? "🟡" : "🔴";
    items.push({ dot, main: reachMain, time: reachTime ?? "" });
  }

  // 스냅샷 — Sheets 실패 + 스냅샷 사용 시에만 표시
  if (usingSnapshot && snapshotAge !== undefined) {
    const dot: Dot = snapshotAge > 360 ? "🔴" : "🟡";
    const snapshotTime =
      snapshotAge < 60
        ? `${snapshotAge}분 전`
        : `${Math.round(snapshotAge / 60)}시간 전`;
    items.push({ dot, main: "이전 데이터 표시 중", time: snapshotTime });
  }

  return items;
}

// ─── UpdateStatusBar ──────────────────────────────────────────────────────────

interface UpdateStatusBarProps {
  syncError:   string | null;
  lastSyncAt?: string | null;
}

const PIPELINE_HEALTH_CACHE_MS = 10 * 60_000;  // 10분 캐시

export default function UpdateStatusBar({ syncError, lastSyncAt = null }: UpdateStatusBarProps) {
  const [runs,           setRuns]           = useState<ActionsRun[] | null>(null);
  const [reachRuns,      setReachRuns]      = useState<ActionsRun[] | null>(null);
  const [triggered,      setTriggered]      = useState(false);
  const [healthRows,     setHealthRows]     = useState<Record<string, string>[] | null>(null);
  const [dispatchLog,    setDispatchLog]    = useState<DispatchLog | null>(null);
  const healthLastFetch  = useRef<number>(0);

  const lastFetchRef       = useRef<number>(0);
  const forceFetchRef      = useRef<boolean>(false);
  const lastDispatchAtRef  = useRef<number>(0);   // 마지막 dispatch 시도 시각 (ms)
  const dispatchRetryCount = useRef<number>(0);   // 연속 실패 횟수 (exponential backoff)
  const dispatchTotalRef   = useRef<number>(0);   // 전체 dispatch 횟수 (success rate 분모)
  const dispatchSuccessRef = useRef<number>(0);   // 성공 횟수 (success rate 분자)

  // ── fetch ────────────────────────────────────────────────────────────────────

  const doFetch = useCallback(async () => {
    const now = Date.now();
    if (!forceFetchRef.current && now - lastFetchRef.current < ACTIONS_CACHE_MS) return;
    forceFetchRef.current = false;
    lastFetchRef.current  = now;

    try {
      const data = await fetchWithRetry(async () => {
        const res = await fetch(
          `https://api.github.com/repos/${ACTIONS_REPO}/actions/runs?per_page=5`,
          { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }, 3, 1_000);
      setRuns(data.workflow_runs ?? []);
    } catch {
      setRuns([]);
    }
  }, []);

  // reach-data-sync.yml 별도 fetch (3분 캐시)
  const doFetchReach = useCallback(async () => {
    try {
      const data = await fetchWithRetry(async () => {
        const res = await fetch(
          `https://api.github.com/repos/${ACTIONS_REPO}/actions/workflows/${REACH_WORKFLOW}/runs?per_page=5`,
          { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }, 3, 1_000);
      setReachRuns(data.workflow_runs ?? []);
    } catch {
      setReachRuns([]);
    }
  }, []);

  // 3분 폴링
  useEffect(() => {
    doFetch();
    doFetchReach();
    const id1 = setInterval(doFetch,      ACTIONS_CACHE_MS);
    const id2 = setInterval(doFetchReach, ACTIONS_CACHE_MS);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [doFetch, doFetchReach]);

  // 30초 후에도 null이면 빈 배열로 폴백
  useEffect(() => {
    if (runs !== null) return;
    const t = setTimeout(() => setRuns(prev => prev === null ? [] : prev), 30_000);
    return () => clearTimeout(t);
  }, [runs]);

  // ── _Pipeline_Health 탭 fetch (10분 캐시) ────────────────────────────────────
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) return;

    const load = async () => {
      const now = Date.now();
      if (now - healthLastFetch.current < PIPELINE_HEALTH_CACHE_MS) return;
      healthLastFetch.current = now;
      try {
        const result = await api.fetchSheetVideos(["_Pipeline_Health"]) as Record<string, Record<string, string>[]>;
        setHealthRows(result["_Pipeline_Health"] ?? []);
      } catch {
        // 실패 시 null 유지 — 표시 안 함
      }
    };

    load();
    const id = setInterval(load, PIPELINE_HEALTH_CACHE_MS);
    return () => clearInterval(id);
  }, []);

  // ── 자동 트리거 ─────────────────────────────────────────────────────────────
  // shouldDispatch() 판단 결과에 따라 dispatch / 스킵

  useEffect(() => {
    if (!runs || !runs.length) return;

    const now      = Date.now();
    const decision = shouldDispatch({
      runs,
      now,
      lastDispatchAt: lastDispatchAtRef.current,
      retryCount:     dispatchRetryCount.current,
    });

    // RUNNING 정상 진행 중 → retryCount 리셋 (backoff 해소)
    if (decision === "running") {
      dispatchRetryCount.current = 0;
      return;
    }
    if (decision !== "dispatch") return;

    lastDispatchAtRef.current = now;
    dispatchTotalRef.current += 1;
    const backoffMin = Math.min(45 * Math.pow(2, dispatchRetryCount.current), 180);
    const logEntry: DispatchLog = { at: new Date(now), status: "PENDING", reason: "stale_execution" };

    console.log("[DISPATCH]", {
      triggeredAt:   logEntry.at.toISOString(),
      reason:        logEntry.reason,
      source:        "dispatch",
      retry:         dispatchRetryCount.current,
      backoffMin,
      dispatchTotal: dispatchTotalRef.current,
    });
    setDispatchLog({ ...logEntry });

    triggerWorkflow()
      .then(() => {
        dispatchRetryCount.current  = 0;
        dispatchSuccessRef.current += 1;
        const rate      = Math.round(dispatchSuccessRef.current / dispatchTotalRef.current * 100);
        const successLog: DispatchLog = { ...logEntry, status: "SUCCESS" };
        console.log("[DISPATCH] SUCCESS", {
          at:          successLog.at.toISOString(),
          successRate: `${rate}% (${dispatchSuccessRef.current}/${dispatchTotalRef.current})`,
        });
        setDispatchLog(successLog);
        setTriggered(true);
        setTimeout(() => { forceFetchRef.current = true; doFetch(); }, 10_000);
        setTimeout(() => setTriggered(false), 15_000);
      })
      .catch(err => {
        dispatchRetryCount.current += 1;
        const rate    = Math.round(dispatchSuccessRef.current / dispatchTotalRef.current * 100);
        const failLog: DispatchLog = { ...logEntry, status: "FAILED" };
        console.warn("[DISPATCH] FAILED", {
          at:          failLog.at.toISOString(),
          source:      "dispatch",
          retry:       dispatchRetryCount.current,
          successRate: `${rate}% (${dispatchSuccessRef.current}/${dispatchTotalRef.current})`,
          err:         String(err),
        });
        setDispatchLog(failLog);
        // FAILED 알림 — 사용자가 상태바를 못 보고 지나칠 수 있으므로 toast
        toast.error("자동화 dispatch 실패 — 재시도 중", {
          description: `retry #${dispatchRetryCount.current} · 다음 시도: ${backoffMin * Math.pow(2, dispatchRetryCount.current - 1)}분 후`,
          duration:    8_000,
        });
      });
  }, [runs, doFetch]);

  // ── 상태 계산 ────────────────────────────────────────────────────────────────

  const { status: actionsStatus, main: actionsMain, time: actionsTime } =
    calcActionsStatus(runs);

  const { status: sheetsStatus, main: sheetsMain, time: sheetsTime, usingSnapshot, snapshotAge } =
    calcSheetsAndPipelineStatus(syncError, lastSyncAt, healthRows);

  const { status: reachStatus, main: reachMain, time: reachTime } =
    calcReachStatus(reachRuns);

  const items = buildSummary(
    actionsMain,   actionsTime,   actionsStatus,
    sheetsMain,    sheetsTime,    sheetsStatus,
    usingSnapshot, snapshotAge,
    triggered,
    reachMain,     reachTime,     reachStatus,
  );

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.sm,
      flexWrap:   "wrap",
    }}>
      {items.map((item, i) => {
        const textColor =
          item.dot === "🟢" ? T.success :
          item.dot === "🟡" ? T.warn    : T.danger;

        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {i > 0 && (
              <span style={{ color: T.muted, fontSize: T.font.size.xxs, margin: "0 2px" }}>·</span>
            )}
            <span style={{ fontSize: T.font.size.xs, lineHeight: 1 }}>{item.dot}</span>
            <span style={{
              fontSize:   T.font.size.xs,
              fontFamily: T.font.familyMono,
              color:      textColor,
              fontWeight: T.font.weight.medium,
            }}>
              {item.main}
            </span>
            {item.time && (
              <>
                <span style={{ color: T.muted, fontSize: T.font.size.xxs }}>·</span>
                <span style={{
                  fontSize:   T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  color:      item.dot === "🟡" || item.dot === "🔴" ? textColor : T.muted,
                }}>
                  {item.time}
                </span>
              </>
            )}
          </span>
        );
      })}

      {/* ── Dispatch 로그 — 마지막 dispatch 시각 + 결과 + success rate ── */}
      {dispatchLog && (
        <>
          <span style={{ color: T.muted, fontSize: T.font.size.xxs, margin: "0 2px" }}>·</span>
          <span style={{
            display:    "flex",
            alignItems: "center",
            gap:        3,
            fontSize:   T.font.size.xxs,
            fontFamily: T.font.familyMono,
            color:      T.muted,
          }}>
            <span>Dispatch</span>
            <span style={{ color: T.text }}>
              {dispatchLog.at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{
              color:
                dispatchLog.status === "SUCCESS" ? T.success :
                dispatchLog.status === "FAILED"  ? T.danger : T.warn,
              fontWeight: T.font.weight.semibold,
            }}>
              {dispatchLog.status}
            </span>
            {dispatchTotalRef.current > 0 && (
              <span style={{ color: T.muted }}>
                {Math.round(dispatchSuccessRef.current / dispatchTotalRef.current * 100)}%
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}
