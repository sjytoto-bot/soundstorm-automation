// ─── DataHealthBar v3 ─────────────────────────────────────────────────────────
// ExecutionPanel 상단 — 데이터 신뢰도 3-row 상태 바
//
// v3 추가: 3단 자동 복구 시스템
//   1️⃣ fetchWithRetry — 지수 백오프 최대 3회 재시도 (1s, 2s, 4s)
//   2️⃣ 타임라인 재시도 — 5s, 15s 자동 재요청 (로딩 지속 시)
//   3️⃣ GitHub Actions 자동 트리거 — 마지막 실행 > 40분이면 자동 dispatch
//
// 임계값:
//   Sheets  : syncError null=🟢 / STALE <30m=🟡최신 / <6h=🟡지연 / 6h+=🔴 / SYNC_FAILED=🔴
//   Actions : <30min=🟢 / 30-90min=🟡 / >90min=🔴 / 5연속실패=🔴
//   Snapshot: syncError null=🟢 / STALE=🟡/🔴 / SYNC_FAILED=🔴

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { T } from "../../styles/tokens";

const ACTIONS_REPO     = "sjytoto-bot/soundstorm-automation";
const WORKFLOW_FILE    = "youtube-data-sync.yml";
const ACTIONS_CACHE_MS = 3 * 60_000;   // 3분 캐시
const AUTO_TRIGGER_MIN = 40;           // 40분 이상 미실행 시 자동 dispatch

// ─── 시간 포맷 ────────────────────────────────────────────────────────────────

