# VideoDetailModal 고도화 설계보고서
> 작성일: 2026-03-19
> 연결 시스템: Diagnostics Engine · alert_engine · action_tracker · PHASE 10-E

---

## 1. 현황 분석

### 현재 VideoDetailModal이 보여주는 것
```
영상 상세
  ├─ 썸네일 + 제목
  ├─ MetricChip × 10 (조회수, 시청시간, 좋아요, 평균시청, 노출, CTR, 댓글, 공유, 영상길이, 구독자증가)
  ├─ VideoVerdict  ← CTR 비교 1줄 (채널 평균 대비 ±%)
  ├─ 조회수 추세 (LineChart)
  ├─ 유입 경로 (BarChart)         ← 채널 전체 기준 (영상별 데이터 없음)
  ├─ 검색 키워드 Top 10            ← 채널 전체 기준
  └─ 외부 캠페인 유입 (Redirect)   ← 이 영상 기준 (있을 때만)
```

### 현재 빠진 것 (구현된 시스템과 연결 미완)

| 시스템 | 현재 연결 상태 | 위치 |
|--------|---------------|------|
| Diagnostics Engine (`video_diagnostics_engine.py`) | ❌ 미연결 | `Video_Diagnostics` 시트에 영상별 진단 결과 존재 |
| alert_engine 권장 액션 | ❌ 미연결 | `alert_history.json`에 영상별 액션 아이템 존재 |
| action_tracker 추적 상태 | ❌ 미연결 | `action_tracking.json`에 ONGOING/결과 기록 존재 |
| PHASE 10-E 자동 태스크 | ❌ 미연결 | `state.json tasks[]`에 이 영상 CRITICAL 태스크 존재 가능 |
| DiagnosticsPanel 드릴다운 | ❌ 미연결 | 채널 상태 요약에서 N건 클릭 → 해당 영상 목록 |

---

## 2. 목표 구조 (고도화 후)

스크린샷에서 보이는 것처럼:
- "명량대첩" → CTR 4.0% (채널 평균 대비 -7%) → 별도 경고 없음 (임계값 -20% 미만)
- "동양풍 전투 브금 | Un..." → CTR 3.1% (채널 평균 대비 -26%) → **CTR 경고 배너 이미 표시 중**

고도화 후 목표: **진단 결과 + 권장 액션 + 추적 상태**를 하나의 모달 안에서 완결

```
VideoDetailModal (고도화)
  ├─ [기존] 썸네일 + 제목 + MetricChips
  ├─ [기존] VideoVerdict (CTR 경고 배너)
  │
  ├─ ── 신규 섹션 1: 진단 결과 ──────────────────────────────
  │   DiagnosticsBadge
  │     IMPRESSION_DROP / CTR_WEAK / RETENTION_WEAK / NORMAL
  │     severity: CRITICAL 🔴 / HIGH 🟡 / MEDIUM 🟠 / NONE
  │
  ├─ ── 신규 섹션 2: 권장 액션 ──────────────────────────────
  │   ActionItems (alert_engine이 생성한 3개 액션)
  │     예: "1. 썸네일 교체 → A/B 테스트"
  │         "2. 제목 앞 3단어 키워드 강화"
  │         "3. 브라우징 피드 최적화 (CTR 목표: 5.0%↑)"
  │   완료 버튼 → action_tracker에 결과 등록
  │
  ├─ ── 신규 섹션 3: 액션 추적 상태 ─────────────────────────
  │   ActionTrackingStatus
  │     ONGOING: "썸네일 교체 후 D+2 (3일 후 결과 자동 판정)"
  │     SUCCESS: "✓ CTR +1.2%p 회복 (목표 달성)"
  │     FAILED:  "✗ CTR 변화 없음 (다른 접근 필요)"
  │
  ├─ ── 신규 섹션 4: 연결된 태스크 ──────────────────────────
  │   LinkedTask (state.json tasks[]에서 이 video_id 매칭)
  │     "🔴 [자동 태스크] 썸네일 A/B 테스트 — 동양풍 전투 브금"
  │     완료 버튼 → state.json status: done 업데이트
  │
  ├─ [기존] 조회수 추세 (LineChart)
  ├─ [기존] 유입 경로
  ├─ [기존] 검색 키워드 Top 10
  └─ [기존] 외부 캠페인 유입
```

---

## 3. 각 신규 섹션 상세 설계

### 섹션 1 — DiagnosticsBadge

**데이터 소스**: `VideoDiagnosticsAdapter.ts` → `videoDiagnostics[]`에서 `video_id` 매칭

