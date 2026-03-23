const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path   = require("path");
const fs     = require("fs");
const http   = require("http");
const { spawn }      = require("child_process");
const { randomUUID } = require("crypto");
const { getAnalyticsData, isAuthenticated, clearTokens, getRecentUploads } = require("./services/youtubeAnalyticsService");
const { getSheetVideos, isSheetsAuthenticated, clearSheetsTokens } = require("./services/googleSheetService");
// 패키지 모드: .app 번들과 같은 폴더의 logs/ (Google Drive 프로젝트 폴더 유지)
// 개발 모드: 프로젝트 루트의 logs/
const logsDir = app.isPackaged
  ? path.join(
      path.dirname(app.getPath("exe").replace(/\.app\/.*$/, ".app")),
      "logs"
    )
  : path.join(app.getAppPath(), "logs");

const stateFile        = path.join(logsDir, "state.json");
const changelogFile    = path.join(logsDir, "changelog.json");
const queueFile        = path.join(logsDir, "proposal_queue.json");
const contentPacksFile = path.join(logsDir, "content_packs.json"); // STAGE 4

const configDir = app.isPackaged
  ? path.join(
      path.dirname(app.getPath("exe").replace(/\.app\/.*$/, ".app")),
      "config"
    )
  : path.join(app.getAppPath(), "config");

const modeConfigFile = path.join(configDir, "mode_config.json");

const INITIAL_STATE = {
  version: 1,
  last_updated: "",
  official: { policies: {}, pricing: {}, products: {}, operations: {} },
  roadmap: {
    current_phase: "1단계 시스템 안정화",
    active_track:  "OS구축",
    tracks: {
      "OS구축":     { label: "OS 구축",     progress: 0 },
      "스토어자동화": { label: "스토어 자동화", progress: 0 },
      "콘텐츠확장":  { label: "콘텐츠 확장",  progress: 0 },
      "기타":       { label: "기타",        progress: 0 },
    },
    progress: 0,
  },
  tasks: [],
  goals: {},
  teams: {},
  history: [],
};

function ensureFiles() {
  if (!fs.existsSync(logsDir))   fs.mkdirSync(logsDir,   { recursive: true });
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(stateFile))
    fs.writeFileSync(stateFile, JSON.stringify(INITIAL_STATE, null, 2), "utf8");
  if (!fs.existsSync(changelogFile))
    fs.writeFileSync(changelogFile, JSON.stringify([]), "utf8");
  if (!fs.existsSync(queueFile))
    fs.writeFileSync(queueFile, JSON.stringify({ version: 1, proposals: [] }, null, 2), "utf8");
  if (!fs.existsSync(modeConfigFile))
    fs.writeFileSync(modeConfigFile, JSON.stringify({ mode: "supervised" }, null, 2), "utf8");
  if (!fs.existsSync(contentPacksFile))
    fs.writeFileSync(contentPacksFile, JSON.stringify([], null, 2), "utf8");
}

// ── state helpers ─────────────────────────────────────────────────────────────

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); }
  catch { return JSON.parse(JSON.stringify(INITIAL_STATE)); }
}