function timeAgo(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return "";
  const ms = Date.now() - new Date(isoOrDate).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1)  return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  if (h < 24)   return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function toHHMM(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return "–";
  const d = new Date(isoOrDate);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type DotColor = "🟢" | "🟡" | "🔴";

interface RowStatus {
  dot:  DotColor;
  main: string;
  time: string;
}

interface ActionsRun {
  id:         number;
  updated_at: string;
  conclusion: string | null;
  status:     string;
  name:       string;
}

// ─── fetchWithRetry ───────────────────────────────────────────────────────────

async function fetchWithRetry<T>(
  fn:      () => Promise<T>,
  retries: number = 3,
  delay:   number = 1_000,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
}

// ─── GitHub Actions 자동 트리거 ───────────────────────────────────────────────

async function triggerWorkflow(): Promise<void> {
  // PAT 우선순위: Electron IPC → Vite env
  const api = (window as any).api;
  const pat: string | undefined =
    (await api?.getGithubPat?.()) ??
    (import.meta as any).env?.VITE_GITHUB_PAT;

  if (!pat) {
    console.warn("[DataHealthBar] GitHub PAT 없음 — workflow dispatch 스킵");
    return;
  }

  const res = await fetch(
    `https://api.github.com/repos/${ACTIONS_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method:  "POST",
      headers: {
        Accept:        "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (res.ok || res.status === 204) {
    console.log("[DataHealthBar] ✅ workflow dispatch 성공");
  } else {
    console.warn("[DataHealthBar] workflow dispatch 실패:", res.status);
  }
}

// ─── Actions 상태 계산 ────────────────────────────────────────────────────────

function parseActionsStatus(runs: ActionsRun[]): RowStatus {
  if (!runs?.length) return { dot: "🔴", main: "데이터 없음", time: "" };

  const failCount = runs.slice(0, 5).filter(r => r.conclusion === "failure").length;
  if (failCount >= 5) return { dot: "🔴", main: "연속 실패", time: `${failCount}회` };

  const latest    = runs[0];
  const isRunning = latest.status === "in_progress" || latest.status === "queued";

  if (isRunning) {
    return { dot: "🟢", main: "실행 중", time: timeAgo(latest.updated_at) };
  }

  const msAgo      = Date.now() - new Date(latest.updated_at).getTime();
  const minutesAgo = Math.round(msAgo / 60_000);
  const t          = timeAgo(latest.updated_at);

  if (latest.conclusion === "failure") {
    return { dot: "🔴", main: "실패", time: t };
  }

  if (minutesAgo < 30)  return { dot: "🟢", main: "정상", time: `${t} 실행` };
  if (minutesAgo < 90)  return { dot: "🟡", main: "지연", time: `${minutesAgo}분 미실행` };
  const hoursAgo = Math.round(minutesAgo / 60);
  return { dot: "🔴", main: "지연", time: `${hoursAgo}시간 미실행` };
}

// ─── Sheets / Snapshot 상태 계산 ─────────────────────────────────────────────

function parseSheetsRowStatus(
  syncError:  string | null,
  lastSyncAt: string | null,
): RowStatus {
  if (!syncError) {
    return { dot: "🟢", main: "정상", time: lastSyncAt ? timeAgo(lastSyncAt) : "" };
  }
  if (syncError === "SYNC_FAILED") {
    return { dot: "🔴", main: "연결 실패", time: "" };
  }
  if (syncError.startsWith("STALE_SNAPSHOT:")) {
    const savedAt    = syncError.replace("STALE_SNAPSHOT:", "");
    const msAgo      = Date.now() - new Date(savedAt).getTime();
    const minutesAgo = Math.round(msAgo / 60_000);
    const t          = timeAgo(savedAt);
    if (minutesAgo < 30)  return { dot: "🟡", main: "스냅샷 (최신)", time: t };
    if (minutesAgo < 360) return { dot: "🟡", main: "스냅샷 (지연)", time: t };
    return { dot: "🔴", main: "데이터 오래됨", time: t };
  }
  return { dot: "🟡", main: "확인 필요", time: "" };
}

function parseSnapshotRowStatus(syncError: string | null): RowStatus {
  if (!syncError) {
    return { dot: "🟢", main: "최신", time: "" };
  }
  if (syncError === "SYNC_FAILED") {
    return { dot: "🔴", main: "없음", time: "" };
  }
  if (syncError.startsWith("STALE_SNAPSHOT:")) {
    const savedAt = syncError.replace("STALE_SNAPSHOT:", "");
    const t       = timeAgo(savedAt);
    const msAgo   = Date.now() - new Date(savedAt).getTime();
    const h       = msAgo / 3_600_000;
    const dot: DotColor = h > 24 ? "🔴" : h > 6 ? "🟡" : "🟢";
    return { dot, main: "스냅샷", time: t };
  }
  return { dot: "🟡", main: "알 수 없음", time: "" };
}

// ─── HealthRow ────────────────────────────────────────────────────────────────

function HealthRow({ label, status }: { label: string; status: RowStatus }) {
  const textColor =
    status.dot === "🟢" ? T.success :
    status.dot === "🟡" ? T.warn    : "#B91C1C";

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.sm,
      fontSize:   T.font.size.xs,
      fontFamily: T.font.familyMono,
    }}>
      <span style={{ width: 88, flexShrink: 0, color: T.sub }}>{label}</span>
      <span style={{ fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{status.dot}</span>
      <span style={{ color: textColor, fontWeight: T.font.weight.medium }}>{status.main}</span>
      {status.time && (
        <>
          <span style={{ color: T.muted, fontSize: 10 }}>·</span>
          <span style={{ color: T.muted, fontSize: 10 }}>{status.time}</span>
        </>
      )}
    </div>
  );
}

// ─── RunLogRow ────────────────────────────────────────────────────────────────

function RunLogRow({ run }: { run: ActionsRun }) {
  const isSuccess   = run.conclusion === "success";
  const isFailure   = run.conclusion === "failure";
  const isRunning   = run.status === "in_progress" || run.status === "queued";
  const isCancelled = run.conclusion === "cancelled";

  const icon  = isRunning ? "⟳" : isSuccess ? "✅" : isFailure ? "❌" : isCancelled ? "⏹" : "–";
  const label = isRunning ? "실행 중" : isSuccess ? "성공" : isFailure ? "실패" : isCancelled ? "취소" : run.conclusion ?? "–";

  const labelColor = isSuccess ? T.success : isFailure ? "#B91C1C" : isRunning ? T.primary : T.muted;

  let hint = "";
  if (isFailure) {
    const n = (run.name ?? "").toLowerCase();
    if (n.includes("oauth") || n.includes("token") || n.includes("auth")) hint = "OAuth";
    else if (n.includes("timeout")) hint = "Timeout";
    else if (n.includes("rate"))    hint = "Rate limit";
  }

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.sm,
      fontSize:   10,
      fontFamily: T.font.familyMono,
      padding:    `2px 0`,
    }}>
      <span style={{ width: 36, flexShrink: 0, color: T.muted }}>{toHHMM(run.updated_at)}</span>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{ color: labelColor }}>{label}</span>
      {hint && (
        <span style={{
          color:        "#92400E",
          background:   T.warnBg,
          borderRadius: T.radius.badge,
          padding:      `0 ${T.spacing.xs}px`,
          fontSize:     9,
        }}>
          {hint}
        </span>
      )}
    </div>
  );
}

// ─── DataHealthBar ────────────────────────────────────────────────────────────

interface DataHealthBarProps {
  syncError:   string | null;
  lastSyncAt?: string | null;
}

export default function DataHealthBar({ syncError, lastSyncAt = null }: DataHealthBarProps) {
  const [runs,         setRuns]         = useState<ActionsRun[] | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<"확인 중..." | "지연 중...">("확인 중...");
  const [expanded,     setExpanded]     = useState(false);
  const [triggered,    setTriggered]    = useState(false);   // 자동 트리거 표시용

  const lastFetchRef       = useRef<number>(0);
  const forceFetchRef      = useRef<boolean>(false);         // 캐시 무시 강제 재시도
  const workflowFiredRef   = useRef<boolean>(false);         // 세션당 1회만 dispatch

  // ── 핵심 fetch 함수 ────────────────────────────────────────────────────────

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
    } catch (err) {
      console.warn("[DataHealthBar] Actions fetch 최종 실패:", err);
      setRuns([]);
    }
  }, []);

  // ── 1️⃣ 초기 로드 + 3분 폴링 ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchActions() {
      if (cancelled) return;
      await doFetch();
    }

    fetchActions();
    const id = setInterval(fetchActions, ACTIONS_CACHE_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [doFetch]);

  // ── 2️⃣ 타임라인 재시도 — runs가 null이면 5s, 15s에 강제 재요청 ────────────

  useEffect(() => {
    if (runs !== null) return;

    // 5초 후 재시도 1
    const t1 = setTimeout(() => {
      forceFetchRef.current = true;
      doFetch();
    }, 5_000);

    // 15초 후 재시도 2
    const t2 = setTimeout(() => {
      forceFetchRef.current = true;
      doFetch();
    }, 15_000);

    // 30초 후에도 null이면 빈 배열(스냅샷 폴백)
    const t3 = setTimeout(() => {
      setRuns(prev => prev === null ? [] : prev);
    }, 30_000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [runs, doFetch]);

  // ── 로딩 레이블: 3초 후 "지연 중..." ─────────────────────────────────────

  useEffect(() => {
    if (runs !== null) return;
    setLoadingLabel("확인 중...");
    const id = setTimeout(() => setLoadingLabel("지연 중..."), 3_000);
    return () => clearTimeout(id);
  }, [runs]);

  // ── 3️⃣ GitHub Actions 자동 트리거 — 마지막 실행 > 40분이면 dispatch ──────

  useEffect(() => {
    if (!runs || runs.length === 0) return;
    if (workflowFiredRef.current) return;

    const latest    = runs[0];
    const isRunning = latest.status === "in_progress" || latest.status === "queued";
    if (isRunning) return;

    const minutesAgo = Math.round((Date.now() - new Date(latest.updated_at).getTime()) / 60_000);
    if (minutesAgo < AUTO_TRIGGER_MIN) return;

    workflowFiredRef.current = true;
    console.log(`[DataHealthBar] 마지막 실행 ${minutesAgo}분 전 → workflow 자동 dispatch`);

    triggerWorkflow()
      .then(() => {
        setTriggered(true);
        // 10초 후 재조회
        setTimeout(() => {
          forceFetchRef.current = true;
          doFetch();
        }, 10_000);
      })
      .catch(err => {
        console.warn("[DataHealthBar] 자동 dispatch 실패:", err);
        workflowFiredRef.current = false;  // 실패 시 재시도 허용
      });
  }, [runs, doFetch]);

  // ── 상태 계산 ─────────────────────────────────────────────────────────────

  const sheetsStatus   = parseSheetsRowStatus(syncError, lastSyncAt);
  const snapshotStatus = parseSnapshotRowStatus(syncError);
  const actionsStatus: RowStatus =
    runs === null
      ? { dot: "🟡", main: loadingLabel, time: "" }
      : runs.length === 0
        ? { dot: "🔴", main: "연결 실패", time: "" }
        : parseActionsStatus(runs);

  return (
    <div style={{
      background:   T.bgSection,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.btn,
      overflow:     "hidden",
    }}>

      {/* ── 헤더 + 3-row ── */}
      <div style={{
        padding:       `${T.spacing.sm}px ${T.spacing.lg}px`,
        display:       "flex",
        flexDirection: "column",
        gap:           T.spacing.xs,
      }}>
        <button
          onClick={() => setExpanded(p => !p)}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            width:          "100%",
            background:     "none",
            border:         "none",
            padding:        0,
            cursor:         "pointer",
            marginBottom:   2,
          }}
        >
          <span style={{
            fontSize:      T.font.size.xs,
            fontWeight:    T.font.weight.semibold,
            color:         T.muted,
            fontFamily:    T.font.familyMono,
            letterSpacing: "0.06em",
          }}>
            데이터 상태
            {triggered && (
              <span style={{ marginLeft: 6, color: T.warn, fontSize: 9 }}>▶ 자동 재실행</span>
            )}
          </span>
          {expanded
            ? <ChevronUp   size={12} color={T.muted} />
            : <ChevronDown size={12} color={T.muted} />}
        </button>

        <HealthRow label="Sheets Sync" status={sheetsStatus}   />
        <HealthRow label="Actions"     status={actionsStatus}  />
        <HealthRow label="Snapshot"    status={snapshotStatus} />
      </div>

      {/* ── 확장: Actions 실행 로그 ── */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding:   `${T.spacing.sm}px ${T.spacing.lg}px`,
        }}>
          <div style={{
            fontSize:      10,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.semibold,
            color:         T.sub,
            letterSpacing: "0.06em",
            marginBottom:  T.spacing.xs,
          }}>
            최근 Actions 실행
          </div>

          {runs === null && (
            <span style={{ fontSize: 10, fontFamily: T.font.familyMono, color: T.muted }}>
              로딩 중…
            </span>
          )}
          {runs !== null && runs.length === 0 && (
            <span style={{ fontSize: 10, fontFamily: T.font.familyMono, color: "#B91C1C" }}>
              GitHub API 연결 실패
            </span>
          )}
          {runs && runs.length > 0 && runs.map(run => (
            <RunLogRow key={run.id} run={run} />
          ))}

          {triggered && (
            <div style={{
              marginTop:  T.spacing.xs,
              fontSize:   9,
              fontFamily: T.font.familyMono,
              color:      T.warn,
            }}>
              ▶ workflow 자동 dispatch 완료 — 10초 후 갱신
            </div>
          )}
        </div>
      )}
    </div>
  );
}