```typescript
// VideoDetailModal props에 추가
interface Props {
  video:           SelectedVideo | null;
  channelAvgCTR?:  number | null;
  onClose:         () => void;
  // 신규
  diagnostics?:    VideodiagRow[];   // DiagnosticsPanel에서 내려받음
  autoAlertTasks?: AutoAlertTask[];  // DashboardPage에서 내려받음
}
```

**렌더링 규칙**:
- `problem_type === "NORMAL"` → 섹션 숨김 (표시 안 함)
- `problem_type === "INSUFFICIENT_DATA"` → 회색 "진단 데이터 수집 중" 배지만
- `problem_type !== "NORMAL"` → severity 색상 배지 + problem_type 레이블 표시

```
┌─────────────────────────────────────────────┐
│  🔴 CRITICAL  •  노출 감소 (BROWSE_DROP)     │
│  현재 노출이 이전 30일 대비 62% 감소했습니다  │
└─────────────────────────────────────────────┘
```

**severity 색상 매핑** (기존 토큰 사용):
- CRITICAL → `T.danger` + `T.dangerBg`
- HIGH     → `T.color.warning` + `T.warnBg`
- MEDIUM   → `T.color.info` + `T.bgSection`
- NONE     → 렌더링 skip

---

### 섹션 2 — ActionItems

**데이터 소스**: `alert_history.json`에서 `video_id` 매칭 → `recommended_actions[]`

```json
// alert_history.json 구조 (기존 alert_engine.py가 생성)
{
  "video_id": "abc123",
  "recommended_actions": [
    "썸네일 교체 → BROWSE 클릭률 개선 (CTR 목표: 5.0% 이상)",
    "제목 앞 3단어에 핵심 키워드 배치",
    "업로드 후 24시간 내 댓글 유도 커뮤니티 포스팅"
  ]
}
```

**Electron IPC**: `api.loadAlertHistory(videoId)` → 이 영상의 최신 alert 기록 반환

**UI**:
```
권장 액션  [이 영상 기준]

  1  썸네일 교체 → BROWSE 클릭률 개선 (CTR 목표: 5.0%↑)     [완료]
  2  제목 앞 3단어에 핵심 키워드 배치                        [완료]
  3  업로드 후 24시간 내 댓글 유도 커뮤니티 포스팅           [완료]
```

"완료" 클릭 → `action_tracker.register_manual_action(videoId, actionIndex)` IPC 호출

---

### 섹션 3 — ActionTrackingStatus

**데이터 소스**: `action_tracking.json`에서 `video_id` 매칭

```json
// action_tracking.json 구조 (기존 action_tracker.py가 생성)
{
  "video_id": "abc123",
  "status": "ONGOING",
  "action_date": "2026-03-17",
  "check_date": "2026-03-20",
  "baseline": { "ctr": 0.031, "impressions": 2260 },
  "result": null
}
```

**상태별 UI**:

```
# ONGOING
┌──────────────────────────────────────────────────┐
│  ⏳ 액션 추적 중  •  D+2일                        │
│  3/20에 결과 자동 판정 예정 (CTR 목표: +0.5%p)    │
└──────────────────────────────────────────────────┘

# SUCCESS
┌──────────────────────────────────────────────────┐
│  ✓ 개선 확인됨  •  3/20 판정                      │
│  CTR 3.1% → 5.2% (+2.1%p 회복)                   │
└──────────────────────────────────────────────────┘

# FAILED
┌──────────────────────────────────────────────────┐
│  ✗ 개선 미확인  •  3/20 판정                      │
│  CTR 3.1% → 3.3% (목표 미달) → 다른 접근 필요    │
└──────────────────────────────────────────────────┘
```

---

### 섹션 4 — LinkedTask

**데이터 소스**: `state.json tasks[]`에서 `video_id` 매칭 + `status !== "done"`

**UI**:
```
연결된 태스크

┌─────────────────────────────────────────────────┐
│  🔴  [자동] 썸네일 A/B 테스트 — 동양풍 전투 브금  │
│  BROWSE_DROP • 생성: 3/19 • CRITICAL              │
│                                       [완료]      │
└─────────────────────────────────────────────────┘
```

완료 클릭 → `api.updateTask(taskId, { status: "done" })` (기존 IPC 재사용)

---

## 4. 데이터 흐름