function writeState(state) {
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

function calcTrackProgress(state) {
  const tasks  = state.tasks ?? [];
  const tracks = state.roadmap?.tracks ?? {};
  for (const id of Object.keys(tracks)) {
    const tt = tasks.filter(t => t.track === id);
    tracks[id].progress = tt.length === 0
      ? 0
      : Math.round(tt.filter(t => t.status === "done").length / tt.length * 100);
  }
  const done = tasks.filter(t => t.status === "done").length;
  state.roadmap.progress = tasks.length === 0 ? 0 : Math.round(done / tasks.length * 100);
  return state;
}

// ── video snapshot (IPC fallback — localStorage 보완) ─────────────────────────
// Primary: Google Sheets fetch
// Fallback: IPC file snapshot (localStorage 초기화 시에도 생존)

const videoSnapshotFile = path.join(logsDir, "video_snapshot.json");

ipcMain.handle("save-video-snapshot", (_, payload) => {
  // payload: { savedAt: string, videos: RawVideoRow[] }
  try {
    fs.writeFileSync(videoSnapshotFile, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("load-video-snapshot", () => {
  try {
    if (!fs.existsSync(videoSnapshotFile)) return null;
    const raw = fs.readFileSync(videoSnapshotFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

// ── content packs (STAGE 4) ───────────────────────────────────────────────────

ipcMain.handle("load-content-packs", () => {
  try { return JSON.parse(fs.readFileSync(contentPacksFile, "utf8")); }
  catch { return []; }
});

ipcMain.handle("save-content-packs", (_, packs) => {
  try {
    fs.writeFileSync(contentPacksFile, JSON.stringify(packs, null, 2), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("load-official-state", () => readState());

ipcMain.handle("set-roadmap-meta", (_, field, value) => {
  const state  = readState();
  const before = state.roadmap[field];
  state.roadmap[field] = value;
  writeState(state);

  let current = [];
  try { current = JSON.parse(fs.readFileSync(changelogFile, "utf8")); } catch {}
  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix  = `EVT_${dateStr}_`;
  const seq     = String(current.filter(e => typeof e.id === "string" && e.id.startsWith(prefix)).length + 1).padStart(3, "0");
  current.push({
    id:          `EVT_${dateStr}_${seq}`,
    type:        "event",
    event_type:  "roadmap_meta_changed",
    field,
    before,
    after:       value,
    decided_at:  now.toISOString(),
  });
  fs.writeFileSync(changelogFile, JSON.stringify(current, null, 2), "utf8");
});

// ── tasks ─────────────────────────────────────────────────────────────────────

ipcMain.handle("load-tasks", () => readState().tasks ?? []);

ipcMain.handle("add-task", (_, task) => {
  const state = readState();
  // 중복 방지: 동일 id 존재 시 skip
  if (task.id && (state.tasks ?? []).some(t => t.id === task.id)) {
    return { skipped: true, id: task.id };
  }
  const newTask = {
    context_log: [],          // default — caller spread can override
    ...task,
    id:         task.id ?? randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.tasks = [...(state.tasks ?? []), newTask];
  writeState(calcTrackProgress(state));
  return newTask;
});

ipcMain.handle("update-task", (_, id, updates) => {
  const state = readState();
  const idx   = (state.tasks ?? []).findIndex(t => t.id === id);
  if (idx === -1) throw new Error(`task not found: ${id}`);
  state.tasks[idx] = { ...state.tasks[idx], ...updates, id, updated_at: new Date().toISOString() };
  writeState(calcTrackProgress(state));
  return state.tasks[idx];
});

ipcMain.handle("delete-task", (_, id) => {
  const state = readState();
  state.tasks = (state.tasks ?? []).filter(t => t.id !== id);
  writeState(calcTrackProgress(state));
});

// ── action tracking ────────────────────────────────────────────────────────────

const automationDir = app.isPackaged
  ? path.join(path.dirname(app.getPath("exe").replace(/\.app\/.*$/, ".app")), "..", "..", "07_AUTOMATION_자동화")
  : path.join(app.getAppPath(), "..", "..", "07_AUTOMATION_자동화");
const actionTrackingFile  = path.join(automationDir, "03_RUNTIME", "action_tracking.json");
const actionStartLogFile  = path.join(automationDir, "03_RUNTIME", "action_start_log.json");
const actionSkipLogFile   = path.join(automationDir, "03_RUNTIME", "action_skip_log.json");
const actionViewedLogFile = path.join(automationDir, "03_RUNTIME", "action_viewed_log.json");
const activeUploadsFile   = path.join(automationDir, "03_RUNTIME", "active_uploads.json");

// race condition 방지: tmp → rename 패턴
function safeWriteJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

// problem_type별 판정 대기일
const CHECK_AFTER_DAYS = {
  IMPRESSION_DROP: 3,
  CTR_WEAK:        2,
  EXTERNAL_DROP:   1,
};

// alert_history.json 경로
const alertHistoryFile = path.join(automationDir, "03_RUNTIME", "alert_history.json");

ipcMain.handle("load-alert-history", (_, videoId) => {
  try {
    if (!fs.existsSync(alertHistoryFile)) return null;
    const history = JSON.parse(fs.readFileSync(alertHistoryFile, "utf8"));
    const entries = Object.values(history).filter(e => e.video_id === videoId);
    if (entries.length === 0) return null;
    // 가장 최근 항목 반환
    return entries.sort((a, b) =>
      new Date(b.timestamp ?? 0) - new Date(a.timestamp ?? 0)
    )[0];
  } catch { return null; }
});

ipcMain.handle("load-action-tracking", (_, videoId) => {
  try {
    if (!fs.existsSync(actionTrackingFile)) return [];
    const tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));
    return Object.values(tracking).filter(e => e.video_id === videoId);
  } catch { return []; }
});

ipcMain.handle("load-action-results", () => {
  try {
    if (!fs.existsSync(actionTrackingFile)) return [];
    const tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return Object.values(tracking).filter(e =>
      e.status !== "ONGOING" &&
      e.result &&
      new Date(e.result) >= sevenDaysAgo
    );
  } catch (err) {
    console.error("load-action-results failed:", err);
    return [];
  }
});

// action_type별 가중 성공률 집계 (P2-B: ActionItems 동적 successRate 갱신용)
//
// 보강 1 — 시간 감쇠: weight = exp(-daysSinceResult / 14)  최신 데이터 우선
// 보강 2 — confidence 가중: HIGH=1.0 / MEDIUM=0.6 / LOW=0.2
// 보강 3 — 복합 키: action_type + action_label → IMPRESSION_DROP_THUMBNAIL 등
//
// 반환: { [key]: { success, total, rate } }
//   key = "${action_type}_${action_label}" (action_label 없으면 "${action_type}")
ipcMain.handle("load-action-type-rates", () => {
  try {
    if (!fs.existsSync(actionTrackingFile)) return {};
    const tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));

    const CONF_WEIGHT = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.2 };
    const DECAY_DAYS  = 14;   // 반감기 14일
    const now         = Date.now();

    const rateMap = {};

    for (const entry of Object.values(tracking)) {
      if (entry.status === "ONGOING") continue;

      const actionType  = entry.action_type;
      const actionLabel = entry.action_label;          // 보강 3: 세부 액션 레이블
      if (!actionType) continue;

      // 보강 3: 복합 키
      const key = actionLabel ? `${actionType}_${actionLabel}` : actionType;

      // 보강 1: 시간 감쇠 (result 날짜 기준)
      const dateStr   = entry.result || entry.action_date;
      const daysAgo   = dateStr
        ? (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
        : 90;
      const timeW     = Math.exp(-daysAgo / DECAY_DAYS);

      // 보강 2: confidence 가중
      const confW     = CONF_WEIGHT[entry.confidence] ?? 0.5;

      const combined  = timeW * confW;

      if (!rateMap[key]) rateMap[key] = { wSuccess: 0, wTotal: 0, success: 0, total: 0 };
      rateMap[key].wTotal  += combined;
      rateMap[key].total   += 1;
      if (entry.status === "SUCCESS") {
        rateMap[key].wSuccess += combined;
        rateMap[key].success  += 1;
      }
    }

    // 가중 rate 계산 + 내부 집계 필드 정리
    const result = {};
    for (const [key, { wSuccess, wTotal, success, total }] of Object.entries(rateMap)) {
      result[key] = {
        success,
        total,
        rate:       wTotal > 0 ? wSuccess / wTotal : 0,
        skip_count: 0,
        view_count: 0,
        skip_rate:  0,
      };
    }

    // ── skip 집계 (action_skip_log.json) ───────────────────────────────────────
    // skip_rate = skip_count / view_count → user_preference 패널티 계산에 사용
    const skipCountMap = {};  // { ACTION_TYPE: count }
    try {
      if (fs.existsSync(actionSkipLogFile)) {
        const skipLog = JSON.parse(fs.readFileSync(actionSkipLogFile, "utf8"));
        for (const entry of skipLog) {
          const k = (entry.action_type ?? "UNKNOWN").toUpperCase();
          skipCountMap[k] = (skipCountMap[k] ?? 0) + 1;
        }
      }
    } catch {}

    // ── viewed 집계 (action_viewed_log.json) ──────────────────────────────────
    const viewedCountMap = {};  // { actionId: count }
    try {
      if (fs.existsSync(actionViewedLogFile)) {
        const viewedLog = JSON.parse(fs.readFileSync(actionViewedLogFile, "utf8"));
        for (const entry of viewedLog) {
          const k = (entry.action_id ?? "unknown");
          viewedCountMap[k] = (viewedCountMap[k] ?? 0) + 1;
        }
      }
    } catch {}

    // ── skip_rate / view_count 를 각 key에 병합 ───────────────────────────────
    for (const key of Object.keys(result)) {
      const baseType = key.split("_")[0];  // "RETENTION_WEAK_THUMBNAIL" → "RETENTION"
      const skipCount = skipCountMap[key] ?? skipCountMap[baseType] ?? 0;
      const viewCount = viewedCountMap[key] ?? viewedCountMap[key.toLowerCase()] ?? 0;
      result[key].skip_count = skipCount;
      result[key].view_count = viewCount;
      result[key].skip_rate  = viewCount > 0 ? Math.min(1, skipCount / viewCount) : 0;
    }

    // ── skip/viewed 전용 타입 (action_tracking에 없는 것) 추가 ─────────────────
    for (const [k, cnt] of Object.entries(skipCountMap)) {
      if (!result[k]) {
        result[k] = { success: 0, total: 0, rate: 0.5,
          skip_count: cnt, view_count: viewedCountMap[k] ?? 0, skip_rate: 0 };
      }
    }
    for (const [k, cnt] of Object.entries(viewedCountMap)) {
      const normK = k.toUpperCase();
      if (!result[normK] && !result[k]) {
        result[k] = { success: 0, total: 0, rate: 0.5,
          skip_count: skipCountMap[normK] ?? 0, view_count: cnt, skip_rate: 0 };
      }
    }
    // skip_rate 재계산 (신규 추가 항목 포함)
    for (const v of Object.values(result)) {
      v.skip_rate = v.view_count > 0 ? Math.min(1, v.skip_count / v.view_count) : 0;
    }

    return result;
  } catch (err) {
    console.error("load-action-type-rates failed:", err);
    return {};
  }
});

// ── read-active-uploads: 48시간 이내 업로드 영상 목록 (GoldenHour Level 3) ──────
ipcMain.handle("read-active-uploads", () => {
  if (!fs.existsSync(activeUploadsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(activeUploadsFile, "utf8"));
  } catch { return []; }
});

// ── register-action-start: CTA 클릭 의도 기록 (Python 무관, 추적 미시작) ────────
// payload: { video_id, action_type, action_label, source, clicked_at }
// → action_start_log.json에 append — "클릭했다"는 사실만 기록
ipcMain.handle("register-action-start", (_, { video_id, action_type, action_label, source }) => {
  if (!video_id || !action_type) throw new Error("register-action-start: video_id and action_type required");
  let log = [];
  try {
    if (fs.existsSync(actionStartLogFile)) {
      log = JSON.parse(fs.readFileSync(actionStartLogFile, "utf8"));
    }
  } catch { log = []; }
  log.push({
    video_id,
    action_type,
    action_label: action_label ?? null,
    source:       source ?? "command_bar",
    clicked_at:   new Date().toISOString(),
  });
  try {
    fs.mkdirSync(path.dirname(actionStartLogFile), { recursive: true });
    safeWriteJson(actionStartLogFile, log);
  } catch (err) {
    console.error("register-action-start write failed:", err);
  }
  return { ok: true, video_id, action_type };
});

ipcMain.handle("register-action-complete", (_, { video_id, action_type, action_label, source, linked_alert_key, timestamp, pattern_tags, recommendationId, context }) => {
  if (!action_type) throw new Error("register-action-complete: action_type is required");

  let tracking = {};
  try {
    if (fs.existsSync(actionTrackingFile)) {
      tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));
    }
  } catch { tracking = {}; }

  // 중복 ONGOING 방지: 동일 (video_id or actionType) 조합이 이미 ONGOING이면 skip
  const hasDuplicate = Object.values(tracking).some(
    e => e.video_id === (video_id ?? null) && e.action_type === action_type && e.status === "ONGOING"
  );
  if (hasDuplicate) {
    return { skipped: true, reason: "already_ongoing", video_id: video_id ?? null, action_type };
  }

  const now       = new Date(timestamp ?? Date.now());
  const tsCompact = now.toISOString().replace(/[-:]/g, "").slice(0, 15); // 20260319T103200
  const keyPrefix = video_id ?? action_type;
  const key       = `${keyPrefix}_${action_type}_${tsCompact}`;

  const waitDays  = CHECK_AFTER_DAYS[action_type] ?? 3;
  const checkDate = new Date(now);
  checkDate.setDate(checkDate.getDate() + waitDays);

  // 현재 진단 스냅샷에서 baseline 메트릭 저장 (3일 후 비교 근거)
  // _normalizeMetrics() 를 통해 baseline/current 동일 소스 체인 보장
  let baseline = null;
  try {
    if (video_id) {
      let snapRow = null, diagRow = null;
      let problem_type = null, severity = null;

      // 1순위: video_snapshot.json (reach 기반)
      if (fs.existsSync(videoSnapshotFile)) {
        const snap = JSON.parse(fs.readFileSync(videoSnapshotFile, "utf8"));
        const rows = Array.isArray(snap) ? snap : (snap?.videos ?? []);
        snapRow = rows.find(r => (r.video_id ?? "").trim() === video_id) ?? null;
        if (snapRow) {
          problem_type = (snapRow.problem_type ?? "").trim() || null;
          severity     = (snapRow.severity     ?? "").trim() || null;
        }
      }

      // 2순위: alert_history.json (diag 기반 fallback)
      if (fs.existsSync(alertHistoryFile)) {
        const hist    = JSON.parse(fs.readFileSync(alertHistoryFile, "utf8"));
        const entries = Object.values(hist).filter(e => e.video_id === video_id);
        if (entries.length > 0) {
          diagRow = entries.sort((a, b) =>
            new Date(b.timestamp ?? 0) - new Date(a.timestamp ?? 0)
          )[0];
          if (!problem_type) problem_type = (diagRow.problem_type ?? "").trim() || null;
          if (!severity)     severity     = (diagRow.severity     ?? "").trim() || null;
        }
      }

      // _normalizeMetrics: 두 소스를 동일 체인으로 정규화
      const metrics = _normalizeMetrics(snapRow, diagRow);
      if (metrics.views || metrics.ctr || metrics.impressions) {
        baseline = { ...metrics, problem_type, severity };
      }
    }
  } catch { /* baseline 없어도 동작 */ }

  const entry = {
    video_id:          video_id ?? null,
    action_type,
    action_label:      action_label ?? null,
    source:            source ?? "manual",
    linked_alert_key:  linked_alert_key ?? null,
    pattern_tags:      Array.isArray(pattern_tags) ? pattern_tags : [],
    recommendation_id: recommendationId ?? null,
    context:           context ?? null,
    baseline,           // 액션 시점의 진단 상태 스냅샷
    status:            "ONGOING",
    action_date:       now.toISOString().slice(0, 10),
    check_after:       checkDate.toISOString().slice(0, 10),
    registered_at:     now.toISOString(),
    result:            null,
  };
  tracking[key] = entry;

  try {
    fs.mkdirSync(path.dirname(actionTrackingFile), { recursive: true });
    safeWriteJson(actionTrackingFile, tracking);
  } catch (err) {
    console.error("register-action-complete write failed:", err);
    throw err;
  }
  return { key, ...entry };
});

// ── register-action-skip: "나중에" 클릭 기록 (실패 패턴 학습용) ──────────────────
// payload: { recommendationId, actionId, action_type, reason, skippedAt }
// → action_skip_log.json에 append
ipcMain.handle("register-action-skip", (_, { recommendationId, actionId, action_type, reason, skippedAt }) => {
  let log = [];
  try {
    if (fs.existsSync(actionSkipLogFile)) log = JSON.parse(fs.readFileSync(actionSkipLogFile, "utf8"));
  } catch { log = []; }
  log.push({
    recommendation_id: recommendationId ?? null,
    action_id:         actionId ?? null,
    action_type:       (action_type ?? "UNKNOWN").toUpperCase(),
    reason:            reason ?? "later",
    skipped_at:        new Date(skippedAt ?? Date.now()).toISOString(),
  });
  try {
    fs.mkdirSync(path.dirname(actionSkipLogFile), { recursive: true });
    safeWriteJson(actionSkipLogFile, log);
  } catch (err) { console.error("register-action-skip write failed:", err); }
  return { ok: true };
});

// ── register-action-viewed: 모달 노출 기록 (퍼널 분석용) ──────────────────────
// payload: { recommendationId, actionId, shownAt }
// → action_viewed_log.json에 append
ipcMain.handle("register-action-viewed", (_, { recommendationId, actionId, shownAt }) => {
  let log = [];
  try {
    if (fs.existsSync(actionViewedLogFile)) log = JSON.parse(fs.readFileSync(actionViewedLogFile, "utf8"));
  } catch { log = []; }
  log.push({
    recommendation_id: recommendationId ?? null,
    action_id:         actionId ?? null,
    shown_at:          new Date(shownAt ?? Date.now()).toISOString(),
  });
  try {
    fs.mkdirSync(path.dirname(actionViewedLogFile), { recursive: true });
    safeWriteJson(actionViewedLogFile, log);
  } catch (err) { console.error("register-action-viewed write failed:", err); }
  return { ok: true };
});

// ── core bridge (approve / execute → tsx subprocess) ──────────────────────────

function callCore(command, proposalId) {
  return new Promise((resolve, reject) => {
    const runner = path.join(__dirname, "core-runner.js");
    const child  = spawn("npx", ["tsx", runner, command, proposalId], {
      cwd:   app.getAppPath(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `core '${command}' failed (exit ${code})`));
    });
    child.on("error", reject);
  });
}

// ── changelog ─────────────────────────────────────────────────────────────────

ipcMain.handle("load-changelog", () => {
  try {
    return JSON.parse(fs.readFileSync(changelogFile, "utf8"));
  } catch {
    return [];
  }
});

ipcMain.handle("append-changelog", (_, entry) => {
  let current = [];
  try { current = JSON.parse(fs.readFileSync(changelogFile, "utf8")); } catch {}

  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");   // YYYYMMDD
  const prefix  = `EVT_${dateStr}_`;
  const seq     = String(current.filter(e => typeof e.id === "string" && e.id.startsWith(prefix)).length + 1).padStart(3, "0");

  const enriched = {
    ...entry,
    id:         entry.id         ?? `EVT_${dateStr}_${seq}`,
    created_at: entry.created_at ?? now.toISOString(),
  };

  current.push(enriched);
  fs.writeFileSync(changelogFile, JSON.stringify(current, null, 2), "utf8");
  return enriched.id;
});

// ── history ───────────────────────────────────────────────────────────────────

ipcMain.handle("history:read", () => {
  try {
    const histFile = path.join(app.getPath("userData"), "history.json");
    if (!fs.existsSync(histFile)) return [];
    try {
      const raw = fs.readFileSync(histFile, "utf-8");
      return raw ? JSON.parse(raw) : [];
    } catch {
      console.error("History JSON corrupted. Returning empty array.");
      return [];
    }
  } catch (err) {
    console.error("History read failed:", err);
    return [];
  }
});

ipcMain.handle("history:append", (_, event) => {
  try {
    const userDataDir = app.getPath("userData");
    const histFile    = path.join(userDataDir, "history.json");
    const tempFile    = path.join(userDataDir, "history.tmp");

    let existing = [];
    if (fs.existsSync(histFile)) {
      try {
        const raw = fs.readFileSync(histFile, "utf-8");
        existing = raw ? JSON.parse(raw) : [];
      } catch {
        console.error("History parse failed. Resetting.");
        existing = [];
      }
    }

    existing.push(event);
    fs.writeFileSync(tempFile, JSON.stringify(existing, null, 2), "utf-8");
    fs.renameSync(tempFile, histFile);

    return { success: true };
  } catch (err) {
    console.error("History append failed:", err);
    return { success: false };
  }
});

// ── AI Control Center ─────────────────────────────────────────────────────────

ipcMain.handle("get-mode", () => {
  try {
    return JSON.parse(fs.readFileSync(modeConfigFile, "utf8")).mode ?? "supervised";
  } catch { return "supervised"; }
});

ipcMain.handle("set-mode", (_, mode) => {
  const cfg = fs.existsSync(modeConfigFile)
    ? JSON.parse(fs.readFileSync(modeConfigFile, "utf8"))
    : {};
  fs.writeFileSync(modeConfigFile, JSON.stringify({ ...cfg, mode }, null, 2), "utf8");
});

ipcMain.handle("get-all-proposals", () => {
  try {
    return JSON.parse(fs.readFileSync(queueFile, "utf8")).proposals ?? [];
  } catch { return []; }
});

ipcMain.handle("get-pending-proposals", () => {
  try {
    return (JSON.parse(fs.readFileSync(queueFile, "utf8")).proposals ?? [])
      .filter(p => p.status === "pending");
  } catch { return []; }
});

ipcMain.handle("approve-proposal", (_, proposal_id) =>
  callCore("approve", proposal_id)
);

ipcMain.handle("execute-proposal", (_, proposal_id) =>
  callCore("execute", proposal_id)
);

ipcMain.handle("get-ai-changelog", () => {
  try {
    const all = JSON.parse(fs.readFileSync(changelogFile, "utf8"));
    return all.slice(-10).reverse();
  } catch { return []; }
});

// ── YouTube Analytics API ──────────────────────────────────────────────────────
// dateRange: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
// 반환: [videoId, impressions, ctr][]
// 사전 조건: config/google_credentials.json 파일 필요

ipcMain.handle("FETCH_YT_ANALYTICS", async (_, dateRange) => {
  return await getAnalyticsData(configDir, app.getPath("userData"), dateRange);
});

// 인증 토큰 캐시 존재 여부 (boolean)
ipcMain.handle("YT_AUTH_STATUS", () => {
  return isAuthenticated(app.getPath("userData"));
});

// 토큰 삭제 → 다음 fetch 시 재인증 진행
ipcMain.handle("YT_AUTH_CLEAR", () => {
  clearTokens(app.getPath("userData"));
});

// 채널 최근 업로드 목록 조회 → UploadAssistant video_id 자동 매핑용
// 반환: { videoId, title, publishedAt }[]
ipcMain.handle("YOUTUBE_LIST_RECENT_UPLOADS", async (_, maxResults = 10) => {
  return await getRecentUploads(configDir, app.getPath("userData"), maxResults);
});

// ── Redirect Tracker Logs ─────────────────────────────────────────────────────
// redirect_logs.csv 읽기 → RedirectLog[] JSON 반환
// 기본 경로: config/redirect_logs.csv  (또는 config/redirect_config.json에서 override)

ipcMain.handle("READ_REDIRECT_LOGS", () => {
  // 설정 파일에서 경로 읽기 (옵션)
  let logPath = path.join(configDir, "redirect_logs.csv");
  try {
    const redirectConfig = JSON.parse(
      fs.readFileSync(path.join(configDir, "redirect_config.json"), "utf8")
    );
    // redirectLogsPath 우선, 없으면 log_path (하위 호환)
    const configuredPath = redirectConfig.redirectLogsPath ?? redirectConfig.log_path;
    if (configuredPath) {
      logPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(app.getAppPath(), configuredPath);
    }
  } catch { /* 설정 없으면 기본 경로 사용 */ }

  try {
    const content = fs.readFileSync(logPath, "utf8");
    return parseRedirectCSV(content);
  } catch (e) {
    return [];
  }
});

/** redirect_logs.csv → RedirectLog[] */
function parseRedirectCSV(csvText) {
  const lines = csvText.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const fields = line.split(",").map(f => f.trim().replace(/^"|"$/g, ""));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = fields[i] ?? ""; });
      return obj;
    })
    .filter(r => r.timestamp);
}

// ── Redirect Links ────────────────────────────────────────────────────────────
// redirectLinks.json 읽기 → { slug: { video, playlist, campaign } }
// 기본 경로: config/redirectLinks.json  (또는 redirect_config.json 설정 경로)

ipcMain.handle("READ_REDIRECT_LINKS", () => {
  let linksPath = path.join(configDir, "redirectLinks.json");
  try {
    const redirectConfig = JSON.parse(
      fs.readFileSync(path.join(configDir, "redirect_config.json"), "utf8")
    );
    const configuredPath = redirectConfig.redirectLinksPath;
    if (configuredPath) {
      linksPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(app.getAppPath(), configuredPath);
    }
  } catch { /* 설정 없으면 기본 경로 사용 */ }

  try {
    const content = fs.readFileSync(linksPath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    return {};
  }
});

// ── Redirect Link 업데이트 ───────────────────────────────────────────────────
// onVideoPublished(videoId) → redirectLinks.json의 slug.video 필드를 videoId로 업데이트

ipcMain.handle("UPDATE_REDIRECT_LINK", (_, slug, videoId) => {
  let linksPath = path.join(configDir, "redirectLinks.json");
  try {
    const redirectConfig = JSON.parse(
      fs.readFileSync(path.join(configDir, "redirect_config.json"), "utf8")
    );
    const configuredPath = redirectConfig.redirectLinksPath;
    if (configuredPath) {
      linksPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(app.getAppPath(), configuredPath);
    }
  } catch { /* 설정 없으면 기본 경로 사용 */ }

  try {
    let links = {};
    try { links = JSON.parse(fs.readFileSync(linksPath, "utf8")); } catch { /* 없으면 빈 객체 */ }

    if (!links[slug]) {
      logger.warn(`[UPDATE_REDIRECT_LINK] 알 수 없는 slug: ${slug}`);
      return { ok: false, error: `unknown slug: ${slug}` };
    }

    links[slug] = { ...links[slug], video: videoId };
    fs.writeFileSync(linksPath, JSON.stringify(links, null, 2), "utf8");
    logger.info(`[UPDATE_REDIRECT_LINK] ${slug} → video: ${videoId}`);
    return { ok: true, slug, videoId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ── GitHub PAT (보안 IPC) ─────────────────────────────────────────────────────
// VITE 환경변수는 번들에 포함되어 토큰 노출 위험 → main process에서만 읽음
// 우선순위: 1) 시스템 env GITHUB_PAT  2) config/app_secrets.json

ipcMain.handle("getGithubPat", () => {
  // 1순위: 시스템 환경변수
  if (process.env.GITHUB_PAT) return process.env.GITHUB_PAT;

  // 2순위: config/app_secrets.json (패키지 앱용 — 파일에 저장)
  try {
    const secretsFile = path.join(configDir, "app_secrets.json");
    if (fs.existsSync(secretsFile)) {
      const secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
      if (secrets.github_pat) return secrets.github_pat;
    }
  } catch { /* silent */ }

  return null;
});

// ── Google Sheets API ──────────────────────────────────────────────────────────
// sheetNames: string[]  (예: ["_RawData_Master", "SS_음원마스터_최종"])
// 반환: { [sheetName]: Record<string, string>[] }
// 사전 조건: config/google_credentials.json + config/sheets_config.json 필요

ipcMain.handle("FETCH_SHEET_VIDEOS", async (_, sheetNames) => {
  return await getSheetVideos(configDir, app.getPath("userData"), sheetNames);
});

ipcMain.handle("SHEETS_AUTH_STATUS", () => {
  return isSheetsAuthenticated(app.getPath("userData"));
});

ipcMain.handle("SHEETS_AUTH_CLEAR", () => {
  clearSheetsTokens(app.getPath("userData"));
});

// ── Thumbnail Workflow ────────────────────────────────────────────────────────
// thumbnail_replace_pipeline.py 연동
// config/thumbnail_config.json 에서 경로 설정:
//   { pipelinePath, uploadsDir, outputDir, abLogPath }

const _thumbWatchers = {};   // videoId → FSWatcher

function getThumbnailConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(configDir, "thumbnail_config.json"), "utf8"));
  } catch { return {}; }
}

// 진단 + 전략 + 프롬프트 (합성 없음) → { video_id, problems, strategy, prompt }
ipcMain.handle("THUMBNAIL_ANALYZE", async (_, videoId, title) => {
  const cfg = getThumbnailConfig();
  if (!cfg.pipelinePath) return { error: "config/thumbnail_config.json — pipelinePath 설정 필요" };

  return new Promise(resolve => {
    const args = ["--analyze-only", "--video_id", videoId];
    if (title) args.push("--title", title);

    const child = spawn("python3", [cfg.pipelinePath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", () => {
      const match = stdout.match(/ANALYZE_RESULT:(\{[\s\S]*\})/);
      if (match) {
        try { resolve(JSON.parse(match[1])); }
        catch (e) { resolve({ error: `JSON 파싱 실패: ${e.message}`, raw: stdout }); }
      } else {
        resolve({ error: "ANALYZE_RESULT 마커 없음", stdout, stderr });
      }
    });
  });
});

// uploads/ 디렉토리 감시 시작 — 파일 감지 시 renderer에 push
ipcMain.handle("THUMBNAIL_WATCH_START", (_, videoId) => {
  const cfg = getThumbnailConfig();
  if (!cfg.uploadsDir) return { error: "config/thumbnail_config.json — uploadsDir 설정 필요" };

  // 기존 watcher 정리
  if (_thumbWatchers[videoId]) {
    try { _thumbWatchers[videoId].close(); } catch {}
    delete _thumbWatchers[videoId];
  }

  const targetFile  = `${videoId}.png`;
  const uploadsPath = cfg.uploadsDir;

  try {
    const watcher = fs.watch(uploadsPath, (event, filename) => {
      if (filename !== targetFile) return;
      const fullPath = path.join(uploadsPath, targetFile);
      if (fs.existsSync(fullPath)) {
        BrowserWindow.getAllWindows().forEach(w =>
          w.webContents.send("thumbnail:file-detected", { videoId })
        );
      }
    });
    _thumbWatchers[videoId] = watcher;
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
});

// watcher 종료
ipcMain.handle("THUMBNAIL_WATCH_STOP", (_, videoId) => {
  if (_thumbWatchers[videoId]) {
    try { _thumbWatchers[videoId].close(); } catch {}
    delete _thumbWatchers[videoId];
  }
  return { ok: true };
});

// 합성 실행 (uploads/ 파일 이미 존재 가정 — --skip_wait)
ipcMain.handle("THUMBNAIL_RENDER", async (_, videoId, title) => {
  const cfg = getThumbnailConfig();
  if (!cfg.pipelinePath) return { error: "config/thumbnail_config.json — pipelinePath 설정 필요" };

  BrowserWindow.getAllWindows().forEach(w =>
    w.webContents.send("thumbnail:state", { state: "PROCESSING", videoId })
  );

  return new Promise(resolve => {
    const args = ["--video_id", videoId, "--skip_wait"];
    if (title) args.push("--title", title);

    const child = spawn("python3", [cfg.pipelinePath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      if (code === 0) {
        const outputDir  = cfg.outputDir || path.dirname(cfg.pipelinePath);
        const outputA    = path.join(outputDir, `thumb_${videoId}_vA.jpg`);
        const outputB    = path.join(outputDir, `thumb_${videoId}_vB.jpg`);
        const result     = {
          videoId,
          outputA: fs.existsSync(outputA) ? outputA : null,
          outputB: fs.existsSync(outputB) ? outputB : null,
        };
        BrowserWindow.getAllWindows().forEach(w =>
          w.webContents.send("thumbnail:done", result)
        );
        resolve(result);
      } else {
        const err = { error: stderr || `exit ${code}` };
        BrowserWindow.getAllWindows().forEach(w =>
          w.webContents.send("thumbnail:error", { videoId, ...err })
        );
        resolve(err);
      }
    });
  });
});

// 로컬 이미지 → base64 (renderer img src 용)
ipcMain.handle("THUMBNAIL_READ_IMAGE", (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf  = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase().replace(".", "") || "jpeg";
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch { return null; }
});

// thumbnail_intelligence/output/thumbnail_tests.json 읽기 → AB 테스트 목록
ipcMain.handle("READ_AB_TESTS", () => {
  const testsPath = path.join(automationDir, "thumbnail_intelligence", "output", "thumbnail_tests.json");
  try {
    const data = JSON.parse(fs.readFileSync(testsPath, "utf8"));
    return (data.tests ?? []).slice(-20).reverse(); // 최신순 최대 20개
  } catch {
    return [];
  }
});

// A/B 로그 읽기
ipcMain.handle("THUMBNAIL_READ_LOG", () => {
  const cfg = getThumbnailConfig();
  if (!cfg.abLogPath) return [];
  try { return JSON.parse(fs.readFileSync(cfg.abLogPath, "utf8")); }
  catch { return []; }
});

// A/B 로그 업데이트 (CTR 기록, uploaded 플래그 등)
ipcMain.handle("THUMBNAIL_UPDATE_LOG", (_, entry) => {
  const cfg = getThumbnailConfig();
  if (!cfg.abLogPath) return { error: "abLogPath 설정 필요" };
  try {
    let logs = [];
    try { logs = JSON.parse(fs.readFileSync(cfg.abLogPath, "utf8")); } catch {}
    const idx = logs.findIndex(l => l.video_id === entry.video_id);
    if (idx >= 0) logs[idx] = { ...logs[idx], ...entry };
    else logs.push(entry);
    fs.writeFileSync(cfg.abLogPath, JSON.stringify(logs, null, 2), "utf8");
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// ── GoldenHour 업로드 알림 스케줄러 ───────────────────────────────────────────
// Fix 1: source of truth = renderer (main은 이벤트 push만, 직접 log 기록 없음)
// Fix 2: 스케줄 파일 저장 → 앱 재시작/sleep 복구
// Fix 3: key 기반 중복 방지 (동일 bestDay+bestHour+lead는 재등록 안 함)
// Fix 4: shown 이벤트 → renderer push → CTR 측정 가능
// Fix 5: click → navigate:true → renderer 자동 이동

const goldenAlarmScheduleFile = path.join(automationDir, "03_RUNTIME", "golden_alarm_schedule.json");
let goldenAlarmTimer = null;
let goldenAlarmKey   = null;  // Fix 3: 현재 예약된 알람 키

// 알림 발송 + 이벤트 push (IPC 핸들러와 복구 함수에서 공유)
function _fireGoldenNotif({ bestDay, bestHour, leadTimeHours = 3 }) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: "SOUNDSTORM — 업로드 준비 시간",
    body:  `${bestDay} ${bestHour} 골든아워까지 ${leadTimeHours + 1}시간 전\n지금 콘텐츠를 준비하세요`,
    silent: false,
  });

  // Fix 4: 알림 표시 직후 shown 이벤트 push (log 기록은 renderer에서)
  notif.once("show", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) wins[0].webContents.send("golden:shown", { bestDay, bestHour });
  });

  // Fix 1 + Fix 5: 클릭 시 renderer에만 이벤트 push (main은 log 기록 안 함)
  notif.on("click", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) {
      wins[0].show();
      wins[0].focus();
      wins[0].webContents.send("golden:clicked", { bestDay, bestHour, navigate: true });
    }
  });

  notif.show();
  goldenAlarmTimer = null;
  goldenAlarmKey   = null;
  // Fix 2: 발송 완료 → 스케줄 파일 삭제
  try { fs.unlinkSync(goldenAlarmScheduleFile); } catch {}
}

// Fix 2: 타이머 등록 (IPC + 복구에서 공유)
function _scheduleGoldenTimer({ notifyAtMs, bestDay, bestHour, leadTimeHours = 3, key }) {
  const msUntil = notifyAtMs - Date.now();
  if (msUntil <= 0) return false;
  goldenAlarmKey   = key;
  goldenAlarmTimer = setTimeout(() => {
    _fireGoldenNotif({ bestDay, bestHour, leadTimeHours });
  }, msUntil);
  return true;
}

ipcMain.handle("schedule-golden-alarm", (_, payload) => {
  if (!Notification.isSupported()) return { ok: false, reason: "not_supported" };

  const { notifyAtMs, bestDay, bestHour, leadTimeHours = 3 } = payload ?? {};
  if (!notifyAtMs || !bestDay || !bestHour) return { ok: false, reason: "missing_fields" };

  // Fix 3: 동일 알람 키 중복 등록 방지
  const key = `${bestDay}_${bestHour}_${leadTimeHours}`;
  if (goldenAlarmKey === key && goldenAlarmTimer) return { ok: true, notifyAtMs, dedup: true };

  if (goldenAlarmTimer) { clearTimeout(goldenAlarmTimer); goldenAlarmTimer = null; }

  const msUntil = notifyAtMs - Date.now();
  if (msUntil <= 0) return { ok: false, reason: "past" };

  // Fix 2: 스케줄 파일 저장 (앱 재시작 복구용)
  try {
    fs.mkdirSync(path.dirname(goldenAlarmScheduleFile), { recursive: true });
    safeWriteJson(goldenAlarmScheduleFile, { notifyAtMs, bestDay, bestHour, leadTimeHours, key });
  } catch {}

  _scheduleGoldenTimer({ notifyAtMs, bestDay, bestHour, leadTimeHours, key });
  return { ok: true, notifyAtMs };
});

ipcMain.handle("cancel-golden-alarm", () => {
  if (goldenAlarmTimer) { clearTimeout(goldenAlarmTimer); goldenAlarmTimer = null; }
  goldenAlarmKey = null;
  try { fs.unlinkSync(goldenAlarmScheduleFile); } catch {}
  return { ok: true };
});

ipcMain.handle("show-dashboard-notification", (_, payload) => {
  if (!Notification.isSupported()) return { ok: false, reason: "not_supported" };

  const title = payload?.title?.trim();
  const body = payload?.body?.trim() ?? "";
  if (!title) return { ok: false, reason: "missing_title" };

  const notif = new Notification({ title, body, silent: false });
  notif.on("click", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) {
      wins[0].show();
      wins[0].focus();
    }
  });
  notif.show();
  return { ok: true };
});

