# SOUNDSTORM Creator OS — 마스터 보고서

**최종 수정: 2026-03-23 (외부 유입 드릴다운 완료 / RightSidePanel 747줄 구조 분해 / ChannelHealth 엔진 분리 / Dashboard OS 알림 브릿지 연결 / build·test 재검증)**

> **[문서 유지 규칙]**
> 1. 동일 기능 설명은 1곳만 — 중복 발견 시 최신 버전 외 삭제
> 2. 완료된 내용은 1~2줄 요약만 — 상세 설명 금지
> 3. 설계 문서는 구현 완료 시 제거 — "목표 구조" 등 미래형 섹션 불필요
> 4. "다음 단계"는 Section 2 CONTROL TOWER에서만 관리
> 5. 코드 스니펫은 원칙적으로 금지 — 코드는 코드베이스가 진실

---

```
  0. SYSTEM SPEC      절대 불변 — 설계 철학, 흐름, Block 원칙
  1. SYSTEM STATE     현재 상태 — PHASE 구현 현황, 시스템 레벨
  2. CONTROL TOWER    실행 OS  — DONE / NOW / NEXT / BACKLOG
  3. DESIGN SYSTEM    UI 규칙  — Dashboard 레이어, Token, 미해결 이슈
  4. CONTENT ENGINE   프롬프트 — midjourney / youtube_title / suno
  5. STRATEGY         운영 전략 — CTR / 콘텐츠 / 문제-솔루션
  6. RUNTIME DATA     운영 상태 — 채널 현황, 하락 원인, 리스크
  7. CHANGELOG        변경 이력
```

---

## 0. SYSTEM SPEC

> 이 섹션은 거의 바뀌지 않는다. 아키텍처 변경 시에만 수정.

### 0-A. Creator OS 정의 + 설계 원칙

**Creator OS = 데이터 → 판단 → 실행 → 학습 루프를 자동화하는 운영 시스템**

| 원칙 | 정의 |
|------|------|
| **Action First** | 데이터보다 행동이 먼저. 앱 진입 3초 내 1개의 명확한 행동을 보여준다 |
| **One Primary Action** | Hick's Law — PRIMARY CTA 1개, SECONDARY 2개 이하 |
| **Zero Scroll Execution** | 스크롤 없이 실행 가능. CriticalAlertBanner + ActionCommandBar 최상단 고정 |
| **Learning Loop** | 실행 → 추적 → 판정 → 전략 업데이트. 행동이 시스템을 개선한다 |

---

### 0-B. Runtime Flow 구조

```
[Python Layer]                              [React Dashboard Layer]
──────────────────────────────              ─────────────────────────────
api_data_shuttler.py                        [STICKY] CriticalAlertBanner
  └─ YouTube Data API 수집                    └─ CRITICAL 즉시 노출, dismiss
  └─ Google Sheets 저장
                                            [0] ActionCommandBar
video_diagnostics_engine.py                  └─ 1 PRIMARY + 2 SECONDARY CTA
  └─ IMPRESSION/CTR/RETENTION 진단
  └─ severity: CRITICAL/HIGH/MEDIUM        [1] execution 블록 (단일 카드 1fr|1fr 그리드)
                                             └─ 좌: 콘텐츠 실행 (최근 성과 테이블)
                                             └─ 우: NextUploadCard (골든아워 통합 추천)
alert_engine.py
  └─ CRITICAL → 이메일 발송               [2] ChannelPulseRow
  └─ BROWSE_DROP → Task 자동 생성           └─ 건강도 등급 + KPI 1줄
  └─ alert_history.json 기록
                                           [3] DiagnosticsSection
action_tracker.py                            └─ ImpressionDropPanel
  └─ 액션 baseline 등록                       └─ CTRAlertPanel
  └─ 3일 후 SUCCESS/FAILED 판정              └─ RetentionDropPanel

Strategy Engine (strategyEngine.js)        VideoDetailModal
  computeDecisionBar      → ActionCommandBar  └─ DiagnosticsBadge
  computeChannelHealth    → ChannelPulseRow   └─ ActionItems
  computeDailyStrategy    → (미사용)           └─ ActionTrackingStatus
  computeGoldenHour       → NextUploadCard (execution 블록 우측)

          ┌──────────────────────────────┐
          │         Learning Loop        │
          │  실행 완료 → baseline 등록   │
          │  → 3일 후 SUCCESS/FAILED     │
          │  → typeRates 누적            │
          │  → ActionItems 성공률 표시   │
          │  → Strategy 업데이트         │
          └──────────────────────────────┘
```

**시스템 파이프라인 레이어:**

```
Python 수집  →  Google Sheets (19탭)  →  IPC Bridge (16채널)
                                               ↓
                                    TypeScript Adapters (10개)
                                    TypeScript Engines (2개: packPerf, hypothesis)
                                    React Controllers (4개)
                                               ↓
                                    Block Registry → Dashboard UI
```

---

### 0-C. Block System 원칙

**새 기능 추가 시 DashboardPage.tsx를 수정하지 않는다.**

```
1. Engine 작성   (src/engines/ 또는 src/lib/)
2. Block 작성    (src/components/dashboard/)
3. Registry 등록 (src/dashboard/blockRegistry.tsx)
4. 끝 — DashboardPage.tsx 수정 = 구조가 깨지는 신호
```

데이터 흐름: `Engine → DashboardData/Actions 조립 → BLOCK_REGISTRY[id] → Block (표시 전용)`
Block 안에서 fetch·계산·상태 생성 금지.

---

## 1. SYSTEM STATE

### 1-A. 전체 PHASE 구현 현황

| Phase | 작업 | 상태 |
|-------|------|------|
| PHASE 1~7 | Data Schema / Snapshot / Adapter / Controller / Core UI / Video Intelligence / Insight Engine | ✅ 모두 완료 |
| PHASE 8A~E | External Traffic / Redirect Tracker / Marketing Intelligence / Opportunity / Content Strategy | ✅ 완료 (8E UI 정리 중) |
| PHASE 9A | Execution Panel | ✅ 완료 |
| PHASE 9B | Strategy Panel → Channel Status Panel | ✅ 완료 (ChannelStatusPanel.tsx + 드릴다운, 2026-03-22 이름 변경) |
| PHASE 9C | Dashboard v12 — YouTube 탭 통합 + 실행률 중심 재설계 | ✅ 완료 (2026-03-20) |
| Stage J | CriticalAlertBanner + ActionCommandBar + TodayBriefCard + ChannelPulseRow | ✅ 완료 |
| Stage K | autoExpandVideoId 연결 + CTRAlertPanel 44px CTA + computeDecisionBar | ✅ 완료 |
| PHASE 10-A/B/E | alert_engine + 이메일 + action_tracker + BROWSE_DROP → Task 자동 생성 | ✅ 완료 |
| PHASE 10-C/D | Electron IPC OS 레벨 알림 (SHOW_CRITICAL_ALERT) | ❌ 미구현 |
| PHASE 10-F | EXTERNAL_DROP → Redirect 리포트 자동 생성 | ❌ 미구현 |
| VideoDetailModal 고도화 | DiagnosticsBadge + ActionItems + ActionTrackingStatus + LinkedTask | ✅ 완료 |
| Diagnostics A~G | 3축 진단 (IMPRESSION/CTR/RETENTION) + 7/7 PASS | ✅ 완료 (E만 미구현) |
| STAGE 4 — Block System | blockRegistry + DashboardData/Actions 계약 + useDashboardBlocks + SaveStatusBadge | ✅ 완료 (2026-03-20) |
| STAGE 4 — Execution Auto | ThemeIntelligenceEngine + UploadAssistant v2 + GrowthLoopMonitor | ✅ 완료 (2026-03-20) |
| CTR CSV 파이프라인 | Studio CSV 수집 자동화 + _RawData_Master write-back + dirty flag diagnostics | ✅ 완료 (2026-03-21) |
| 최근 영상 게시이후 자동갱신 | download_recent_video_studio.py — 2시간마다 최근 영상 impressions/CTR 직접 Sheets 반영 | ✅ 완료 (2026-03-22) |
| Latest Video Watchdog | 최신 영상 1개 감시 → proposal 생성 → Discord 알림 → apply/rollback 실행 | ✅ 완료 (2026-03-23) |
| GoldenHour Inline Badge | ActiveUploadMonitor 블록 통합 → RecentUploadsTable 인라인 배지 | ✅ 완료 (2026-03-21) |
| NextUploadCard 통합 | 다음 업로드 예측 + 골든아워 → 단일 카드 (의사결정 로직: max_delay = avgInterval × 0.5) | ✅ 완료 (2026-03-22) |
| execution 블록 1fr 그리드 | ExecutionPanel(좌) + NextUploadCard(우) → 단일 외부 카드 내 1fr|1fr 내부 그리드 | ✅ 완료 (2026-03-22) |

> PHASE 10-C/D 주의: CriticalAlertBanner(React state ✅)와 다름. OS 레벨 Electron Notification + main.js ipcMain 핸들러 추가가 미구현.

---

### 1-B. 시스템 레벨

> **현재: Level 2.9** — Execution + Learning + Timing + Recommendation OS
> **다음 목표: Level 3** — Timing 실시간 모니터링 (업로드 후 6시간 추적)

---

## 2. CONTROL TOWER

### DONE — 완성된 것

