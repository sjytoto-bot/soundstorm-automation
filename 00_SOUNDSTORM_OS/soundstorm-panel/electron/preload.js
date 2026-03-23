const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // ── Changelog ──────────────────────────────────────────────────────────────
  loadChangeLog:       ()                 => ipcRenderer.invoke("load-changelog"),
  appendChangeLog:     (entry)            => ipcRenderer.invoke("append-changelog", entry),

  // ── Tasks ──────────────────────────────────────────────────────────────────
  loadTasks:               ()                 => ipcRenderer.invoke("load-tasks"),
  addTask:                 (task)             => ipcRenderer.invoke("add-task", task),
  updateTask:              (id, updates)      => ipcRenderer.invoke("update-task", id, updates),
  deleteTask:              (id)               => ipcRenderer.invoke("delete-task", id),

  // ── Action Tracking ────────────────────────────────────────────────────────
  // CTA 클릭 의도 기록 → action_start_log.json (Python 무관, 3일 추적 미시작)
  // payload: { video_id, action_type, action_label, source }
  registerActionStart:     (payload)          => ipcRenderer.invoke("register-action-start", payload),
  // 실행 확인 후 action_tracking.json에 ONGOING 엔트리 기록 → 3일 추적 시작
  // payload: { video_id: string, action_type: string, timestamp?: string }
  registerActionComplete:  (payload)          => ipcRenderer.invoke("register-action-complete", payload),
  // 최근 7일 내 SUCCESS/FAILED 완료 항목 반환
  loadActionResults:       ()                 => ipcRenderer.invoke("load-action-results"),
  // 특정 영상의 최신 alert_history 항목 반환 (권장 액션 생성 컨텍스트)
  loadAlertHistory:        (videoId)          => ipcRenderer.invoke("load-alert-history", videoId),
  // 특정 영상의 action_tracking 항목 배열 반환 (ONGOING/SUCCESS/FAILED)
  loadActionTracking:      (videoId)          => ipcRenderer.invoke("load-action-tracking", videoId),
  // action_type별 전체 기간 성공률 집계 → { [type]: { success, total, rate, skip_rate, view_count } }
  loadActionTypeRates:     ()                 => ipcRenderer.invoke("load-action-type-rates"),
  // 모달 "나중에" 클릭 기록 → action_skip_log.json (실패 패턴 학습)
  // payload: { recommendationId, actionId, action_type, reason, skippedAt }
  registerActionSkip:      (payload)          => ipcRenderer.invoke("register-action-skip", payload),
  // 모달 노출 기록 → action_viewed_log.json (퍼널 분석)
  // payload: { recommendationId, actionId, shownAt }
  registerActionViewed:    (payload)          => ipcRenderer.invoke("register-action-viewed", payload),
  // GoldenHour Level 3 — 48시간 이내 업로드 영상 목록 (active_uploads.json)
  readActiveUploads:       ()                 => ipcRenderer.invoke("read-active-uploads"),

  // ── AI Control Center ──────────────────────────────────────────────────────
  getMode:             ()                 => ipcRenderer.invoke("get-mode"),
  setMode:             (mode)             => ipcRenderer.invoke("set-mode", mode),
  getAllProposals:      ()                 => ipcRenderer.invoke("get-all-proposals"),
  getPendingProposals: ()                 => ipcRenderer.invoke("get-pending-proposals"),
  approveProposal:     (proposal_id)      => ipcRenderer.invoke("approve-proposal", proposal_id),
  executeProposal:     (proposal_id)      => ipcRenderer.invoke("execute-proposal", proposal_id),
  getChangelog:        ()                 => ipcRenderer.invoke("get-ai-changelog"),
  loadOfficialState:   ()                 => ipcRenderer.invoke("load-official-state"),
  setRoadmapMeta:      (field, value)     => ipcRenderer.invoke("set-roadmap-meta", field, value),

  // ── History ────────────────────────────────────────────────────────────────
  readHistory:         ()                 => ipcRenderer.invoke("history:read"),
  appendHistory:       (event)            => ipcRenderer.invoke("history:append", event),

  // ── YouTube Analytics API ──────────────────────────────────────────────────
  // range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
  // 반환:  [videoId, impressions, ctr][]  (OAuth2 브라우저 인증 포함)
  fetchYTAnalytics:           (range)           => ipcRenderer.invoke("FETCH_YT_ANALYTICS", range),
  ytAuthStatus:               ()                => ipcRenderer.invoke("YT_AUTH_STATUS"),
  ytAuthClear:                ()                => ipcRenderer.invoke("YT_AUTH_CLEAR"),
  // 반환: { videoId, title, publishedAt }[]  (최근 업로드 목록 — video_id 자동 매핑용)
  youtubeListRecentUploads:   (max = 10)        => ipcRenderer.invoke("YOUTUBE_LIST_RECENT_UPLOADS", max),

  // ── Google Sheets API ──────────────────────────────────────────────────────
  // sheetNames: string[]  읽을 시트 이름 배열
  // 반환: { [sheetName]: Record<string, string>[] }  헤더 키 기반 행 객체 배열
  // 사전 조건: config/sheets_config.json  { "spreadsheetId": "..." }
  fetchSheetVideos:    (sheetNames)       => ipcRenderer.invoke("FETCH_SHEET_VIDEOS", sheetNames),
  sheetsAuthStatus:    ()                 => ipcRenderer.invoke("SHEETS_AUTH_STATUS"),
  sheetsAuthClear:     ()                 => ipcRenderer.invoke("SHEETS_AUTH_CLEAR"),

  // ── Redirect Tracker ───────────────────────────────────────────────────────
  // config/redirect_logs.csv (또는 redirect_config.json 설정 경로) 읽기
  // 반환: RedirectLog[]  { timestamp, platform, campaign, link_slug, ... }
  readRedirectLogs:    ()                 => ipcRenderer.invoke("READ_REDIRECT_LOGS"),
  // config/redirectLinks.json (또는 redirect_config.json 설정 경로) 읽기
  // 반환: RedirectLinkMap  { [slug]: { video, playlist, campaign } }
  readRedirectLinks:   ()                 => ipcRenderer.invoke("READ_REDIRECT_LINKS"),
  // redirectLinks.json의 slug.video 필드를 videoId로 업데이트
  // 반환: { ok: boolean, slug, videoId }
  updateRedirectLink:  (slug, videoId)    => ipcRenderer.invoke("UPDATE_REDIRECT_LINK", slug, videoId),

  // ── GitHub PAT (보안) ─────────────────────────────────────────────────────
  // main process에서만 읽음 — 프론트 번들 노출 없음
  // 설정: 시스템 env GITHUB_PAT 또는 config/app_secrets.json { "github_pat": "..." }
  getGithubPat:        ()                 => ipcRenderer.invoke("getGithubPat"),

  // ── Content Pack (STAGE 4) ─────────────────────────────────────────────────
  // logs/content_packs.json 읽기/쓰기
  loadContentPacks:    ()                 => ipcRenderer.invoke("load-content-packs"),
  saveContentPacks:    (packs)            => ipcRenderer.invoke("save-content-packs", packs),

  // ── Video Snapshot (IPC fallback) ─────────────────────────────────────────
  // logs/video_snapshot.json — localStorage 초기화 시에도 유지되는 파일 기반 폴백
  saveVideoSnapshot:   (payload)          => ipcRenderer.invoke("save-video-snapshot", payload),
  loadVideoSnapshot:   ()                 => ipcRenderer.invoke("load-video-snapshot"),

  // ── Thumbnail Workflow ─────────────────────────────────────────────────────
  // thumbnail_intelligence/output/thumbnail_tests.json → 최신순 최대 20개
  readAbTests:         ()                 => ipcRenderer.invoke("READ_AB_TESTS"),
  // config/thumbnail_config.json 경로 설정 필요
  // 진단 + 전략 + 프롬프트 (합성 없음) → { video_id, problems, strategy, prompt }
  thumbnailAnalyze:    (videoId, title)   => ipcRenderer.invoke("THUMBNAIL_ANALYZE", videoId, title),
  // uploads/ 디렉토리 감시 시작 — 파일 감지 시 thumbnail:file-detected 이벤트 push
  thumbnailWatchStart: (videoId)          => ipcRenderer.invoke("THUMBNAIL_WATCH_START", videoId),
  thumbnailWatchStop:  (videoId)          => ipcRenderer.invoke("THUMBNAIL_WATCH_STOP", videoId),
  // --skip_wait 로 A/B 합성 실행 → thumbnail:done 이벤트 push
  thumbnailRender:     (videoId, title)   => ipcRenderer.invoke("THUMBNAIL_RENDER", videoId, title),
  // 로컬 이미지 → data:image/jpeg;base64,...
  thumbnailReadImage:  (filePath)         => ipcRenderer.invoke("THUMBNAIL_READ_IMAGE", filePath),
  // thumbnail_ab_logs.json 읽기 / 업데이트
  thumbnailReadLog:    ()                 => ipcRenderer.invoke("THUMBNAIL_READ_LOG"),
  thumbnailUpdateLog:  (entry)            => ipcRenderer.invoke("THUMBNAIL_UPDATE_LOG", entry),

  // ── GoldenHour 업로드 알림 (메인 프로세스 스케줄러) ──────────────────────
  // payload: { notifyAtMs, bestDay, bestHour, leadTimeHours }
  // 반환: { ok: boolean, notifyAtMs?, reason? }
  scheduleGoldenAlarm: (payload) => ipcRenderer.invoke("schedule-golden-alarm", payload),
  cancelGoldenAlarm:   ()        => ipcRenderer.invoke("cancel-golden-alarm"),

  // ── Dashboard OS 알림 ─────────────────────────────────────────────────────
  // payload: { title: string, body?: string }
  showDashboardNotification: (payload) => ipcRenderer.invoke("show-dashboard-notification", payload),

  // ── IPC 이벤트 리스너 (main → renderer push) ──────────────────────────────
  // 허용 채널: thumbnail:state / thumbnail:file-detected / thumbnail:done / thumbnail:error
  //            golden:clicked — 골든아워 알림 클릭 시 push
  on: (channel, cb) => {
    const ALLOWED = [
      "thumbnail:state", "thumbnail:file-detected", "thumbnail:done", "thumbnail:error",
      "golden:clicked", "golden:shown",
    ];
    if (ALLOWED.includes(channel)) ipcRenderer.on(channel, (_, data) => cb(data));
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});