// Fix 2: 앱 시작 시 저장된 스케줄 복구 (재시작 / sleep 후 복원)
function restoreGoldenAlarm() {
  try {
    if (!fs.existsSync(goldenAlarmScheduleFile)) return;
    const s = JSON.parse(fs.readFileSync(goldenAlarmScheduleFile, "utf8"));
    if (!s.notifyAtMs || s.notifyAtMs <= Date.now()) {
      fs.unlinkSync(goldenAlarmScheduleFile);
      return;
    }
    _scheduleGoldenTimer(s);
  } catch {}
}

// ── window ────────────────────────────────────────────────────────────────────

// ── Vite dev 서버 준비 대기 ───────────────────────────────────────────────────
// 포트 5173~5182 순차 HTTP 체크 → 200 응답 확인 후 onReady(url) 호출
// 유한 상태 머신: MAX_RETRIES 초과 시 app.quit() (무한 루프 방지)
const VITE_PORTS      = Array.from({ length: 10 }, (_, i) => 5173 + i);
const VITE_MAX_RETRY  = 20;   // 20회 × 300ms ≈ 6초

function waitForVite(onReady) {
  let attempt  = 0;
  let resolved = false;

  function probe() {
    if (resolved) return;
    let pending = VITE_PORTS.length;

    for (const port of VITE_PORTS) {
      const req = http.get(`http://localhost:${port}`, (res) => {
        if (!resolved && res.statusCode === 200) {
          resolved = true;
          onReady(`http://localhost:${port}`);
        }
        res.resume();
        req.destroy();
      });
      req.on("error", () => {
        pending--;
        if (!resolved && pending === 0) {
          attempt++;
          if (attempt >= VITE_MAX_RETRY) {
            console.error("[SOUNDSTORM] Vite 서버 응답 없음 — 앱 종료 (20회 시도)");
            app.quit();
          } else {
            setTimeout(probe, 300);
          }
        }
      });
      req.setTimeout(1000, () => req.destroy());
    }
  }

  probe();
}