| 레이어 | 기능 | 상태 |
|--------|------|------|
| **Data** | api_data_shuttler + impressions_prev + VTS fallback + VTS_Log append-only | ✅ |
| **Diagnostics** | video_diagnostics_engine 3축 (IMPRESSION/CTR/RETENTION) + 7/7 PASS | ✅ |
| **Diagnostics UI** | ImpressionDropPanel + CTRAlertPanel + RetentionDropPanel + DiagnosticsPanel 허브 | ✅ |
| **Alert** | alert_engine.py — CRITICAL 이메일 + alert_history + 중복 방지 | ✅ |
| **Action** | action_tracker.py — baseline 등록 + 3일 후 SUCCESS/FAILED + patternTags | ✅ |
| **Auto Task** | BROWSE_DROP → Task 자동 생성 → ExecutionPanel (10-E) | ✅ |
| **Dashboard v12** | CriticalAlertBanner + ActionCommandBar + TodayBriefCard + ChannelPulseRow | ✅ |
| **Decision Engine** | computeDecisionBar + computeChannelHealth + computeGoldenHour Lv.4 | ✅ |
| **Recommendation** | computeRecommendationScore — 성공률 × 골든아워 × 긴급도 기반 정렬 | ✅ |
| **Routing** | autoExpandVideoId → CTRAlertPanel → ThumbnailWorkflowPanel | ✅ |
| **Drilldown** | VideoDetailModal 판정 허브 — TrackingRow + GrowthBadge + FailureLearningNote | ✅ |
| **Block System** | blockRegistry + DashboardData 계약 + useDashboardBlocks + SaveStatusBadge | ✅ |
| **Execution Auto** | ThemeIntelligenceEngine + UploadAssistant v2 + GrowthLoopMonitor | ✅ |
| **TodayActionController** | useTodayActionController — decisionBar + criticalAlerts 단일 수렴 | ✅ |
| **DiagnosticsController** | useDiagnosticsController — hasAnyIssue 4축 판단 단일 판단점 | ✅ |
| **NavigationContext** | navigateToPanel — strategy/upload 타입별 ref scroll + blockRegistry 연결 | ✅ |
| **H-3 UX 수정** | TodayBriefCard 버튼 → DiagnosticsSection scrollIntoView + 2초 diagHighlighted | ✅ |
| **M-5 UX 수정** | ActionCommandBar 클릭 → setActionStartedId + setDiagHighlighted 2초 하이라이트 | ✅ |
| **데드코드 삭제** | ControlPanel (App.jsx) / DailyStrategyPanel / GoldenHourPanel / YouTubeKpiStrip 제거 | ✅ |
| **CTR CSV 수집** | download_studio_csv.py — Export 버튼 탐지 + 한국어 CSV 파싱 안정화 | ✅ |
| **CTR write-back** | generate_active_uploads.py — CSV → _RawData_Master (impressions + ctr + ctr_source + ctr_updated_at) | ✅ |
| **dirty flag diagnostics** | write-back 실제 변경 시에만 video_diagnostics_engine.py 재실행 | ✅ |
| **Latest Video Watchdog** | `latest_video_watchdog.py` — 최신 업로드 1개 선택 → `_RawData_Master` / `Video_Diagnostics` / `Channel_CTR_KPI` 교차판단 → `latest_video_watchdog_proposal.json` 저장 | ✅ |
| **Discord Alert** | `discord_notifier.py` — Discord 웹훅으로 최신 영상 패키징 경보 발송 | ✅ |
| **Apply / Rollback** | 제목/썸네일 적용(`apply`) + `03_RUNTIME/rollback/<proposal_id>/backup.json` 기반 복구(`rollback`) | ✅ |
| **GoldenHour Inline Badge** | RecentUploadsTable — ⚡/⏱ 배지 인라인 + ActiveUploadMonitor 블록 제거 | ✅ |
| **NextUploadCard** | 다음 업로드 + 골든아워 통합 카드. 의사결정 로직(max_delay = avgInterval × 0.5), 대안 옵션 선택, 요일 바차트. TodayBriefCard strategy 블록 제거 | ✅ |
| **execution 블록 그리드** | 단일 외부 카드 안에서 ExecutionPanel(좌 1fr) + NextUploadCard(우 1fr) 내부 그리드 분할 | ✅ |
| **ChannelStatusPanel 드릴다운** | 4카드(THUMBNAIL/TITLE/RETENTION/ALGORITHM) 클릭 → 해당 진단 영상 리스트 → VideoDetailModal. `fetchVideoTitleMap()` 연동으로 영상 제목 표시 (raw videoId 필터링) | ✅ |
| **TodayBriefCard 단순화** | "오늘의 전략" 섹션 제거. props: `goldenHour`만 유지. 과거 시간 표시 제거 (`getGoldenState` → null). 다음 날짜 형식 "금 (3/27)" 개선. `strategyEngine.js` uploadHour 단일 시간값으로 변경 | ✅ |
| **데드코드 삭제 (2차)** | `ContentStrategyPanel.tsx` / `StrategyInsightsPanel.tsx` 미사용 orphan 파일 삭제. RightSidePanel "채널 전략" → "콘텐츠 전략" 탭 이름 수정 | ✅ |
| **UpdateStatusBar 재명명** | 4항목 → 3항목 병합. (1) 자동화 → **API 싱크** (`youtube-data-sync.yml`). (2) 데이터 정상 + 시트 정상 → **시트 싱크** (Sheets 연결 + `_Pipeline_Health` 탭 병합, 최악 상태 우선). (3) CTR → **스튜디오 싱크** (`reach-data-sync.yml`) | ✅ |
| **CTR Race Condition 수정** | CSV push 시 두 워크플로우 동시 트리거 → `_RawData_Master.impressions = 0` 덮어쓰기 버그. ① `youtube-data-sync.yml` `paths-ignore: youtube_exports/**` ② 두 워크플로우 `concurrency.group: youtube-data-pipeline` 공유 ③ `api_data_shuttler.py` write guard (`_reach_load_ok`) — `get_all_records()` 실패 시 `clear()` 차단 | ✅ |
| **download_studio_csv.py v5.1** | ① 드롭다운 선택 `"365일"` (존재하지 않는 텍스트) → `"전체"` (게시 이후 / all-time) ② 다운로드: `Page.setDownloadBehavior` + ZIP 폴링 (CDP 모드 실패) → `page.expect_download()` 전환 | ✅ |
| **최근 영상 게시이후 2시간 자동화** | `download_recent_video_studio.py` 신규. _RawData_Master → 최근 video_id → Studio 개요+도달범위 탭 DOM 추출 → impressions/ctr cell-by-cell 업데이트. `sync_studio_csv.sh` post-sync A 단계로 통합. LaunchAgent 2시간 주기 기존 인프라 활용. | ✅ |

---

### NOW (현재 진행 중)

**[1] 우측 패널 / 외부 유입 기능 연결 마감**
- `externalDrop` runtime 계산 복구 완료
- 우측 패널 `external` 탭에서 외부 유입 비중 + ExternalTrafficInsightsPanel 임베드 표시 완료
- 외부 인사이트 카드 / 전환율 카드 / 캠페인 / 커뮤니티 / 콘텐츠 반응 row → 대표 `target_video` 기준 `VideoDetailModal` 드릴다운 연결 완료

**[2] 구현 우선순위 재정렬**
- 2026-03-22 개선 보고서
- 2026-03-23 P0 실행계획표
- 2026-03-23 UIUX 와이어프레임
- 현재 코드 상태

위 4개를 대조해, 아래 "통합 구현 순서표"를 단일 진실로 사용한다.

---

### NEXT — 통합 구현 순서표

| 순서 | 과제 | 분류 | 현재 상태 | 산출물 |
|------|------|------|-----------|--------|
| **1** | 외부 유입 마지막 드릴다운 연결 | 🔴 P0 | ✅ 완료 | 외부 인사이트/캠페인/커뮤니티 row → `VideoDetailModal` |
| **2** | `RightSidePanel.tsx` 구조 분해 | 🔴 P0 | ✅ 완료 — `external` / `kpi inspector` / `top videos` / `retention` 분리, 747줄까지 축소 | section 파일 분리 + 단일 패널 책임 축소 |
| **3** | `computeChannelHealth()` 엔진 분리 + 산식 문서화 | 🔴 P0 | ✅ 완료 — `src/engine/channelHealthEngine.js`로 분리, 4-pillar 산식 독립 | 별도 score engine + 규격 문서 |
| **4** | 남은 드릴다운 진입점 전수 통일 | 🔴 P0 | 진행 중 — 핵심 화면은 `VideoDetailModal` 종착, 일부 레거시/context 통일 남음 | 모든 영상 진입점의 종착지 `VideoDetailModal` |
| **5** | PHASE 10-C/D Electron OS 알림 | 🟡 P1 | 진행 중 — `critical` / `external drop` OS 알림 브릿지 연결 완료 | `main.js` IPC + 알림 트리거 |
| **6** | PHASE 10-F EXTERNAL_DROP 자동 리포트 | 🟡 P1 | 외부 급감 탐지는 됨, 후속 리포트 자동화 없음 | Redirect 리포트 생성 + task/alert 연결 |
| **7** | Discord Bot Command Layer | 🟡 P1 | Watchdog는 동작, 명령형 제어 없음 | `/watchdog scan/apply/rollback/status` |
| **8** | VideoTrafficAdapter + per-video 유입경로 상세 | 🟠 P2 | 채널/패널 수준 외부 유입은 보임 | 영상 단위 유입경로를 `VideoDetailModal`에 연결 |
| **9** | Golden Hour Level 3 — 업로드 후 6시간 실시간 트래킹 | 🟠 P2 | 추천/리듬은 있음, 실시간 추적은 없음 | 업로드 후 6시간 감시 뷰 |
| **10** | 번들 크기 경고 해소 + 코드 스플리팅 | 🟠 P2 | 기능 문제는 없지만 경고 지속 | Dashboard/Modal/legacy split |

---

### BACKLOG — P2/P3

| 순위 | 과제 | 분류 |
|------|------|------|
| 1 | AlgorithmFitPanel (핏 스코어) + ThumbnailABTracker | 🟠 P2 |
| 2 | Token 마이그레이션 — deprecated alias(`T.text/sub/muted`) → `T.fg.*` 전환 | 🟠 P2 |
| 3 | Threshold adaptive baseline | ⚪ P3 |
| 4 | Pattern OS — 이미지 분석 → AI 썸네일 패턴 추천 | ⚪ P3 |
| 5 | Block Manager UX v3 구현 (Section 3 설계 완료) | ⚪ P3 |
| 6 | OpportunityPanel — 알고리즘 핏 스코어 기반 기회 영상 추천 | ⚪ P3 |
| 7 | EarlyPerformancePanel — 업로드 후 조기 성과 전용 뷰 | ⚪ P3 |

---

### CONTROL TOWER 판정

지금부터 우선순위는 더 이상 "UI 다듬기"가 아니라 아래 3축이다.

1. 드릴다운 완결
2. 엔진 분리와 규격화
3. 자동화 후속 실행

즉, 다음 실제 구현 순서는
`전수 드릴다운 통일 → OS 알림/외부 리포트 자동화 → Discord 명령 레이어`
로 진행한다.

---

### ChannelHealth 엔진 규격

- 구현 위치: `soundstorm-panel/src/engine/channelHealthEngine.js`
- 책임: `computeChannelHealth(diagnostics, kpiHistory, videoDiagnostics)` 단일 진입점
- 점수 구조: `BASE 50 + P1 채널 기준 + P2 트렌드 + P3 절대 기준 + P4 진단 이슈`
- P1: 조회수/구독자/알고리즘 점수의 채널 평균 대비 상대 성과
- P2: 최근 주차 기준 조회수/구독자/알고리즘 추세
- P3: 채널 평균 CTR/시청유지율의 최소 절대 기준
- P4: `CRITICAL/HIGH/MEDIUM` 진단 가중치 감점 또는 이슈 없음 보너스
- 출력 계약: `score / grade / label / breakdown / pillarScores / trend / topIssue / insufficient`

---

## 3. DESIGN SYSTEM