```
DashboardPage
  ├─ videoDiagnostics[]    (VideoDiagnosticsAdapter)
  ├─ autoAlertTasks[]      (state.json, 기존 구현)
  └─ 두 배열을 VideoDetailModal props로 전달

VideoDetailModal
  ├─ props.diagnostics에서 video.key로 find() → diagRow
  ├─ props.autoAlertTasks에서 video.key로 filter() → linkedTasks[]
  ├─ api.loadAlertHistory(video.key) → actionItems[] (신규 IPC)
  └─ api.loadActionTracking(video.key) → trackingStatus (신규 IPC)
```

---

## 5. 필요한 신규 IPC (electron/main.js)

```javascript
// 1. 이 영상의 최신 alert_history 항목 반환
ipcMain.handle("load-alert-history", async (_, videoId) => {
  const history = JSON.parse(fs.readFileSync(ALERT_HISTORY_PATH));
  return history.filter(h => h.video_id === videoId).slice(-1)[0] ?? null;
});

// 2. 이 영상의 action_tracking 상태 반환
ipcMain.handle("load-action-tracking", async (_, videoId) => {
  const tracking = JSON.parse(fs.readFileSync(ACTION_TRACKING_PATH));
  return tracking[videoId] ?? null;
});
```

---

## 6. props 변경 범위

### DashboardPage.tsx
```diff
+ const videoDiagnostics = useMemo(() => ..., []);  // VideoDiagnosticsAdapter에서 로드

  <VideoDetailModal
    video={selectedVideo}
    channelAvgCTR={channelAvgCTR}
    onClose={() => setSelectedVideo(null)}
+   diagnostics={videoDiagnostics}
+   autoAlertTasks={autoAlertTasks}  // 이미 존재
  />
```

### VideoDetailModal.tsx
```diff
  interface Props {
    video:           SelectedVideo | null;
    channelAvgCTR?:  number | null;
    onClose:         () => void;
+   diagnostics?:    VideodiagRow[];
+   autoAlertTasks?: AutoAlertTask[];
  }
```

---

## 7. DiagnosticsPanel → VideoDetailModal 드릴다운 (단계 E 연결)

마스터 보고서 단계 E (`NavigationContext + 채널 상태 요약 드릴다운`)와 자연스럽게 연결됩니다.

```
DiagnosticsPanel (채널 상태 요약)
  🔴 노출감소 3건  🟡 CTR저하 2건
           ↓ 클릭
  ImpressionDropPanel / CTRAlertPanel
  → 영상 행 클릭
           ↓
  VideoDetailModal (진단 결과 + 권장 액션 포함)
```

즉 **단계 E 구현 시 VideoDetailModal의 diagnostics 섹션이 자연스럽게 활성화**됩니다.

---

## 8. 구현 우선순위

| 우선순위 | 작업 | 전제 조건 | 난이도 |
|----------|------|-----------|--------|
| **P0** | DiagnosticsBadge (섹션 1) | videoDiagnostics props 전달 | 낮음 (find() 1줄) |
| **P0** | LinkedTask 표시 (섹션 4) | autoAlertTasks 이미 있음 | 낮음 (filter() 1줄) |
| **P1** | ActionItems (섹션 2) | load-alert-history IPC 신규 | 중간 |
| **P1** | ActionTrackingStatus (섹션 3) | load-action-tracking IPC 신규 | 중간 |
| **P2** | DiagnosticsPanel → 드릴다운 연결 | 단계 E 구현 후 | 높음 |

---

## 9. 최종 구조 요약

```
현재: 영상 지표 + CTR 경고 1줄
  ↓
고도화 후:
  영상 지표
  + 진단 결과 배지 (IMPRESSION_DROP / CTR_WEAK / severity)
  + 권장 액션 3개 (완료 체크 가능)
  + 액션 추적 상태 (ONGOING → SUCCESS/FAILED 자동 판정)
  + 연결된 CRITICAL 자동 태스크 (완료 처리 가능)
  + 조회수 추세 / 유입 경로 / 키워드 / 외부 캠페인
```

---

## 10. 핵심 원칙

1. **영상별 진단 결과**: `videoDiagnostics[]`에서 `video_id`로 find — 채널 전체 통계 아님
2. **NORMAL은 표시 안 함**: 문제 없는 영상에서 불필요한 UI 표시 방지
3. **기존 IPC 재사용 최대화**: `updateTask` 완료 버튼은 ExecutionPanel과 동일 코드
4. **섹션 조건부 렌더링**: 데이터 없으면 섹션 자체를 숨김 (빈 상태 UI 최소화)

---

*데이터 근거: VideoDetailModal.tsx 현재 코드 + alert_engine.py + action_tracker.py + SOUNDSTORM_Creator_OS_마스터_보고서.md*