function createWindow() {
  const win = new BrowserWindow({
    width:  1400,
    height: 900,
    show:   false,   // ready-to-show 전까지 숨김 (흰 화면 방지)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  // ready-to-show / did-finish-load 중 먼저 오는 것으로 창 표시
  // Dev 환경에서 ready-to-show가 안 오는 경우 did-finish-load로 fallback
  let isShown = false;
  function showWindow() {
    if (!isShown) {
      isShown = true;
      win.show();
      win.focus();
    }
  }
  win.once("ready-to-show", showWindow);
  win.webContents.once("did-finish-load", showWindow);

  if (!app.isPackaged) {
    // HTTP 200 응답 확인 후 로드 (포트 열림 ≠ Vite 준비됨 문제 해결)
    waitForVite((url) => win.loadURL(url));
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ── P1-5: action_tracking 결과 알림 ───────────────────────────────────────────
// app focus 시 새 SUCCESS/FAILED 항목을 감지해 OS 알림 발송
// 마지막 체크 timestamp를 notif_last_check.json에 저장

const notifCheckFile = path.join(
  app.isPackaged
    ? path.join(path.dirname(app.getPath("exe").replace(/\.app\/.*$/, ".app")), "..", "..", "07_AUTOMATION_자동화")
    : path.join(app.getAppPath(), "..", "..", "07_AUTOMATION_자동화"),
  "03_RUNTIME",
  "notif_last_check.json"
);

// ── checkActionOutcome: ONGOING → SUCCESS / FAILED 자동 전환 ─────────────────
// 실행 흐름:
//   1. action_tracking.json에서 check_after <= 오늘인 ONGOING 항목 수집
//   2. video_snapshot.json에서 현재 진단 상태 읽기
//   3. 타입별 성공 기준 평가 → SUCCESS / FAILED / null(보류)
//   4. 결과 반영 → checkActionResults() 바로 호출해 OS 알림 발송
//
// 성공 기준:
//   STRATEGY / UPLOAD         : 항상 SUCCESS (사용자 확인이 근거)
//   CTR_WEAK / IMPRESSION_DROP / RETENTION_WEAK
//     → 현재 severity가 CRITICAL/HIGH 아니거나 problem_type이 다르면 SUCCESS
//     → 여전히 같은 problem CRITICAL/HIGH면 FAILED
//   video 데이터 없음         : null (보류, 다음 체크까지 대기)

const HIGH_SEVERITY    = new Set(["CRITICAL", "HIGH"]);
const BEHAVIORAL_TYPES = new Set(["STRATEGY", "UPLOAD"]); // 메트릭 없이 완료로 처리

// ── 메트릭 정규화 — baseline / current 동일 소스 체인 보장 ────────────────────
// source      : video_snapshot.json 행 (reach 기반, impressions=0 가능)
// diagFallback: alert_history.json 항목 (Video_Diagnostics, 실값)
//
// 우선순위: source 값(0이 아닌 경우) → diagFallback 값
// 이 함수를 baseline 저장과 current 평가 양쪽에서 호출해 source mismatch 방지
function _normalizeMetrics(source, diagFallback = {}) {
  const sv = n => parseFloat(n) || 0;

  const views = sv(source?.views) || sv(diagFallback?.views);
  const ctr   = sv(source?.ctr)   || sv(diagFallback?.ctr);
  const imp   = sv(source?.impressions) || sv(diagFallback?.impressions);

  return {
    views:       views || null,
    ctr:         ctr   || null,
    impressions: imp   || null,
  };
}

// ── 성장률 가중 점수 (views 0.5 + ctr 0.3 + impressions 0.2) ─────────────────
// 반환: 가중 성장률 합 (양수 = 개선, 0 이상이어야 함) | null (측정 불가)
function _calcGrowthScore(baseline, current) {
  const metrics = [];

  const bViews = parseFloat(baseline?.views)       ?? 0;
  const cViews = parseFloat(current?.views)        ?? 0;
  const bCtr   = parseFloat(baseline?.ctr)         ?? 0;
  const cCtr   = parseFloat(current?.ctr)          ?? 0;
  const bImp   = parseFloat(baseline?.impressions) ?? 0;
  const cImp   = parseFloat(current?.impressions)  ?? 0;

  if (bViews > 0 && cViews > 0)
    metrics.push({ g: (cViews - bViews) / bViews, w: 0.5 });
  if (bCtr > 0 && cCtr > 0)
    metrics.push({ g: (cCtr - bCtr) / bCtr, w: 0.3 });
  if (bImp > 0 && cImp > 0)
    metrics.push({ g: (cImp - bImp) / bImp, w: 0.2 });

  if (metrics.length === 0) return null;

  const totalW = metrics.reduce((s, m) => s + m.w, 0);
  return metrics.reduce((s, m) => s + m.g * (m.w / totalW), 0);
}

function _evalOutcome(entry, currentDiag) {
  const type = (entry.action_type ?? "").toUpperCase();

  // 행동 기반 타입 (메트릭 측정 불가) → 사용자가 확인했으면 SUCCESS
  if (BEHAVIORAL_TYPES.has(type) || !entry.video_id) return "SUCCESS";

  // 진단 데이터 없음 → 판단 보류 (null: 이번 체크 건너뜀)
  if (!currentDiag) return null;

  // ── 1순위: 가중 성장률 판정 (baseline 수치 있을 때) ─────────────────────────
  if (entry.baseline) {
    const score = _calcGrowthScore(entry.baseline, currentDiag);
    if (score !== null) {
      return score >= 0.15 ? "SUCCESS" : "FAILED";
    }
  }

  // ── 2순위: severity 기반 폴백 (baseline 수치 없을 때) ───────────────────────
  const currentType = (currentDiag.problem_type ?? "").toUpperCase().trim();
  const currentSev  = (currentDiag.severity     ?? "").toUpperCase().trim();

  if (entry.baseline) {
    const baseSev = (entry.baseline.severity ?? "").toUpperCase();
    if (HIGH_SEVERITY.has(baseSev) && !HIGH_SEVERITY.has(currentSev)) return "SUCCESS";
    if (HIGH_SEVERITY.has(baseSev) && HIGH_SEVERITY.has(currentSev)) return "FAILED";
  }

  const problemResolved  = currentType !== type && currentType !== "";
  const severityImproved = !HIGH_SEVERITY.has(currentSev);
  return (problemResolved || severityImproved) ? "SUCCESS" : "FAILED";
}

function checkActionOutcome() {
  try {
    if (!fs.existsSync(actionTrackingFile)) return;
    const tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));

    // check_after <= 오늘인 ONGOING 항목
    const todayStr = new Date().toISOString().slice(0, 10);
    const due = Object.entries(tracking).filter(
      ([, e]) => e.status === "ONGOING" && e.check_after && e.check_after <= todayStr
    );
    if (due.length === 0) return;

    // video_snapshot.json 에서 현재 진단 맵 구성 (video_id → row)
    let diagMap = {};
    try {
      if (fs.existsSync(videoSnapshotFile)) {
        const snap = JSON.parse(fs.readFileSync(videoSnapshotFile, "utf8"));
        // snap: { savedAt, videos: RawVideoRow[] }  또는  RawVideoRow[]
        const rows = Array.isArray(snap) ? snap : (snap?.videos ?? []);
        for (const row of rows) {
          const vid = (row.video_id ?? row["video_id"] ?? "").trim();
          if (vid) diagMap[vid] = row;
        }
      }
    } catch { /* 스냅샷 없으면 빈 맵 — 행동 기반 타입은 처리 가능 */ }

    // alert_history.json → video_id별 최신 진단 맵 (impressions/ctr diag fallback용)
    let alertMap = {};
    try {
      if (fs.existsSync(alertHistoryFile)) {
        const hist = JSON.parse(fs.readFileSync(alertHistoryFile, "utf8"));
        for (const e of Object.values(hist)) {
          const vid = e.video_id;
          if (!vid) continue;
          if (!alertMap[vid] || new Date(e.timestamp ?? 0) > new Date(alertMap[vid].timestamp ?? 0)) {
            alertMap[vid] = e;
          }
        }
      }
    } catch {}

    let changed = false;
    const evalAt = new Date().toISOString();

    for (const [key, entry] of due) {
      const snapRow = entry.video_id ? diagMap[entry.video_id] ?? null : null;
      const diagRow = entry.video_id ? alertMap[entry.video_id] ?? null : null;

      // _normalizeMetrics: baseline과 동일한 소스 체인 — source mismatch 방지
      let currentDiag = null;
      if (snapRow || diagRow) {
        const metrics = _normalizeMetrics(snapRow, diagRow);
        currentDiag = {
          ...(snapRow ?? diagRow),  // problem_type, severity 등 진단 필드 보존
          views:       metrics.views,
          ctr:         metrics.ctr,
          impressions: metrics.impressions,
        };
      }

      const outcome = _evalOutcome(entry, currentDiag);

      if (outcome === null) continue; // 데이터 부족 → 보류

      // 성장 지표 계산 (UI 표시용)
      const growthDelta = (() => {
        if (!entry.baseline || !currentDiag) return null;
        const bv = parseFloat(entry.baseline.views)       || 0;
        const cv = parseFloat(currentDiag.views)           || 0;
        const bc = parseFloat(entry.baseline.ctr)         || 0;
        const cc = parseFloat(currentDiag.ctr)             || 0;
        const bi = parseFloat(entry.baseline.impressions) || 0;
        const ci = parseFloat(currentDiag.impressions)    || 0;
        return {
          views_pct:       bv > 0 && cv > 0 ? Math.round((cv - bv) / bv * 1000) / 10 : null,
          ctr_pct:         bc > 0 && cc > 0 ? Math.round((cc - bc) / bc * 1000) / 10 : null,
          impressions_pct: bi > 0 && ci > 0 ? Math.round((ci - bi) / bi * 1000) / 10 : null,
        };
      })();

      tracking[key] = {
        ...entry,
        status:   outcome,
        result:   evalAt,
        current_metrics: currentDiag ? {
          views:       currentDiag.views       ?? null,
          ctr:         currentDiag.ctr         ?? null,
          impressions: currentDiag.impressions ?? null,
        } : null,
        growth_delta: growthDelta,
        eval_note: outcome === "SUCCESS"
          ? "3일 후 지표 개선 확인"
          : "3일 후에도 동일 문제 지속",
      };
      changed = true;
    }

    if (changed) safeWriteJson(actionTrackingFile, tracking);
  } catch (err) {
    console.error("checkActionOutcome failed:", err);
  }
}

function checkActionResults() {
  if (!Notification.isSupported()) return;
  try {
    let lastCheck = 0;
    if (fs.existsSync(notifCheckFile)) {
      lastCheck = JSON.parse(fs.readFileSync(notifCheckFile, "utf8")).ts ?? 0;
    }
    if (!fs.existsSync(actionTrackingFile)) return;
    const tracking = JSON.parse(fs.readFileSync(actionTrackingFile, "utf8"));
    const now = Date.now();

    const newResults = Object.values(tracking).filter(e => {
      if (e.status !== "SUCCESS" && e.status !== "FAILED") return false;
      const resultTs = e.result ? new Date(e.result).getTime() : 0;
      return resultTs > lastCheck;
    });

    for (const e of newResults) {
      const isSuccess = e.status === "SUCCESS";
      const title = isSuccess ? "✅ 액션 효과 확인됨" : "❌ 액션 미효과";
      const body  = `${e.action_type} — ${e.video_id}\n${isSuccess ? "지표 회복" : "추가 대응 필요"}`;
      new Notification({ title, body, silent: false }).show();
    }

    safeWriteJson(notifCheckFile, { ts: now });
  } catch { /* 알림 실패는 무시 */ }
}

app.whenReady().then(() => {
  ensureFiles();
  createWindow();
  restoreGoldenAlarm(); // Fix 2: 재시작 후 저장된 알람 복구

  // 앱 시작 시 즉시 판정 + 알림
  checkActionOutcome();
  checkActionResults();

  // 앱 포커스 시마다 판정 → 결과 알림
  app.on("browser-window-focus", () => {
    checkActionOutcome(); // ONGOING → SUCCESS/FAILED 전환 (먼저)
    checkActionResults(); // 새 SUCCESS/FAILED → OS 알림 발송 (후)
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