### 3-A. Dashboard v12 레이어 구조

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[STICKY] CriticalAlertBanner (CRITICAL severity 존재 시만)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[0] ActionCommandBar (항상 표시 — 실행 진입점)
    1 PRIMARY (44px, colored) + 2 SECONDARY chips (Hick's Law)

[1] execution 블록 — 단일 카드 1fr|1fr 내부 그리드
    좌 1fr: ExecutionPanel (콘텐츠 실행 — 최근 업로드 성과 테이블)
    우 1fr: NextUploadCard (다음 업로드 추천 + 골든아워 통합)
           └─ 의사결정: max_delay = avgInterval × 0.5
           └─ 골든아워 delay ≤ max_delay → "최적 타이밍" / else → "리듬 유지 우선"
           └─ 대안 옵션 선택 + 요일 바차트

[2] ChannelPulseRow (1줄 compact)
    클릭 → KPI 카드 + ActionResultPanel + StrategyInsightsPanel 확장

[3] DiagnosticsSection (이슈 있을 때만)
    ImpressionDropPanel / CTRAlertPanel / RetentionDropPanel / CampaignPerformancePanel

[4] ContentPackManager

[5] 분석 근거 (기본 접힘)
    PortfolioSection / GrowthPanel / AlgorithmFitPanel(❌)

[6] 로우 데이터 (기본 접힘)
    EarlyPerformanceCompact / DashboardGrid / VideoDetailModal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**구조 변경 근거 (2026-03-20):**

| 기존 문제 | 해결 방식 |
|---|---|
| YouTube 탭 ↔ Dashboard 탭 기능 중복 | YouTube 탭 제거 → Dashboard 단일 진입점 |
| 상위 700px에 실행 버튼 없음 | ActionCommandBar + CriticalAlertBanner 최상단 배치 |
| 버튼 12px, 클릭 동기 부재 | 44px CTA, 1 PRIMARY (Hick's Law) |
| 진단 → ThumbnailWorkflow 연결 없음 | autoExpandVideoId prop chain 구현 |

---

### 3-B. Token System

참조: `src/styles/tokens.js` (T 네임스페이스) · 권위 문서: `02_ARCHITECTURE/TOKENS_SYSTEM.md`

**v1.1 적용 현황 (2026-03-21)**

| 토큰 그룹 | 현재 상태 |
|-----------|-----------|
| `T.spacing` | xs:4 / xxs:6(micro) / sm:8 / md:12 / lg:16 / xl:24 / xxl:32 — 확정 |
| `T.radius` | badge:4 / btn:6 / input:6 / card:16 / pill:999 / panel:0 — 확정 |
| `T.font.size` | v1.1 키 추가: `base:16 / lg:18 / xl:20 / xxl:28 / display:40`. 구 키(md/title/hero) deprecated alias 유지 |
| `T.font.weight` | regular/medium/semibold/bold — 800 사용 금지 |
| `T.motion` | `duration:"0.3s"` / `default:"0.3s ease"`. **0.15s/0.25s 사용 금지** |
| `T.shadow` | card / hover — 이 2개 외 남용 금지 |
| `T.fg.*` | T.fg.primary / sub / muted — 신규 컴포넌트 권장 (T.text/sub/muted deprecated 예정) |

**ESLint 강제 규칙 (eslint.config.js)**

| 규칙 | 대상 |
|------|------|
| hex 직접 작성 금지 | color / background / backgroundColor / borderColor |
| fontSize/fontWeight 숫자 금지 | → `T.font.size.*` / `T.font.weight.*` |
| borderRadius 숫자 금지 (0 제외) | → `T.radius.*` |
| gap 숫자 금지 | → `T.spacing.*` |
| marginBottom/Top 숫자 금지 | → `T.spacing.*` |
| padding px 문자열 금지 | → `` `${T.spacing.md}px ${T.spacing.xl}px` `` 형식 |
| transition 0.15s/0.25s 금지 | → `T.motion.duration` / `T.motion.default` |

**시각 계층 규칙 (2026-03-21 확정)**

| 레벨 | 배경 | 용도 |
|------|------|------|
| Level 1 (핵심) | `T.bgCard` (흰색) + `T.shadow.card` | KPI 카드, execution 카드 (NextUploadCard 포함) |
| Level 2 (보조) | `T.bgSection` (연회색) | 내부 구분 영역 |
| Level 3 (배경) | `T.bgApp` (더 연한) | 페이지 캔버스 |

**색상 역할 제한**

| 색상 | 역할 |
|------|------|
| 파랑 (T.primary) | CTA / 선택 상태만 |
| 초록 (T.success) | 긍정 상태 / 달성 / 골든아워 히어로 |
| 주황 (T.warn) | 경고 |
| 빨강 (T.danger) | 에러 / CRITICAL |
| 회색 | 그 외 모든 것 |

| 기타 규칙 | 내용 |
|-----------|------|
| Touch target | 44px (버튼 개별) 또는 h-14=56px (컨테이너) |
| Z-index scale | 10 / 20 / 30(topbar) / 50(overlay) |
| Brand color 예외 | YouTube Red(#FF0000) / Naver Green(#03C75A) — 반드시 주석 명시 |

---

### 3-C. 미해결 UI 이슈

| ID | 문제 | 위치 | 수정 방향 |
|----|------|------|-----------|
| **H-3** ✅ | TodayBriefCard 버튼 클릭 시 VideoDetailModal이 예측 없이 열림 | `DashboardPage.tsx → handleStrategyAction()` | diagSectionRef.scrollIntoView + setDiagHighlighted(2초) 구현 완료 |
| **M-5** ✅ | ActionCommandBar 클릭 후 시각 피드백 없음 | `DashboardPage.tsx → handleCommandAction()` | setActionStartedId + setDiagHighlighted 2초 하이라이트 구현 완료 |
| **H-2** 🟡 | ChannelPulseRow 분석 토글 레이아웃 점프 | `DashboardPage.tsx` analyticsContentRef | 내부 div에 `opacity T.motion.duration ease 0.05s` 추가 필요 |
| **H-1** ✅ | Token 네임스페이스 혼재 (`T.*` vs `T.color.*`) | 전체 컴포넌트 | v1.1 namespace 확정 + ESLint 강제. 기존 컴포넌트 deprecated alias 유지 (2026-03-21 완료) |

---

## 4. CONTENT ENGINE

프롬프트 엔진별 데이터 디렉토리. 각 엔진은 동일한 파일 구조를 갖는다:
`PROFILE.md` / `keywords.json` / `variables.json` / `templates.md` / `examples.md`

| 엔진 | 경로 | 상태 |
|------|------|------|
| **midjourney** (썸네일 이미지 생성) | `00_WORKSPACE/midjourney/` | ✅ 완료 — 6개 파일 구조화됨 |
| **youtube_title** (제목 / SEO / 해시태그) | `00_WORKSPACE/youtube_title/` | ❌ 미완료 — 원본: `제목_예시.md` |
| **suno** (음악 프롬프트 생성) | `00_WORKSPACE/suno/` | ❌ 미완료 — 원본: `suno_prompt.md` |

> `youtube_title/`와 `suno/`는 `midjourney/` 구조를 템플릿으로 데이터화 예정.
> 원본 파일은 각각 `제목_예시.md`, `suno_prompt.md`에 raw data로 존재.

---

## 5. STRATEGY

### 5-A. CTR / Thumbnail 전략

**참조 기준 영상:** 척살II CTR 9.66% / 군주 CTR 9.05%

| 임계값 | 분류 | 액션 |
|--------|------|------|
| CTR < 4% | DANGER | ThumbnailWorkflowPanel 즉시 교체 시작 |
| CTR 4~5% | WARN | 모니터링 + 교체 검토 |
| CTR ≥ 5% | 정상 | 유지 |

**썸네일 패턴 (조회수 4만 기준):**
- 1~2글자 한자/한국어 + 강렬한 장면 = 최고 CTR
- 예: 척살, 군주, 혈전, 격돌, 결전

---

### 5-B. 콘텐츠 전략 문제-솔루션

| 문제 | OS 솔루션 | 현황 |
|------|-----------|------|
| 비타겟 바이럴 역효과 | 트래픽 소스 이상 감지 + CampaignPerformancePanel | ✅ 완료 |
| 신규 영상 CTR 3%대 | CTR 경보 + 골든아워 대시보드 | CTR ✅ / 골든아워 ❌ |
| 노출 집중 불균형 | AlgorithmFitPanel (핏 스코어) | ❌ 미구현 |
| 구독 전환율 붕괴 | Content Pack 생성 CTA | ❌ 미구현 |
| 노출 급락 사후 대응 없음 | CRITICAL 자동 알림 + EXTERNAL 리포트 | alert ✅ / 리포트 ❌ |
| **CTR/impressions 항상 0 (—) 표시** | **원인:** CSV push 시 `youtube-data-sync.yml` + `reach-data-sync.yml` 동시 트리거 → `api_data_shuttler.py`가 `get_all_records()` 후 `clear()` + `update()` 실행 중 `ingestor`가 아직 미실행 상태 → impressions=0으로 확정. **해결:** ① paths-ignore로 동시 트리거 제거 ② concurrency group 공유로 순차 실행 보장 ③ write guard로 읽기 실패 시 덮어쓰기 차단 | ✅ 완료 (2026-03-22) |
| **Studio CSV 기간 불일치 (게시 이후 미반영)** | **원인:** `download_studio_csv.py`가 `"365일"` 텍스트 선택 시도 → 실제 드롭다운 텍스트는 `"지난 365일"` / `"전체"`, `page.expect_download()` 미사용으로 ZIP 캡처 실패. **해결:** 드롭다운 `"전체"` 선택 (= 게시 이후 all-time), `page.expect_download()` 전환 | ✅ 완료 (2026-03-22) |
| **최근 영상 게시이후 데이터 공백** | **원인:** 채널 전체 CSV는 1일 1회 전체 집계 → 최근 영상은 데이터 반영 지연 최대 24h. **해결:** `download_recent_video_studio.py` — 2시간마다 최근 video_id 자동 조회, Studio 개요+도달범위 탭 DOM 추출(`1.4천` 한국어 수 파싱), `_RawData_Master` cell-by-cell 직접 업데이트. LaunchAgent 기존 2시간 인프라 재사용 (post-sync A 단계) | ✅ 완료 (2026-03-22) |

---

## 6. RUNTIME DATA

### 6-A. 채널 현황 (2026-02-15 ~ 03-14 기준)

| 지표 | 수치 | 비고 |
|------|------|------|
| 총 조회수 | 15,155 (58개 영상) | |
| 총 노출수 | 149,245 | |
| 평균 CTR | 5.53% | 수치 양호, 내부 격차 심각 |
| 구독자 증가 | +43 | 채널 규모 대비 심각 |
| 예상 수익 | $6.58 | |

| 구간 | 기간 | 일평균 | 핵심 이벤트 |
|------|------|--------|------------|
| 초기 상승기 | 02/15~18 | 736 | 만검돌격 외부 바이럴 유입 |
| 급락기 | 02/19~28 | 443 | 알고리즘 신뢰도 하락 |
| 반등기 | 03/01~09 | 566 | 출정 업로드 효과 |
| 재하락기 | 03/10~14 | 470 | 신호 유지 실패 |

---

### 6-B. 하락 원인

| # | 문제 | 원인 | 현황 |
|---|------|------|------|
| 1 | 만검돌격 비타겟 바이럴 | 디스코드/ARCA 비타겟층 → 채널 신뢰도 하락 | ✅ CampaignPerformancePanel |
| 2-A | 신규 영상 CTR 3%대 | 업로드 후 CTR 감시 없음 | ✅ CTRAlertPanel |
| 2-B | 골든아워 초기 대응 없음 | 업로드 후 6시간 추적 없음 | ❌ BACKLOG P2 |
| 3 | 노출 집중 불균형 (척살+만검=34%) | 알고리즘 핏 추적 없음 | ❌ BACKLOG P2 |
| 4 | 구독 전환율 붕괴 (+43/30일) | 후속 콘텐츠 연결 없음 | ❌ BACKLOG P3 |

---

### 6-C. 시스템 리스크

| 리스크 | 상태 | 현재 대응 |
|--------|------|-----------|
| Threshold 고정값 | 미해결 (P3) | MEDIUM -20% / HIGH -40% / CRITICAL -60% 고정. `alert_config.py` 분리 예정 |
| PHASE 10-C/D (OS 알림) | 미구현 | 이메일 알림으로 대체 중 |
| EXTERNAL_DROP 리포트 | 미구현 | 수동 Redirect Tracker 확인 |
| GoldenHour Level 3 | 미구현 | Level 4 타이밍 추천으로 부분 커버 |

---

## 7. CHANGELOG

| 날짜 | 내용 |
|------|------|
| 2026-03-23 | **Discord Bot 1차 명령 스펙 고정** — 1차 명령을 `/watchdog scan`, `/watchdog status`, `/watchdog apply`, `/watchdog rollback` 4개로 제한. `scan mode:safe notify:true`, `apply proposal_id:xxx apply_key:xxx` 형태 채택. 필수 안전장치로 사용자 ID 화이트리스트, 역할 체크, `apply/rollback` 관리자 제한, lock 파일, 명령 실행 로그, subprocess timeout, stdout/stderr 요약 전송 + 원문 파일 저장, 마지막 proposal 자동 기억, rollback 1회 제한을 명시. 구현 전략은 1차 subprocess 우선, 이후 공통 함수 분리로 전환 |
| 2026-03-23 | **Discord 실행 계층 구현안 추가** — 현재 Webhook 기반 Latest Watchdog는 알림만 가능하므로, 휴대폰 Discord에서 직접 실행하기 위한 `discord_watchdog_bot.py` 계획 추가. 방향은 `Webhook(알림 유지) + Bot(실행 전용)` 2층 구조. 1차 명령: `/watchdog scan`, `/watchdog status`, `/watchdog apply`, `/watchdog rollback`. `apply/rollback` 은 role/user 화이트리스트와 동시 실행 방지 락을 전제로 구현 |
| 2026-03-23 | **Discord 중심 Latest Video Watchdog 구축** — `07_AUTOMATION_자동화/automation_runtime/latest_video_watchdog.py` 신규. `03_RUNTIME/active_uploads.json` 에서 최신 영상 1개 선택 → `_RawData_Master` / `Video_Diagnostics` / `Channel_CTR_KPI` 교차 읽기 → `observe / title_test / thumbnail_test / repackage_both / content_issue` 판정 → `latest_video_watchdog_proposal.json` 저장. `discord_notifier.py` 추가로 Discord 웹훅 경보 지원. `apply` 명령은 YouTube OAuth 토큰이 수정 권한 스코프를 포함할 때 `videos.update` / `thumbnails.set` 실행, `rollback`은 `03_RUNTIME/rollback/<proposal_id>/backup.json` 스냅샷으로 복구 |
| 2026-03-23 | **Dashboard decision-driven UX 리팩토링** — 중복 판단 UI 정리. `PrimaryActionHero` / `TodayDecisionCard` / `ChannelDecisionWorkspace` 제거 또는 비활성화, `Status Strip = 상태`, `KPI Panel = 수치`로 역할 분리. 상단 구조를 `AnalyticsHeader + Channel Health + KPI + Performance Drivers` 중심의 얇은 운영 패널로 재배치. `채널 건강도` 독립 우측 칸 제거 → KPI 본체 내부 compact strip으로 병합. 중복 `다음 업로드 추천` 단독 패널 제거 후 execution 블록 내부 패널만 유지 |
| 2026-03-23 | **KPI 카드/우측 Inspector 재설계** — KPI 카드 내부 확장 상세 제거, 클릭 시 `RightSidePanel`에 KPI 전용 inspector 오픈하도록 흐름 변경. `DashboardDiagFilterContext` + `useDashboardInteractions`에 `selectedKpiInspector` 상태 추가, `KPICards.tsx`는 요약 카드 역할만 수행. 우측 패널 동적 섹션 `kpi` 추가, 제목을 `조회수 진단` / `CTR 진단` / `시청시간 진단` / `구독자 진단` 등 KPI별 진단명으로 표기. Inspector 본문은 `근거 지표 / 원인 / 다음 액션 / 성과 저조 영상`으로 재구성 |
| 2026-03-23 | **NextUploadCard 추천 로직 보정** — 추천 기준을 주간 슬롯 우선에서 `가장 최근 업로드일 + 2일` cadence 우선으로 수정. 상단 메인 추천 날짜/시간, 기본 추천 옵션, 라벨이 모두 cadence slot을 따르도록 정렬. `시청 피크` 요일 막대는 성과순이 아니라 `월→화→수→목→금→토→일` 고정 정렬로 변경, 오늘 요일 별도 강조 추가 |
| 2026-03-23 | **Token System 적용 범위 확대 + 런타임 버그 수정** — `tokens.js`에 `T.component.size/radius/surface/shadow/palette`, `T.semantic.surface`, modal/drawer/scrim/text-outline 계층 추가 후 대시보드 핵심부·우측 패널·Execution·모달/드로어까지 토큰 위반 3차 정리. `T.component`를 두 번 할당하면서 `palette`가 덮여 대시보드가 열리지 않던 런타임 버그 수정 (`T.component = { ...T.component, ... }` 병합 방식으로 변경). build 기준 대시보드 재정상화 확인 |
| 2026-03-23 | **운영 패널 압축 + 컬러 감산** — `KPICards.tsx`에서 Core/Supporting 분리 제거, 모든 KPI 숫자 크기를 보조지표 수준으로 통일해 더 납작한 운영 밴드화. `ExecutionPanel` / `ExecutionStatus` / `RecentUploadsTable` 행 높이·간격 축소. `RightSidePanel`은 폭을 340→312로 조정하고 `width: min(..., 100vw - 24px)` + `overflowX: hidden`으로 좁은 창 잘림 방지. KPI inspector와 KPI 카드의 과한 파랑/주황/빨강 surface를 줄이고, `본문 중립색 + 상태색 제한 사용` 방향으로 재정렬 |
| 2026-03-22 | **CTR/impressions Race Condition 수정** — 원인: CSV push 시 `youtube-data-sync.yml`(paths 필터 없음) + `reach-data-sync.yml` 동시 트리거 → `api_data_shuttler.py`가 ingestor 실행 전 impressions=0 상태로 `clear()` + `update()` → 데이터 소실. 3-layer hardening 적용: ① `youtube-data-sync.yml` `push.paths-ignore: 07_AUTOMATION_자동화/youtube_exports/**` 추가 (CSV push 시 중복 트리거 제거). ② 두 워크플로우 `concurrency.group: youtube-data-pipeline` 공유 (순차 실행 보장). ③ `api_data_shuttler.py` write guard 추가 — `get_all_records()` 실패 시 `_reach_load_ok = False` 플래그로 `clear()` + `update()` 차단, 기존 데이터 보존 |
| 2026-03-22 | **download_studio_csv.py v5.1** — ① `_select_365_days()` → `_select_all_time()`: 드롭다운 "전체" 선택 (= 게시 이후 / channel-level all-time). 기존 `get_by_text("365일", exact=True)` 버그 제거 (실제 텍스트 "지난 365일"). ② 다운로드 메커니즘 `Page.setDownloadBehavior` + ZIP 파일 폴링 → `page.expect_download()` 전환 (CDP 모드 안정 동작 확인). 전체 기간 데이터 로드 대기 타임아웃 60s → 90s |
| 2026-03-22 | **NextUploadCard 통합** — (1) `NextUploadCard.tsx` 신규 생성: 기존 ExecutionStatus 우측 "다음 업로드" 컬럼 + TodayBriefCard 골든아워를 단일 컴포넌트로 통합. 의사결정 로직: `max_delay = avgIntervalDays × 0.5`, `golden_delay ≤ max_delay → "최적 타이밍 선택됨"`, else → `"리듬 유지 우선 선택됨"`, `isOverdue → "즉시 업로드 필요"`. 대안 옵션 2개(리듬 슬롯 vs 골든 슬롯) 클릭 선택, 효율 delta 표시, 요일 바차트. `noCard` prop으로 카드 래퍼 분리. (2) `ExecutionStatus.tsx`: 우측 "다음 업로드" 1fr 컬럼 제거 → 테이블 전체 너비. (3) `blockRegistry.tsx` execution 블록: 단일 외부 카드(`bgCard+border+borderRadius+boxShadow`) + 내부 `1fr 1fr` 그리드로 ExecutionPanel(좌)·NextUploadCard(우) 배치, 중간 `borderSoft` 구분선. strategy 블록에서 TodayBriefCard 제거, ChannelStatusPanel만 유지. (4) `ExecutionPanel.tsx`: `noCard` prop 추가, content/wrapper 분리 |
| 2026-03-22 | **ChannelStatusPanel 드릴다운** — `StrategyPanel.tsx` → `ChannelStatusPanel.tsx` 이름 변경. 4카드(THUMBNAIL_WEAK/TITLE_DISCOVERY_WEAK/CONTENT_RETENTION_WEAK/ALGORITHM_DISTRIBUTION_LOW) 클릭 → 해당 진단 영상 리스트 펼침 → VideoDetailModal 연결. `fetchVideoTitleMap()` 연동으로 영상 제목 표시 (`_VID_RE=/^[a-zA-Z0-9_-]{11}$/` 로 raw videoId 필터링). orphan 파일 `ContentStrategyPanel.tsx` / `StrategyInsightsPanel.tsx` 삭제. RightSidePanel "채널 전략" → "콘텐츠 전략" 탭명 변경 |
| 2026-03-22 | **TodayBriefCard 단순화** — "오늘의 전략" 섹션 제거. props: `goldenHour`만 유지 (strategy/healthGrade/onAction 제거). `getGoldenState` 과거 시간 → null 반환 (무의미한 카운트다운 제거). `getNextDateLabel()` 추가 → 다음 발생 날짜 "금 (3/27)" 형식 표시. `strategyEngine.js` `BASE_DAY_SCORES` uploadHour 시간 범위 → 단일 시간값으로 통일 |
| 2026-03-22 | **최근 영상 게시이후 2시간 자동화** — `download_recent_video_studio.py` 신규. 흐름: `_RawData_Master` upload_date DESC → 최근 video_id 확정 → Studio 개요 탭(`tab-overview?time_period=since_publish`) 직접 진입(안정) → 도달범위 탭 클릭 + 재시도 → DOM `TreeWalker` 텍스트 수집 → `1.4천` 한국어 수 파싱(`parseKorNum`) → impressions=1,400 / ctr=6.1% 추출 → `_RawData_Master` `update_cell()` (cell-by-cell, DATA_RULES 준수). 실패 시 Export 버튼 CSV 다운로드 폴백. `sync_studio_csv.sh` post-sync A 단계로 통합 (Chrome 종료 전 실행). LaunchAgent `com.soundstorm.studio-sync` 기존 2시간(7200s) 인프라 재사용 — 별도 스케줄러 추가 없음. |
| 2026-03-22 | **UpdateStatusBar 3항목 재명명** — 4항목 → 3항목 병합. `데이터 정상`(Sheets 앱 연결) + `시트 정상`(`_Pipeline_Health` 탭) → **시트 싱크**로 통합 (`calcSheetsAndPipelineStatus`: 최악 상태 우선). 레이블 전면 변경: 자동화→**API 싱크**(`youtube-data-sync.yml`) / 데이터·시트→**시트 싱크** / CTR→**스튜디오 싱크**(`reach-data-sync.yml`). 표시: "🟢 API 싱크 정상 · 시트 싱크 정상 · 스튜디오 싱크 정상" |
| 2026-03-21 | **CTR CSV 파이프라인 완성** — (1) `download_studio_csv.py`: `networkidle` → `domcontentloaded` 전환 (Studio에서 networkidle 영구 pending), 재시도 버튼 클릭 로직 제거 (데이터 로드 리셋 방지), `--disable-background-mode` 플래그 제거 (Analytics 타이머 차단 원인), 탭 재사용 제거 → 항상 `new_page()`, Export 버튼 `aria-label*=` 부분 일치 탐지. (2) `generate_active_uploads.py`: CTR null → 쿨다운 무시 강제 CSV 다운로드, 한국어 CSV 컬럼(`콘텐츠`=video_id, `노출 클릭률 (%)`=CTR) 파싱, `csv_ok` 조건 제거→`_RECENT_CSV.exists()` 직접 체크, `writeback_ctr_to_master()` 추가(impressions+ctr+ctr_source+ctr_updated_at, cell-by-cell), dirty flag → 변경 있을 때만 `video_diagnostics_engine.py` 재실행. (3) `sync_studio_csv.sh`: git push 후 `generate_active_uploads.py` 자동 후처리 추가 |
| 2026-03-21 | **GoldenHour Inline Badge** — `RecentUploadsTable.tsx`에 `GoldenHourBadge` 컴포넌트 인라인 구현 (⚡ ≤6h 초록 / ⏱ >6h 주황). `ExecutionPanel.tsx`에서 `readActiveUploads()` IPC 로드. `ActiveUploadMonitor` 독립 블록 → blockRegistry에서 완전 제거 (import + JSX 삭제) |
| 2026-03-21 | **_RawData_Master 컬럼 추가** — `ctr_source` (col 21), `ctr_updated_at` (col 22) 신규 헤더 등록 |
| 2026-03-21 | **보고서 상태 동기화** — 코드베이스 검증으로 미표기 완료 항목 9건 확인: TodayActionController / DashboardDiagnosticsController(useDiagnosticsController) / NavigationContext(navigateToPanel) / H-3 / M-5 / ControlPanel 삭제 / DailyStrategyPanel 삭제 / YouTubeKpiStrip 삭제 / PHASE 9B StrategyPanel. NEXT 5건→1건으로 축소, BACKLOG 13→10건으로 정리 |
| 2026-03-21 | **Design System v1.1 적용** — TOKENS_SYSTEM.md 기준 전면 정비. (1) tokens.js: font.size v1.1 키(base/lg/xl/xxl/display) 추가, motion.default shorthand 추가. (2) ESLint: gap/marginBottom/padding px/transition 0.15s 금지 규칙 7개 추가. (3) 카드 시각 계층 확정: KPI카드 bg→white+shadow, TodayBriefCard 골든아워 패널 흰색+초록 액센트 히어로화. (4) DashboardView/KPICards/TodayBriefCard 토큰 위반 전수 수정 (fontSize literal, fontWeight:800, fontFamily:"monospace", padding px string, transition 0.15s). (5) H-1 미해결 이슈 → ESLint 강제로 완료 처리 |
| 2026-03-21 | **Panel Title 표준화** — ContentStrategyPanel 스타일 기준으로 14개 패널 헤더 통일 (xs/familyMono/bold/T.sub/letterSpacing:0.06em) |
| 2026-03-21 | **제품 관점 리팩토링 분석 (Section 10)** — 행동 단위 재정의 8가지. TodayActionController + DashboardDiagnosticsController 신규 설계. 중복 3건 확정 (전략패널 4개 / KPI 3개 / ControlPanel 데드코드), 흐름 끊김 3곳 문서화 |
| 2026-03-21 | **문서 구조 재편** — PART 0~27 → 0-7 섹션 구조 전환. 마스터 보고서 + Master Spec v5 통합 기반 |
| 2026-03-20 | **Block System (STAGE 4)** — blockRegistry + DashboardData 계약 + ThemeIntelligenceEngine + UploadAssistant v2 + GrowthLoopMonitor |
| 2026-03-20 | **VideoDetailModal 판정 허브** — TrackingRow + GrowthBadge + FailureLearningNote + buildSelectedVideo 전수 수정 |
| 2026-03-20 | **추천 점수 시스템** — computeRecommendationScore (Bayesian × 골든아워 × 긴급도) + 131 tests PASS |
| 2026-03-20 | **ActionConfirmModal** — 완료 확인 + viewed/complete/skip 퍼널 기록 |
| 2026-03-20 | **Dashboard v12** — CriticalAlertBanner + ActionCommandBar + TodayBriefCard + ChannelPulseRow + computeDecisionBar |
| 2026-03-20 | **GoldenHour Lv.4** — 업로드 heatmap × 시청 피크 (60:40) + KST 타임존 버그 수정 |
| 2026-03-20 | **strategyEngine 안정화** — typedef + factory + 34개 테스트 추가 (총 131 PASS) |
| 2026-03-20 | **Video ID 제목 표시 버그** — strategyEngine _safeTitle() + 10개 UI 파일 방어 |
| 2026-03-19 | **Diagnostics A~G** — 3축 진단 (IMPRESSION/CTR/RETENTION) + alert_engine + action_tracker + 7/7 PASS |

---

## 8. AI WORK CONTEXT

> 이 섹션은 AI가 작업 시작 전 읽는 온보딩 페이지.
> 코드베이스 구조, 핵심 파일 경로, NEXT 항목 구현 상세를 담는다.

---

### 8-A. 핵심 파일 맵

#### React / TypeScript (soundstorm-panel/src/)

| 파일 | 역할 |
|------|------|
| `pages/DashboardPage.tsx` | 메인 진입점 — DashboardData/Actions 조립 + Block 렌더. 비즈니스 로직 없음 |
| `engine/strategyEngine.js` | computeDecisionBar / computeChannelHealth / computeGoldenHour / computeDailyStrategy |
| `dashboard/blockRegistry.tsx` | BlockId → component(data, actions) 레지스트리. 새 기능은 여기에만 등록 |
| `types/dashboardData.ts` | DashboardData (읽기 전용) + DashboardActions (핸들러) 타입 계약 |
| `types/dashboardBlock.ts` | BlockId 타입 + BLOCK_DEFS 배열 (순서 = 화면 렌더 순서) |
| `hooks/useDashboardBlocks.ts` | 블록 가시성 상태 — localStorage("soundstorm_dashboard_blocks") 영속화 |
| `core/types/contentPack.ts` | ContentPack 인터페이스 + ContentPackStatus + 상태 전이 규칙 |
| `controllers/useContentPackController.ts` | Pack CRUD + AUTO 생성 + 성과 동기화 (reducer 기반) |
| `controllers/ContentPackContext.tsx` | ContentPackProvider — ContentPackManager/GrowthLoopMonitor 상태 공유 |
| `controllers/useAnalyticsController.ts` | period 변경 → fetchAnalytics() 재호출, stale 방지 periodRef |
| `engines/packPerformanceEngine.ts` | Pack 성과 점수 계산 (CTR×0.4 + Retention×0.4 + Velocity×0.2) |
| `engines/hypothesisEngine.ts` | 가설 신뢰도 계산 (confidence = sample × score × CTR weight) |
| `engines/themeIntelligenceEngine.ts` | 4레이어 테마 추천 (hypothesis + performance + momentum + opportunity) |
| `services/youtubeAnalyticsService.ts` | fetch-yt-performance IPC → YouTube Analytics API 호출 |
| `styles/tokens.js` | T 네임스페이스 전체 — 모든 컴포넌트는 이 파일만 참조 |

#### Dashboard 컴포넌트 (components/dashboard/)

| 파일 | 역할 |
|------|------|
| `CriticalAlertBanner.jsx` | CRITICAL severity 존재 시 sticky 배너. dismiss 가능 |
| `ActionCommandBar.jsx` | 1 PRIMARY + 2 SECONDARY CTA. computeDecisionBar 출력 렌더 |
| `TodayBriefCard.jsx` | 골든아워 전용 카드. props: `goldenHour`만. 다음 날짜("금 (3/27)") + 카운트다운. 과거 시간 표시 없음 |
| `NextUploadCard.tsx` | 다음 업로드 추천 통합 카드. 골든아워 의사결정(max_delay 로직) + 대안 옵션 + 요일 바차트. execution 블록 우측 1fr |
| `ChannelStatusPanel.tsx` | 채널 상태 4카드 + 드릴다운. THUMBNAIL/TITLE/RETENTION/ALGORITHM 진단 영상 리스트 → VideoDetailModal 연결. `fetchVideoTitleMap()` 영상 제목 해결 |
| `UpdateStatusBar.tsx` | 3항목 신뢰도 바: **API 싱크**(`youtube-data-sync.yml`) · **시트 싱크**(Sheets 연결+`_Pipeline_Health` 탭 병합) · **스튜디오 싱크**(`reach-data-sync.yml`) |
| `ChannelPulseRow.jsx` | 채널 건강도 1줄 compact. 클릭 → KPI/ActionResult 확장 |
| `DashboardDiagnosticsSection.jsx` | ImpressionDrop + CTRAlert + RetentionDrop + Campaign 허브 |
| `VideoDetailModal.tsx` | 영상 드릴다운. DiagnosticsBadge + ActionItems + TrackingStatus |
| `SaveStatusBadge.tsx` | lastSavedAt / saveError 시각화. Block Manager 버튼 좌측 |
| `UploadAssistant.tsx` | ready 팩 + YouTube API 자동 매핑 (title 유사도 ≥30% → video_id 세팅) |
| `GrowthLoopMonitor.tsx` | 9단계 성장 루프 시각화. ContentPackContext에서 packs 읽음 |

#### Python 자동화 (07_AUTOMATION_자동화/)

| 파일 | 역할 |
|------|------|
| `scripts_스크립트/api_data_shuttler.py` | 메인 파이프라인 — YouTube API → Google Sheets. VTS_Log append-only |
| `scripts_스크립트/sync_studio_csv.sh` | CDP Chrome 시작 → download_studio_csv.py 실행 → git push → generate_active_uploads.py 후처리 |
| `scripts_스크립트/download_studio_csv.py` | Playwright로 YouTube Studio Analytics Export 버튼 클릭 → CSV 다운로드 (`studio_reach_report_recent.csv`) |
| `scripts_스크립트/generate_active_uploads.py` | Sheets 활성 영상 목록 → CSV CTR 읽기 → _RawData_Master write-back → active_uploads.json 생성 |
| `automation_runtime/latest_video_watchdog.py` | 최신 업로드 1개 감시 전용 오케스트레이터. `scan --mode safe/auto` → proposal 생성, `apply` → YouTube 제목/썸네일 반영, `rollback` → 마지막 변경 복구 |
| `automation_runtime/discord_notifier.py` | Discord 웹훅 전송 유틸. Latest Watchdog 경보 채널 |
| `automation_runtime/discord_watchdog_bot.py` | 예정. Discord Slash Command 수신 → `latest_video_watchdog.py` 실행 브리지 (`scan/apply/rollback/status`) |
| `analytics/video_diagnostics_engine.py` | IMPRESSION/CTR/RETENTION 3축 진단 → Video_Diagnostics 탭 |
| `analytics/alert_engine.py` | CRITICAL → 이메일 발송 + alert_history.json 중복 방지 |
| `analytics/action_tracker.py` | baseline 등록 → 3일 후 SUCCESS/FAILED 자동 판정 |
| `engine/pipeline_health_monitor.py` | 전수 건강 검진 + 자동 복구 (cron 03:00 KST) |

#### Latest Video Watchdog 실행 흐름

```
active_uploads.json
  └─ 최신 video_id 선택
      ├─ _RawData_Master 현재 메타데이터
      ├─ Video_Diagnostics diagnosis/confidence
      └─ Channel_CTR_KPI 기준선
            ↓
latest_video_watchdog.py scan
  └─ action 판정
       observe / title_test / thumbnail_test / repackage_both / content_issue
            ↓
latest_video_watchdog_proposal.json 저장
  └─ Discord 웹훅 알림 (선택)
            ↓
apply
  ├─ videos.update (제목)
  ├─ thumbnails.set (썸네일, 준비된 파일 있을 때만)
  └─ rollback 백업 저장
            ↓
rollback
  └─ 마지막 백업 스냅샷으로 제목/썸네일 복구
```

#### Discord 실행 계층 — 구현안

현재 상태:

- `discord_notifier.py` 는 Webhook 기반이라 **알림만 가능**
- Discord 안에서 `/apply` 같은 **실행**은 불가

목표 구조:

```
Discord Slash Command / Button
  └─ discord_watchdog_bot.py
       ├─ /watchdog scan
       ├─ /watchdog apply
       ├─ /watchdog rollback
       └─ /watchdog status
            ↓
      latest_video_watchdog.py subprocess 실행
            ↓
      stdout 요약 → Discord 응답
      proposal_id / action / 결과 로그 갱신
```

명령 설계:

| 명령 | 동작 | 비고 |
|------|------|------|
| `/watchdog scan mode:safe notify:true` | `scan --mode safe --notify` 실행 | 기본 명령. 최신 영상 분석 + Discord 보고 |
| `/watchdog apply proposal_id:xxx apply_key:xxx` | 마지막 proposal 또는 지정 proposal 적용 | 1차는 proposal_id + apply_key 검증 필수 |
| `/watchdog rollback` | 마지막 적용 롤백 | 가장 최근 apply 기준 |
| `/watchdog status` | 최근 proposal / 최근 apply / auto 가능 여부 조회 | 휴대폰 점검용 |

권한 / 안전 규칙:

- Bot 토큰 + Application Command 등록 필요
- 허용 사용자 ID 화이트리스트 필수
- 허용 역할(role) 체크 필수
- `apply` / `rollback` 은 관리자 role 또는 user id 제한
- 동일 영상 중복 `apply` 방지: 기존 auto/manual apply log 재사용
- 명령 실행 중 동시 요청 방지: 파일 lock 또는 단일 프로세스 mutex 필요
- `rollback` 은 마지막 1회 apply 에 대해서만 허용

필수 런타임 안전장치:

- 명령 실행 로그 저장 (`03_RUNTIME/discord_watchdog_command_log.json` 예정)
- subprocess timeout 필수 (`scan` 짧게, `apply/rollback` 더 길게)
- stdout / stderr 가 길면 Discord에는 요약만 보내고 원문은 런타임 파일에 저장
- 최근 proposal_id 자동 기억 (`latest_video_watchdog_proposal.json` 재사용)
- `status` 는 마지막 scan 결과, 마지막 apply, auto 가능 여부를 한 번에 요약
- `apply` 전 확인 메시지 1회 추가 (ephemeral 또는 confirm step)

구현 순서:

1. `discord_watchdog_bot.py` 신규
2. `/watchdog scan` 먼저 연결
3. `/watchdog status` 추가
4. `/watchdog apply` / `/watchdog rollback` 연결
5. 마지막에 버튼형 인터랙션(`Apply` / `Rollback` / `Rescan`) 확장

운영 원칙:

- Webhook 알림은 유지
- Bot 명령은 실행 전용
- 즉, **알림 채널**과 **실행 채널**을 논리적으로 분리
- 1차 운영은 Slash Command만, 버튼형은 2차

실행 전략:

- 1차 구현은 `latest_video_watchdog.py` 를 **subprocess로 직접 호출**
- 이후 안정화되면 내부 공통 함수를 분리해 `CLI 진입점 유지 + Bot은 함수 호출 또는 얇은 subprocess 래퍼` 구조로 전환
- 즉, **지금은 subprocess 우선 / 나중에 라이브러리형 분리**

#### Electron (electron/)

| 파일 | 역할 |
|------|------|
| `main.js` | IPC 핸들러 16채널 등록 |
| `preload.js` | window.api 노출 — loadContentPacks, saveContentPacks, fetchSheetVideos 등 |

---

### 8-B. CTR CSV 파이프라인 — 구조 & 트러블슈팅

#### 전체 데이터 흐름

```
sync_studio_csv.sh
  └─ CDP Chrome 시작 (port 9222)
  └─ download_studio_csv.py
       └─ Playwright 연결 → YouTube Studio Analytics 4_weeks URL
       └─ Export 버튼 클릭 → studio_reach_report_recent.csv 저장
  └─ git push
  └─ generate_active_uploads.py  ← post-sync 자동 실행
       └─ _RawData_Master 활성 영상 목록 로드
       └─ CTR null 체크 → null이면 쿨다운 무시 강제 CSV 다운로드
       └─ read_recent_csv_ctr() — 한국어 CSV 파싱
       └─ writeback_ctr_to_master() → _RawData_Master cell-by-cell 갱신
            └─ ctr_source = "csv_recent" / ctr_updated_at = timestamp
            └─ return dirty (bool)
       └─ active_uploads.json 생성 → Electron IPC readActiveUploads()
       └─ if dirty: video_diagnostics_engine.py 재실행
```

#### 주요 경로

| 항목 | 경로 |
|------|------|
| 수집 스크립트 | `07_AUTOMATION_자동화/scripts_스크립트/sync_studio_csv.sh` (cron: 매 2시간, KST 짝수 시 정각) |
| CSV 다운로더 | `07_AUTOMATION_자동화/scripts_스크립트/download_studio_csv.py` |
| 파이프라인 코디네이터 | `07_AUTOMATION_자동화/scripts_스크립트/generate_active_uploads.py` |
| 다운로드 CSV | `07_AUTOMATION_자동화/youtube_exports/studio_reach_report_recent.csv` |
| 활성 업로드 JSON | `07_AUTOMATION_자동화/03_RUNTIME/active_uploads.json` |
| 대상 시트 탭 | `_RawData_Master` (col 21: ctr_source, col 22: ctr_updated_at) |

#### 트러블슈팅 이력 (2026-03-21 해결)

| 증상 | 근본 원인 | 수정 |
|------|-----------|------|
| Export 버튼 영구 미발견 | `wait_until='networkidle'`이 YouTube Studio에서 완료되지 않음 | `'domcontentloaded'`로 변경 |
| Analytics 화면 흰 화면 | `--disable-background-mode` Chrome 플래그가 Analytics JS 타이머 차단 | 플래그 제거 |
| 데이터 로드 후 재시도 루프 | "재시도" 버튼 클릭이 로딩 상태 초기화 | 재시도 버튼 클릭 로직 전체 제거 |
| Stale 탭 문제 | 기존 탭 재사용 시 stale DOM 상태 잔류 | 항상 `context.new_page()` 생성 |
| 한국어 CSV 파싱 실패 | 컬럼명이 영어 키(`video id`)가 아닌 `콘텐츠` / `노출 클릭률 (%)` | 폴백 체인 파서 구현 |
| csv_ok=False면 기존 CSV 무시 | CSV가 존재해도 `csv_ok` 플래그로 차단 | `_RECENT_CSV.exists()` 직접 체크로 교체 |
| CTR null 시 쿨다운 스킵 안됨 | 쿨다운 체크가 CTR null 체크보다 앞에 있었음 | null 체크를 쿨다운 조건 앞으로 이동 |

---

#### 8-B-1. 텔레그램 실행 브리지 + Studio CSV 디버깅 기록 (2026-03-23)

목표:

- `휴대폰 Telegram`에서 `/run sync`
- `PC/CDP Chrome`에서 Studio CSV 자동 다운로드 + 파이프라인 실행
- 결과를 다시 `Telegram`으로 회신

이번에 실제로 시도한 것:

| 시도 | 문제점 | 확인된 원인 | 해결 방법 |
|------|--------|------------|-----------|
| Telegram `/ping` 왕복 테스트 | 초기 연결 불확실 | Bot 토큰/브리지 동작 미검증 | `telegram_command_bridge.py` 최소 명령(`/ping`, `/status`, `/run sync`)으로 분리 후 왕복 확인 |
| Telegram 시작 메시지 전송 | Telegram 400 parse error | MarkdownV2 escape 누락 | `telegram_notifier.py` 기본 전송을 plain text 중심으로 변경 |
| `/run sync` 실행 직후 실패 | `run_and_notify.py`가 `--`를 실행 파일로 인식 | argparse remainder 처리 미흡 | `normalize_command()`로 선행 `--` 제거 |
| `download_studio_csv.py` 실패 후 2차/3차 재시도까지 붕괴 | `sys.exit()`가 Playwright cleanup 중첩 유발 | event loop 정리 중 `RuntimeError`, 이후 Python stdio 깨짐 | `sys.exit()` 제거, 예외 raise 방식으로 통일 |
| CDP 연결 실패 (`::1:9222`) | Chrome은 열려 있는데 Playwright 접속 실패 | `localhost`가 IPv6 `::1`로 해석, Chrome은 `127.0.0.1:9222`만 listen | CDP URL을 `http://127.0.0.1:9222`로 변경 |
| Analytics 흰 화면 / Export 버튼 영구 미발견 | 페이지는 열렸지만 데이터 영역이 비어 보임 | 문서대로 `networkidle`/불필요 Chrome 플래그/로딩 간섭 이슈 | `wait_until='domcontentloaded'` 유지, `--disable-background-mode` 미사용 원칙 재확인 |
| "재시도" 버튼 루프 | 재시도 누를수록 더 꼬임 | 문서 기록대로 로딩 상태 초기화 | 재시도 버튼 자동 클릭 로직 전체 제거 |
| 기간 드롭다운에서 `전체` 선택 실패 | 텍스트는 찾는데 실제 클릭 불가 | 숨겨진 탭 라벨 `전체`와 드롭다운 옵션 `전체`가 공존 | `tp-yt-paper-item[test-id="lifetime"]` 우선 선택으로 수정 |
| lifetime 전환 후 Export 버튼이 없다고 판단 | 버튼은 보이는데 탐지 실패 | selector의 `.first`가 숨겨진 복제 노드를 잡음 | `_find_export_button()`를 "보이는 노드 중 첫 번째" 탐색으로 변경 |
| Export/CSV는 눌렀는데 ZIP 저장 0바이트 | `expect_download()` 이벤트는 발생 | CDP 모드에서 `save_as()`가 불안정 | `download.path()`의 임시 artifact 경로를 직접 복사하는 폴백 추가 |
| 특정 런에서 page가 갑자기 닫힘 | `Page.wait_for_timeout: Target page/context/browser has been closed` | YouTube Studio가 `전체` 전환 직후 내부 페이지 핸들을 갈아끼우는 케이스 | `context.pages`에서 현재 활성 Studio page를 재획득하는 `_get_active_studio_page()` 추가 |
| 간헐적 `net::ERR_QUIC_PROTOCOL_ERROR` | 재시도 3차에서 랜덤 네트워크 실패 | Chrome QUIC 레이어와 Studio/CDP 조합 불안정 | `sync_studio_csv.sh`의 CDP Chrome 기동에 `--disable-quic` 추가 |
| Telegram bridge 다중 실행 시 409 | Bot은 살아있는데 응답 불안정 | `getUpdates` long polling 인스턴스가 2개 이상 | 운영 원칙: bridge는 항상 1개만 실행 |

실제로 해결된 상태:

- `download_studio_csv.py` 단독 실행 성공
- `sync_studio_csv.sh --mode=recent` 성공
- `run_pipeline.sh` 전체 성공
- default 모드 기준 `studio_reach_report.csv` 다운로드 + ZIP 해제 + `video_daily_views.csv` 저장 성공
- 후속 단계인 `git commit / push / download_recent_video_studio.py / generate_active_uploads.py`까지 성공
- 실제 푸시 커밋: `8da4c80`

최종적으로 유효하다고 확인된 실행 흐름:

```text
Telegram /run sync
  -> telegram_command_bridge.py
  -> run_and_notify.py
  -> run_pipeline.sh
  -> sync_studio_csv.sh
  -> download_studio_csv.py
  -> Git push
  -> post-sync A/B
  -> Telegram 결과 회신
```

이번 작업에서 남긴 운영 메모:

- CDP Chrome은 `~/.soundstorm_chrome_cdp` 프로필을 계속 사용해야 로그인 세션이 유지된다.
- CDP Chrome은 `127.0.0.1:9222` 기준으로 붙는 것을 기본값으로 유지한다.
- Telegram bridge는 반드시 1개만 띄운다.
- Studio UI는 고정되지 않으므로, Export/CSV selector는 text 기반보다 `test-id`/`aria-label`/가시성 필터 조합이 더 안전하다.

---

### 8-C. Content Pack 데이터 모델

**Lifecycle:** `idea → draft → ready → uploaded → analyzing`

| 상태 | 전이 조건 |
|------|-----------|
| `idea` | 초기 후보 테마 (Pack 미생성) |
| `draft` | "+ 새 Pack" 클릭 → `createEmptyPack(theme)` |
| `ready` | 6개 AUTO 필드 전체 완료 (`isPackReady()` → true) |
| `uploaded` | YouTube 업로드 후 video_id 수동 입력 |
| `analyzing` | `uploaded` + `video_id` 있으면 reducer UPDATE_PACK에서 자동 전이 |

**AUTO 필드 6개:** `title` / `suno_prompt` / `thumbnail_text` / `description` / `hashtags` / `keywords`

**핵심 원칙:**
- `video_id` = 절대 키. 업로드 전 `null`, 업로드 후 YouTube 11자 ID
- Pack은 실험 단위 — `hypothesis` 필드로 가설 부착 가능
- `performance` 필드 = `packPerformanceEngine`이 채움 (UI에서 계산 금지)

---

### 8-D. NEXT 항목 구현 상세

#### [P0-1] H-3 ✅ 완료 — TodayBriefCard 버튼이 VideoDetailModal을 예측 없이 열음

**파일:** `src/pages/DashboardPage.tsx`
**함수:** `handleStrategyAction(action, topIssue)`

현재 문제:
```js
// topIssue를 받아 setSelectedVideo() 호출 → 모달이 열림
setSelectedVideo(diagToSelected(topIssue));
```

수정 방향:
- `setSelectedVideo` 호출 제거
- `diagSectionRef.current?.scrollIntoView({ behavior: "smooth" })` 로 대체
- 해당 패널에 2초 하이라이트 (`setDiagHighlighted(topIssue.videoId)` 등 state 추가)
- VideoDetailModal은 사용자가 영상을 명시적으로 클릭할 때만 (`onVideoClick` prop)

---

#### [P0-2] NavigationContext 드릴다운 (단계 E)

**파일:** `src/pages/DashboardPage.tsx`

ChannelPulseRow의 "분석 보기" 클릭 → DiagnosticsSection으로 스크롤 이동.
`diagSectionRef` (이미 존재) + `executionSectionRef` 활용.
`navigateToPanel(panelId)` 함수를 DashboardActions에 추가 → blockRegistry를 통해 각 Block에 전달.

---

#### [P1-3] M-5 ✅ 완료 — ActionCommandBar 클릭 후 시각 피드백 없음

**파일:** `src/pages/DashboardPage.tsx`
**함수:** `handleCommandAction(item)`

현재 문제:
```js
setAutoExpandDiagVideo(item.videoId);
setTimeout(() => diagSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
// → 스크롤 이동만 발생. 어느 카드가 활성화됐는지 표시 없음
```

수정 방향:
- `actionStartedId` state 추가 (이미 DashboardData에 존재하는지 확인)
- 스크롤 도착 후 해당 진단 카드 border: `T.primaryBorder` 2초간 표시
- `@keyframes pulse-border` 애니메이션 적용

---

#### [P1-4] H-2 — ChannelPulseRow 분석 토글 레이아웃 점프

**파일:** `src/pages/DashboardPage.tsx` (analytics expand 구현부)

현재: `height: 0 → scrollHeight` transition 구현됨. 내부 콘텐츠 opacity 없어서 "툭 튀어나옴".

수정 방향:
```jsx
// analyticsContent 래퍼 div에 추가
style={{
  opacity:    analyticsExpanded ? 1 : 0,
  transition: "opacity 0.2s ease 0.05s",  // height보다 50ms 늦게
}}
```

---

---

## 9. RIGHT PANEL REDESIGN — 구현 계획서 v3

> 인기영상 / 기회영상 / 외부유입 상세 → 우측 패널 탭화.
> 채널 상태 요약 카드 클릭 → 진단 영상 드릴다운 (mode override).
> **상태: 설계 완료, 구현 대기**

---

### 9-A. 이동 대상 요약

| 패널 | 현재 위치 | 이동 후 |
|------|-----------|---------|
| 인기영상 (TopVideos) | `opportunity` 블록 → DashboardPortfolioSection | 우측 패널 `topVideos` 탭 |
| 기회영상 (OpportunityVideosPanel) | `opportunity` 블록 → DashboardPortfolioSection | 우측 패널 `opportunity` 탭 |
| 외부유입 상세 (ExternalTrafficInsightsPanel) | `insight` 블록 → DashboardGrid `externalTraffic` 카드 | 우측 패널 `external` 탭 |
| 시청유지율경보 (RetentionDropPanel) | `action` 블록 → DashboardDiagnosticsSection | 우측 패널 `retention` 탭 |
| 채널 진단 드릴다운 (DiagnosisVideoListPanel) | 신규 | 우측 패널 `diagnosis` **mode** (탭 아님) |

---

### 9-B. 핵심 설계 결정 3가지

#### [결정 1] diag는 탭이 아닌 mode override

diag를 탭으로 넣으면 "페이지 이동"처럼 인식됨. 실제 목적은 "필터 드릴다운"이므로 mode로 처리.

```
RightPanel
  tabs: blocks | topVideos | opportunity | retention | external   ← 5탭
  mode: "normal" | "diagnosis"                                    ← overlay

mode === "diagnosis"일 때:
  탭 헤더 위에 진단 컨텍스트 배너 표시 (어떤 진단인지)
  콘텐츠 영역 → DiagnosisVideoListPanel 렌더
  배너 ✕ 클릭 → mode 초기화, 이전 탭 복원
```

이렇게 하면 opportunity → diag 연동, external → diag 연동, retention → diag 연동이 탭 전환 없이 가능.

**retention 탭 배치 근거:** 시청유지율경보는 진단 패널 중 가장 독립적 UX(드롭 구간 + 영상별 리스트)를 가지므로 diag mode 흡수 없이 전용 탭 유지.

#### [결정 2] RightPanelState 단일 객체로 관리

분산 state는 열림/탭/모드가 꼬이는 버그의 원인.

```ts
type TabId = "blocks" | "topVideos" | "opportunity" | "retention" | "external";

type RightPanelState = {
  isOpen:    boolean;
  activeTab: TabId;
  mode:      "normal" | "diagnosis";
};

// localStorage key: "dashboard:rightPanelState:v1"
// v1 고정 — 탭 구조 변경 시 v2로 올려 자동 초기화
const DEFAULT_STATE: RightPanelState = {
  isOpen:    true,
  activeTab: "blocks",
  mode:      "normal",
};
```

#### [결정 3] outer 520px 고정 2-layer 구조

width 전환 시 main 영역 흔들림 방지.

```
rightPanelOuter  (width: 520px 고정, flexShrink: 0)   ← main은 이것만 봄, 절대 변하지 않음
  └ innerPanel   (width: 340 or 520, margin: 0 auto)  ← 탭별로 내부에서 조정

탭별 innerPanel 너비:
  blocks / topVideos / opportunity / retention / diagnosis → 340px (가운데 정렬)
  external → 520px (전체 너비 사용)
```

---

### 9-C. DiagnosisVideoListPanel 정렬 기준

"문제 큰 순서대로" 원칙 — 각 진단 타입의 핵심 지표 오름/내림차순.

| diagKey | 정렬 기준 | 방향 | 근거 |
|---------|-----------|------|------|
| `THUMBNAIL_WEAK` | `impressions` | DESC | 노출이 많은데 CTR 낮음 = 손실 큰 순 |
| `TITLE_DISCOVERY_WEAK` | `impressions` | DESC | 검색 노출 자체가 적은 순 |
| `CONTENT_RETENTION_WEAK` | `avgViewDuration` | ASC | 이탈 가장 빠른 순 |
| `ALGORITHM_DISTRIBUTION_LOW` | `views` | ASC | 조회수 가장 낮은 순 (확산 실패 심한 순) |

탭별 강조 컬럼:
- `THUMBNAIL_WEAK` → CTR + 노출
- `TITLE_DISCOVERY_WEAK` → 노출 (낮음 강조)
- `CONTENT_RETENTION_WEAK` → 평균 시청 지속 시간
- `ALGORITHM_DISTRIBUTION_LOW` → 조회수 추이

---

### 9-D. 사전 필수 작업 (P0 — 다른 작업 시작 전)

#### useVideoPortfolio() hook 분리

현재 `computeVideoPortfolio()`는 DashboardPortfolioSection이 prop으로 받아 계산. 우측 패널이 직접 읽으면 중복 계산 → 렌더 타이밍 어긋남 + useMemo 캐시 깨짐.

```
src/hooks/useVideoPortfolio.ts  (신규)
  — useAnalyticsContext() 직접 읽기
  — useMemo로 computeVideoPortfolio() 래핑
  — DashboardPortfolioSection + RightSidePanel 모두 이 hook 사용
```

**이 hook이 완성되기 전에 다른 Step 시작 금지.**

---

### 9-E. 추가 필수 항목

#### 단축키 (숫자키 1~5)

```
1 → blocks   2 → topVideos   3 → opportunity   4 → retention   5 → external
```

- `keydown` 핸들러에서 `e.target instanceof HTMLInputElement` 체크 필수 (입력창 충돌 방지)
- 탭 헤더 아이콘 hover 시 단축키 툴팁 표시

#### Lazy mounting

activeTab에 해당하는 컴포넌트만 DOM에 mount. 나머지는 null 반환.
ExternalTrafficInsightsPanel 첫 진입 시 로딩 스피너 표시.

#### ExternalTrafficInsightsPanel 재설계 (card+row)

520px에서도 컬럼 겹침 발생. 테이블 → card+row 구조 변환.

```
현재:  소스 | 클릭 | 전환율 | 캠페인 | ...  (컬럼 많음)
변환:  [검색]  클릭 1,240 · 전환율 3.2%
       [소셜]  클릭 890 · 전환율 1.8%
```

---

### 9-F. 작업 순서 (의존성 순)

```
Step 1  useVideoPortfolio() hook 작성              ← P0 선행 필수
        src/hooks/useVideoPortfolio.ts
        DashboardPortfolioSection portfolio prop 제거

Step 2  DashboardDiagFilterContext 작성             ← diag mode 기반
        src/contexts/DashboardDiagFilterContext.tsx
        activeDiagFilter: string | null
        setActiveDiagFilter: (key: string | null) => void

Step 3  RightSidePanel.tsx 작성                    ← 핵심 컴포넌트
        RightPanelState 단일 객체 관리
        outer 520 고정 / innerPanel 가변
        5탭 헤더 + diagnosis mode overlay
        localStorage "dashboard:rightPanelState:v1"
        숫자키 단축키 등록 (1~5)
        activeTab만 lazy mount

Step 4  App.jsx 교체
        BlockManagerPanel → RightSidePanel

Step 5  ChannelStatusSummary.tsx 분리              ← 클릭 드릴다운
        StrategyPanel 인라인 코드 → 독립 컴포넌트
        onClick → setActiveDiagFilter(diagKey)
        active 카드 시각 강조 (border 두꺼워짐)
        ContentStrategyPanel 동일 교체

Step 6  DiagnosisVideoListPanel.tsx 작성
        diagKey 기반 필터 + 9-C 정렬 기준 적용
        타입별 강조 컬럼

Step 7  DashboardPortfolioSection 정리
        TopVideos, OpportunityVideosPanel 제거
        2-column (ChannelHealthCard + GrowthPanel)

Step 8  DashboardDiagnosticsSection 정리
        RetentionDropPanel 제거 (우측 패널로 이동)
        ImpressionDropPanel + CTRAlert + CampaignPerformance 유지

Step 9  DashboardGrid 정리
        externalTraffic 카드 제거
        STORAGE_KEY → v5

Step 10 ExternalTrafficInsightsPanel 재설계
        테이블 → card+row 구조
        520px 기준 레이아웃
```

---

### 9-G. 리스크 매트릭스

| 리스크 | 심각도 | 해결 방법 | 단계 |
|--------|--------|-----------|------|
| Opportunity 중복 계산 | P0 | useVideoPortfolio() hook | Step 1 |
| main 영역 width 흔들림 | P0 | outer 520 고정 2-layer | Step 3 |
| diag → tab 구조 혼동 | P0 | mode override 구조 | Step 3 |
| ExternalTraffic 컬럼 깨짐 | P1 | card+row 재설계 | Step 9 |
| localStorage 키 충돌 | P1 | 버전 키 v1, 구조 변경 시 v2 | Step 3 |
| 단축키 입력창 충돌 | P2 | instanceof HTMLInputElement 체크 | Step 3 |
| diag filter 초기화 누락 | P2 | 패널 닫기 시 setActiveDiagFilter(null) | Step 6 |

---

### 8-D. IPC 채널 주요 목록

| IPC 채널 | 용도 |
|----------|------|
| `FETCH_SHEET_VIDEOS` | Google Sheets → 영상 목록 로드 |
| `FETCH_YT_ANALYTICS` | YouTube Analytics API 호출 |
| `fetch-yt-performance` | video_id 기준 Pack 성과 수집 (STAGE 7) |
| `load-content-packs` / `save-content-packs` | ContentPack localStorage IPC |
| `load-tasks` / `add-task` / `update-task` / `delete-task` | Task CRUD |
| `YOUTUBE_LIST_RECENT_UPLOADS` | 최근 업로드 15개 조회 (UploadAssistant 자동 매핑용) |
| `registerActionStart` / `registerActionComplete` | action_tracker.py 연동 |
| `getGithubPat` | GitHub PAT 조회 (DataHealthBar workflow dispatch) |

---

## 10. PRODUCT REFACTORING — 제품 관점 구조 분석

> 작성: 2026-03-21
> 기능 단위가 아닌 "행동 단위" 기준 구조 분석. 중복 발견 → 제거/통합 결정표. 신규 컨트롤러 2개 설계 확정.

---

### 10-A. 핵심 설계 원칙

**판단은 한 곳, 렌더는 여러 곳**

로직(조건 분기, 데이터 취합)이 2곳 이상에 분산되면:
- 조건 변경 시 양쪽 수정 필요
- 상태 sync 보장 불가
- 필연적 버그 발생

신규 컨트롤러 2개(`TodayActionController`, `DashboardDiagnosticsController`)가 이 원칙을 구현한다.

---

### 10-B. 행동 단위 재정의 (8가지)

현재 컴포넌트는 기능 이름 기준. 사용자 행동 기준으로 재정의:

| ID | 행동 | 현재 담당 컴포넌트 (문제 있는 것 포함) |
|----|------|---------------------------------------|
| **A** | 오늘 할 일 결정 | `ActionCommandBar`, `CriticalAlertBanner`, `DecisionBar` |
| **B** | 전략 + 타이밍 확인 | `TodayBriefCard`, `DailyStrategyPanel`, `GoldenHourPanel`, `DashboardStrategySection`, `NextStrategyPanel` |
| **C** | 문제 진단 → 즉시 실행 | `CTRAlertPanel`, `ImpressionDropPanel`, `RetentionDropPanel`, `DiagnosticsPanel`, `ThumbnailWorkflowPanel` |
| **D** | 채널 상태 파악 | `ChannelPulseRow`, `KpiCardsPanel`, `YouTubeKpiStrip`, `ChannelOverviewPanel` |
| **E** | 콘텐츠 Pack 생성 | `ContentPackManager`, `ExecutionPanel`, `CampaignPerformancePanel` |
| **F** | 외부 유입 분석 | `CampaignPerformancePanel`, `ExternalDropPanel` |
| **G** | 영상 탐색 (포트폴리오) | `DashboardPortfolioSection`, `OpportunityVideosPanel`, `TopVideoList`, `HitVideosPanel` |
| **H** | 대시보드 구성 관리 | `BlockManagerPanel` |

---

### 10-C. 신규 컨트롤러 설계

#### [신규 1] TodayActionController

**문제:** 행동 A "오늘 할 일 결정"이 3개 컴포넌트로 분산

| 컴포넌트 | 현재 역할 | 문제 |
|---------|----------|------|
| `CriticalAlertBanner` | 경보 판단 + 표시 | 판단을 스스로 함 |
| `ActionCommandBar` | 추천 판단 + 표시 | 판단을 스스로 함 |
| `DecisionBar` | 결정 판단 + 표시 | 판단을 스스로 함 |

세 컴포넌트가 각기 다른 데이터 소스를 보고 독립적으로 판단 → 우선순위 충돌 가능, 일관성 보장 불가.

**해결:**

```
TodayActionController  (신규 — src/controllers/useTodayActionController.ts)

  판단 역할:
    primaryAction    — computeDecisionBar() 최상위 1개
    secondaryActions — computeDecisionBar() 나머지 2개
    criticalAlert    — CRITICAL severity 존재 여부

  렌더 위임:
    CriticalAlertBanner  ← criticalAlert prop만 받음 (판단 없음, UI 전용)
    ActionCommandBar     ← primaryAction + secondaryActions prop만 받음 (판단 없음, UI 전용)
```

**원칙:** "오늘 할 일 결정"은 하나의 시스템. CriticalAlertBanner와 ActionCommandBar는 받은 것을 표시하는 역할만.

---

#### [신규 2] DashboardDiagnosticsController

**문제:** Section 9 실행 시 분기 로직이 2곳으로 분열

```
현재 DiagnosticsPanel.jsx 내부:
  hasImpDrop    → ImpressionDropPanel
  hasCtrWeak   → CTRAlertPanel
  hasRetention → RetentionDropPanel   ← Section 9에서 RightPanel로 이동 예정
  hasExternal  → ExternalDropPanel   ← Section 9에서 RightPanel로 이동 예정

Section 9 실행 후 (DashboardDiagnosticsController 없을 때):
  DiagnosticsPanel  → ImpressionDrop + CTR 분기
  RightSidePanel    → Retention + External 분기
  → 조건 판단이 2곳. 우측 패널 닫힌 상태에서 Retention 이슈 감지 불가. 상태 sync 깨짐.
```

**해결:**

```
DashboardDiagnosticsController  (신규 — src/controllers/useDiagnosticsController.ts)

  판단 역할:
    hasCTR        — CTR_WEAK 해당 영상 존재 여부
    hasImpression — IMPRESSION_DROP 해당 영상 존재 여부
    hasRetention  — RETENTION_WEAK 해당 영상 존재 여부
    hasExternal   — externalDrop.drops 존재 여부

  렌더 위임:
    메인 DiagnosticsSection → CTRAlertPanel + ImpressionDropPanel  (hasCTR / hasImpression)
    RightSidePanel          → RetentionDropPanel + ExternalDropPanel  (hasRetention / hasExternal)
```

**원칙:** "판단은 한 곳, 렌더는 여러 곳."

> **Section 9 Step 8 전 필수 선행.** 순서 역전 시 분기 로직 영구 분열.

---

### 10-D. 중복 발생 지점 분석

#### 중복 1: "전략 + 골든아워" — ✅ 정리 완료 (2026-03-22)

| 컴포넌트 | 역할 | 상태 |
|---------|------|------|
| `NextUploadCard.tsx` | 다음 업로드 추천 + 골든아워 통합 (신규) | ✅ 정규 경로 — execution 블록 우측 1fr |
| `TodayBriefCard.jsx` | 전략(좌) + 골든아워(우) 통합 (구) | ⚠️ 파일 존재, blockRegistry에서 제거됨 |
| `DailyStrategyPanel.jsx` | 전략 단독 | ✅ 삭제 완료 |
| `GoldenHourPanel.jsx` | 골든아워 단독 | ✅ 삭제 완료 |
| `DashboardStrategySection.jsx` | 위 두 개 묶는 래퍼 | ✅ 삭제 완료 |

**결론:** `NextUploadCard` (execution 블록 내 우측 1fr)가 골든아워+업로드 추천 단일 진입점. 중복 컴포넌트 3개 삭제 완료.

---

#### 중복 2: KPI 표시 — 3개 컴포넌트, 같은 지표

| 컴포넌트 | 표시 KPI | 상태 |
|---------|---------|------|
| `KpiCardsPanel.jsx` | 6개 KPI + 성장률 배지 | ✅ 유지 |
| `YouTubeKpiStrip.jsx` | 4개 KPI (서브셋) | ❌ 제거 |
| `ChannelOverviewPanel.jsx` | KPI + AlgorithmFitness | AlgorithmFitness → KpiCardsPanel 병합 |

`fmtRevenue` 함수가 3개 파일에 각기 다른 구현으로 존재 → 같은 수치가 다르게 표시될 수 있음 (`만 단위` vs `toLocaleString`).

---

#### 중복 3: ControlPanel — 데드 코드

`App.jsx:211~526` — YAML 명령 실행, Undo, Snapshot 동기화 구현. 렌더링 안 됨, export 없음. `BlockManagerPanel` 도입 시 대체됨.

**결론:** 즉시 삭제. 기능 필요 시 RoadmapPage 전용으로 재설계.

---

#### 중복 위험: DiagnosticsPanel 분기 — Section 9-B 연동 필수

`DashboardDiagnosticsController` 구현 없이 Section 9 Step 8 진행 시 분기 로직 영구 분열.

**강제 순서:** `DashboardDiagnosticsController` 구현 완료 → Section 9 Step 8.

---

### 10-E. 분석 → 실행 흐름 끊김 지점

| ID | 위치 | 현재 동작 | 의도한 동작 | 수정 대상 |
|----|------|----------|------------|----------|
| **H-3** ✅ | `TodayBriefCard` quickAction 클릭 (현재 미렌더링) | `setSelectedVideo()` → 모달 열림 | `diagSectionRef.scrollIntoView` + 해당 카드 하이라이트 | `handleStrategyAction()` 수정 완료 |
| **M-5** 🟡 | `ActionCommandBar` CTA 클릭 | 스크롤만 발생, 강조 없음 | 도착 카드 2초 `T.primaryBorder` 하이라이트 | `handleCommandAction()` |
| **P0-2** 🔴 | `ChannelPulseRow` "분석 보기" | KPI 카드 확장만 됨 | DiagnosticsSection 스크롤 이동 | `DashboardActions.navigateToPanel()` 추가 |

---

### 10-F. 컴포넌트 역할 정의표

| 컴포넌트 | 단일 책임 | 액션 |
|---------|----------|------|
| `TodayActionController` | 오늘 할 일 전체 판단 (신규) | ✅ 신규 구현 |
| `DashboardDiagnosticsController` | 4축 진단 조건 단일 판단 (신규) | ✅ 신규 구현 |
| `CriticalAlertBanner` | CRITICAL 경보 UI — 판단 없음, 표시 전용 | ✅ 유지 (역할 축소) |
| `ActionCommandBar` | 1 PRIMARY + 2 SECONDARY UI — 판단 없음, 표시 전용 | ✅ 유지 (역할 축소) |
| `TodayBriefCard` | 전략(좌) + 골든아워(우) 통합 표시 + 알람 (구) | ⚠️ 파일 존재, blockRegistry에서 제거됨 — NextUploadCard로 대체 |
| `NextUploadCard` | 다음 업로드 추천 + 골든아워 통합 (신규) — execution 블록 우측 1fr | ✅ 구현 완료 |
| `ChannelPulseRow` | 채널 건강도 1줄 요약 + 분석 확장 토글 | ✅ 유지 |
| `KpiCardsPanel` | 6개 KPI 수치 + 성장률 표시 | ✅ 유지 |
| `CTRAlertPanel` | CTR 경보 + ThumbnailWorkflow 실행 | ✅ 유지 |
| `ImpressionDropPanel` | 노출 감소 진단 + 대응 CTA | ✅ 유지 |
| `ThumbnailWorkflowPanel` | 썸네일 교체 실행 워크플로우 | ✅ 유지 |
| `BlockManagerPanel` | 대시보드 위젯 ON/OFF 관리 | ↗ RightSidePanel `blocks` 탭으로 이동 |
| `DashboardStrategySection` | TodayBriefCard와 완전 중복 | ❌ 제거 |
| `DailyStrategyPanel` | TodayBriefCard 좌측과 완전 중복 | ❌ 제거 |
| `GoldenHourPanel` | TodayBriefCard 우측과 완전 중복 | ❌ 제거 |
| `YouTubeKpiStrip` | KpiCardsPanel의 서브셋 | ❌ 제거 |
| `ControlPanel` (App.jsx) | 렌더링 안 되는 데드 코드 | ❌ 즉시 삭제 |
| `RetentionDropPanel` | Retention 진단 독립 UX | ↗ RightSidePanel `retention` 탭 (DashboardDiagnosticsController.hasRetention 연결) |
| `ExternalDropPanel` | 외부 유입 이상 감지 | ↗ RightSidePanel `external` 탭 (DashboardDiagnosticsController.hasExternal 연결) |

---

### 10-G. 추천 아키텍처 다이어그램

```
App.jsx
├── Topbar                                          [56px 고정]
├── Sidebar                                         [56px / 220px]
│
├── DashboardPage
│   │
│   │ ── [Controller Layer] ─────────────────────────────────────
│   │
│   │   TodayActionController              ← 행동 A 전체 판단 (신규)
│   │     ├─ criticalAlert     → CriticalAlertBanner (UI 전용)
│   │     └─ primary/secondary → ActionCommandBar (UI 전용)
│   │
│   │   DashboardDiagnosticsController    ← 진단 조건 단일 판단 (신규)
│   │     ├─ hasCTR / hasImpression → DiagnosticsSection (메인 영역)
│   │     └─ hasRetention / hasExternal → RightSidePanel (탭)
│   │
│   │ ─────────────────────────────────────────────────────────
│   │
│   ├── [STICKY] CriticalAlertBanner      ← UI 전용 (판단 없음)
│   │
│   ├── ActionCommandBar                  ← UI 전용 (판단 없음)
│   │     └─ 클릭 → scrollIntoView + 2초 border 하이라이트 (M-5)
│   │
│   ├── execution 블록 (단일 카드, 1fr|1fr 내부 그리드)
│   │     ├─ 좌 1fr: ExecutionPanel (콘텐츠 실행 — 최근 업로드 성과 테이블)
│   │     └─ 우 1fr: NextUploadCard ← 골든아워 + 다음 업로드 통합 진입점
│   │           └─ max_delay = avgInterval × 0.5 / 골든아워 delay 비교 의사결정
│   │
│   ├── ChannelPulseRow                   ← 행동 D 1줄 요약
│   │     └─ "분석 보기" → diagSectionRef.scrollIntoView (P0-2 수정)
│   │     └─ [확장] KpiCardsPanel + ActionResultPanel
│   │
│   ├── DiagnosticsSection  ← ref: diagSectionRef
│   │     ├─ ImpressionDropPanel          ← 노출 진단
│   │     ├─ CTRAlertPanel                ← CTR 진단 → 즉시 실행
│   │     │    └─ ThumbnailWorkflowPanel (인라인 아코디언)
│   │     └─ CampaignPerformancePanel     ← 외부 캠페인 분석
│   │
│   ├── ExecutionPanel                    ← 행동 E
│   │     └─ ContentPackManager
│   │
│   └── [Block System]                    ← blockRegistry 동적 렌더
│
└── RightSidePanel (340~520px)
      ├── [탭 1] blocks       ← BlockManagerPanel (이동)
      ├── [탭 2] topVideos    ← TopVideos (이동)
      ├── [탭 3] opportunity  ← OpportunityVideosPanel (이동)
      ├── [탭 4] retention    ← RetentionDropPanel ← DashboardDiagnosticsController.hasRetention
      ├── [탭 5] external     ← ExternalDropPanel  ← DashboardDiagnosticsController.hasExternal
      └── [mode: diagnosis]   ← diag 드릴다운 (overlay)


[제거 완료 — 코드베이스에서 삭제됨 ✅]
  ✓ DashboardStrategySection.jsx — 삭제 완료
  ✓ DailyStrategyPanel.jsx — 삭제 완료
  ✓ GoldenHourPanel.jsx — 삭제 완료
  ✓ YouTubeKpiStrip.jsx — 삭제 완료
  ✓ ControlPanel 함수 (App.jsx) — 삭제 완료

[수정 대상 — 흐름 복구]
  ⚡ handleStrategyAction()         — setSelectedVideo 제거, scrollIntoView 대체 (H-3)
  ⚡ handleCommandAction()          — 2초 T.primaryBorder 하이라이트 추가 (M-5)
  ⚡ DashboardActions 타입          — navigateToPanel(panelId) 추가 → ChannelPulseRow 연결 (P0-2)
  ⚡ CriticalAlertBanner            — 자체 판단 제거, TodayActionController.criticalAlert prop 수신
  ⚡ ActionCommandBar               — 자체 판단 제거, TodayActionController 결과 prop 수신
```

---

### 10-H. 실행 순서 (의존성 순)

| 순서 | 작업 | 선행 조건 |
|------|------|-----------|
| **0** ✅ | `ControlPanel` 데드 코드 삭제 (App.jsx) | 완료 |
| **1** | `TodayActionController` 구현 + CriticalAlertBanner/ActionCommandBar 역할 축소 | 없음 |
| **2** | `DashboardDiagnosticsController` 구현 | **Section 9 Step 8 전 필수** |
| **3** ✅ | H-3 수정 — `handleStrategyAction()` scrollIntoView + setDiagHighlighted | 완료 |
| **4** | P0-2 수정 — `navigateToPanel()` + ChannelPulseRow 연결 | 없음 |
| **5** | Section 9 Step 1~3 — `useVideoPortfolio()` + `RightSidePanel` | DashboardDiagnosticsController 완료 후 |

---

### 10-I. 2026-03-23 구현 스냅샷

현재 대시보드 구현 상태를 짧게 요약하면 다음과 같다.

- `DashboardPage.tsx`는 220줄 수준까지 축소되어 페이지 조립 책임이 많이 줄었다.
- `RightSidePanel.tsx`는 기능은 확장됐지만 여전히 1000줄 이상이라 구조 분해가 남아 있다.
- 상단 IA는 중복 카드 제거, KPI 밴드 재정리, `NextUploadCard` 단일 진입점화까지 반영됐다.
- KPI 클릭은 카드 내부 확장이 아니라 우측 inspector를 열고, 마지막 드릴다운은 `VideoDetailModal`로 통일하는 방향으로 맞춰졌다.
- 외부 유입 이상 감지는 2026-03-23 기준 `externalDrop` runtime 계산 복구로 다시 작동한다.
- 품질 상태는 `npm run build` 성공, `npm test` 136 / 136 통과, 현재 lint 스크립트 범위 0 에러다.

즉, P0의 큰 골조는 많이 전진했지만 `RightSidePanel` 분해, 건강도 점수 체계 외부화, 번들 경고 해소는 아직 남아 있다.
| **6** | Section 9 Step 8 — DiagnosticsSection 정리 (Retention/External 제거) | DashboardDiagnosticsController 완료 후 |
| **7** ✅ | 전략 패널 3개 삭제 (DashboardStrategySection + DailyStrategyPanel + GoldenHourPanel) | 완료 |
| **8** ✅ | `YouTubeKpiStrip` 삭제 — 참조 파일 확인 후 KpiCardsPanel 교체 | 완료 |
