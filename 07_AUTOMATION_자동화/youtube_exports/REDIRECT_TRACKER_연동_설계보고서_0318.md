# Redirect Tracker → 대시보드 연동 설계 보고서
**작성일: 2026-03-18 | 목표: 비타겟 트래픽 실시간 감지 + CampaignPerformancePanel 구현**

---

## 0. 한 줄 요약

> IPC·어댑터·서버는 이미 있다. **파일 경로 연결** + **video_id 매핑** + **UI 컴포넌트** 3가지만 하면 된다.

---

## 1. 현재 상태 정밀 진단

### 이미 구현된 것 (건드리지 않음)

| 레이어 | 파일 | 상태 | 비고 |
|---|---|---|---|
| 서버 | `redirect_tracker/redirect_server.py` | ✅ 완전 구현 | Flask, 플랫폼 감지, CSV 기록 |
| IPC 핸들러 | `electron/main.js` L362~461 | ✅ 완전 구현 | `READ_REDIRECT_LOGS`, `READ_REDIRECT_LINKS`, `UPDATE_REDIRECT_LINK` |
| preload 브릿지 | `electron/preload.js` L47~53 | ✅ 완전 구현 | `readRedirectLogs`, `readRedirectLinks`, `updateRedirectLink` |
| 어댑터 타입·함수 | `src/adapters/redirectAdapter.ts` | ✅ 완전 구현 | `CampaignStat`, `computeCampaignStats`, `fetchRedirectLinks` |

### 미연결 / 미구현 항목

| 항목 | 파일 | 문제 |
|---|---|---|
| video_id 매핑 | `redirect_tracker/redirectLinks.json` | 5개 slug 모두 `"video": ""` |
| 파일 경로 설정 | `config/redirect_config.json` | 파일 없음 → main.js가 기본 경로(`config/`) 사용 중 |
| 실제 데이터 경로 | `redirect_tracker/redirect_logs.csv` | `07_AUTOMATION_자동화/` 안에 있으나 `config/`로 연결 필요 |
| UI 컴포넌트 | `CampaignPerformancePanel.jsx` | 미존재 |
| 비타겟 경보 로직 | `redirectAdapter.ts` | `is_nontarget_risk` 필드 없음 |
| YouTubeView 연동 | `src/components/YouTubeView.jsx` | 아직 MOCK 데이터 |

### 실제 데이터 현황

```
redirect_logs.csv (1건)
  timestamp: 2026-03-11T18:55:27
  platform:  DIRECT  ← 플랫폼 미감지 (curl 테스트)
  campaign:  discord_dnd
  link_slug: assassin
  video_id:  "" (비어있음)

redirectLinks.json (5 slug)
  assassin  → campaign: discord_dnd    video: ""  ← 만검돌격 video_id 넣어야 함
  battle    → campaign: reddit_gaming  video: ""
  dungeon   → campaign: arca_game      video: ""  ← 비타겟 트래픽 원인 후보
  stealth   → campaign: instagram_epic video: ""
  ambient   → campaign: notion_bgm     video: ""
```

---

## 2. 전체 데이터 흐름

```
[redirect_tracker/redirect_server.py]
  GET /r/<slug> → 클릭 기록
        ↓
[redirect_tracker/redirect_logs.csv]
  timestamp, platform, campaign, link_slug, target_video, ...
        ↓ (파일 경로 심볼릭 or config 설정)
[config/redirect_config.json]
  { "redirectLogsPath": "절대경로/redirect_logs.csv",
    "redirectLinksPath": "절대경로/redirectLinks.json" }
        ↓
[electron/main.js] READ_REDIRECT_LOGS / READ_REDIRECT_LINKS
        ↓
[electron/preload.js] window.api.readRedirectLogs()
        ↓
[src/adapters/redirectAdapter.ts]
  computeCampaignStats(logs, links, reachRows)
  → CampaignStat[] + 비타겟 위험 플래그
        ↓
[src/components/youtube/CampaignPerformancePanel.jsx]  ← 신규
  LAYER 1 실행 시그널 영역에 배치
        ↓
[src/components/YouTubeView.jsx]
  CampaignPerformancePanel 추가
```

---

## 3. 구현 항목 상세 설계

### 3-1. config/redirect_config.json 생성 (Step 1)

`main.js`의 `READ_REDIRECT_LOGS` 핸들러는 `config/redirect_config.json`이 있으면 그 경로를 우선한다.
실제 파일은 `07_AUTOMATION_자동화/redirect_tracker/`에 있으므로 경로를 연결해야 한다.

**생성 위치:** `soundstorm-panel/config/redirect_config.json`

```json
{
  "redirectLogsPath":  "/절대경로/07_AUTOMATION_자동화/redirect_tracker/redirect_logs.csv",
  "redirectLinksPath": "/절대경로/07_AUTOMATION_자동화/redirect_tracker/redirectLinks.json"
}
```

> 절대경로는 개발 환경의 실제 경로를 사용한다.
> 패키지 배포 시에는 `app.getAppPath()` 기준 상대 경로로 변환 필요.

**검증 방법:**
```
앱 실행 → YouTube 탭 → 콘솔에서
window.api.readRedirectLogs().then(console.log)
→ [] 이상 반환 시 연결 성공
```

---

### 3-2. redirectLinks.json video_id 매핑 (Step 2)

현재 5개 slug 모두 `video: ""`이다. 실제 video_id를 채워야 `computeCampaignStats`가 전환율을 계산할 수 있다.

**매핑 기준 — 캠페인 성격별 영상 연결:**

| slug | campaign | 연결할 영상 | 근거 |
|---|---|---|---|
| `assassin` | discord_dnd | 만검돌격 video_id | Discord 게임 커뮤니티 → 전투 BGM |
| `battle` | reddit_gaming | 만검돌격 or 척살 video_id | Reddit 게이밍 → 전투계 |
| `dungeon` | arca_game | 만검돌격 video_id | ARCA 게임 → 비타겟 원인 후보 ⚠ |
| `stealth` | instagram_epic | 잠행 video_id | Instagram → 분위기 있는 BGM |
| `ambient` | notion_bgm | ambient 계열 video_id | Notion → 집중·배경음 |

**업데이트 방법 — 앱 IPC 사용:**
```javascript
// 개발자 콘솔에서 직접 실행
window.api.updateRedirectLink("assassin", "실제_만검돌격_video_id")
window.api.updateRedirectLink("dungeon",  "실제_만검돌격_video_id")
```

또는 `redirectLinks.json` 파일을 직접 편집:
```json
{
  "assassin": { "video": "만검돌격_video_id", "playlist": "", "campaign": "discord_dnd" },
  "dungeon":  { "video": "만검돌격_video_id", "playlist": "", "campaign": "arca_game"   }
}
```

---

### 3-3. redirectAdapter.ts — 비타겟 경보 필드 추가 (Step 3)

현재 `CampaignStat`에 비타겟 위험 플래그가 없다. 기존 코드에 필드만 추가한다.

**변경 범위: `src/adapters/redirectAdapter.ts`**

`CampaignStat` 인터페이스에 추가:
```typescript
isNontargetRisk: boolean;
// 판단 기준: quality === "low" AND clicks >= 10
// → 클릭이 많은데 전환율이 낮다 = 비타겟 유입 가능성 높음
```

`computeCampaignStats` return 블록에 추가:
```typescript
isNontargetRisk: entry.clicks >= 10 && classifyQuality(conversionRate, views) === "low",
```

**비타겟 판단 기준 근거:**
```
clicks >= 10  : 통계적으로 의미있는 샘플
quality "low" : conversionRate < 0.4 (클릭 대비 조회 전환 40% 미만)
→ "많이 클릭했는데 영상을 안 본다" = 비타겟 트래픽 패턴
```

---

### 3-4. CampaignPerformancePanel.jsx 신규 작성 (Step 4)

**파일 위치:** `src/components/youtube/CampaignPerformancePanel.jsx`

**표시 데이터 구조:**
```
┌─ CampaignPerformancePanel ──────────────────────────────┐
│  캠페인 퍼포먼스  (Redirect Tracker)                     │
│                                                          │
│  ⚠ arca_game    ARCA   14 클릭   CTR낮음  [링크 제거 →] │  ← isNontargetRisk
│  ✓ discord_dnd  DISC    8 클릭   정상     [Pack 생성 →] │
│  ─ reddit_gaming  RDT   3 클릭   데이터부족             │
│                                                          │
│  [+ 새 캠페인 링크 추가]                                 │
└──────────────────────────────────────────────────────────┘
```

**컴포넌트 props 설계:**
```typescript
interface Props {
  stats: CampaignStat[];       // redirectAdapter.computeCampaignStats() 결과
  onCreatePack: (videoId: string) => void;  // Content Pack 생성 연결
  onRemoveLink: (slug: string) => void;     // 링크 제거
  onAddCampaign: () => void;                // 새 캠페인 추가 모달
}
```

**플랫폼 아이콘 매핑 (lucide-react 사용):**
```
DISCORD    → MessageCircle
REDDIT     → Hash
ARCA       → Hash
INSTAGRAM  → Camera
TWITTER    → AtSign
NAVER      → Globe
DIRECT     → Link
기타       → Globe
```

**quality → 상태 표시:**
```
"high"    → ✓ 초록  "정상 전환"
"medium"  → – 노랑  "전환율 보통"
"low"     → ⚠ 빨강  "비타겟 가능성" (isNontargetRisk)
"no_data" → – 회색  "데이터 부족"
```

---

### 3-5. YouTubeView.jsx — CampaignPerformancePanel 연결 (Step 5)

`YouTubeView.jsx`는 현재 MOCK 데이터를 사용한다.
실제 데이터 로딩 로직을 추가하고 `CampaignPerformancePanel`을 LAYER 1 위치에 삽입한다.

**변경 범위: `src/components/YouTubeView.jsx`**

추가할 로직 (컴포넌트 상단):
```javascript
// Redirect Tracker 데이터 로드
const [campaignStats, setCampaignStats] = useState([]);

useEffect(() => {
  async function loadRedirectData() {
    const api = window.api;
    if (!api?.readRedirectLogs) return;

    const [logs, links] = await Promise.all([
      api.readRedirectLogs(),
      api.readRedirectLinks(),
    ]);
    // reachRows는 기존 데이터 로딩에서 가져옴
    const stats = computeCampaignStats(logs, links, reachRows);
    setCampaignStats(stats);
  }
  loadRedirectData();
}, [reachRows]);
```

**배치 위치 — LAYER 1 실행 시그널 영역:**
```jsx
{/* LAYER 0: KPI 카드 4개 */}
{MOCK.kpis.map(...)}

{/* LAYER 1: 실행 시그널 */}
{campaignStats.length > 0 && (
  <CampaignPerformancePanel
    stats={campaignStats}
    onCreatePack={handleCreatePack}
    onRemoveLink={handleRemoveLink}
    onAddCampaign={handleAddCampaign}
  />
)}

{/* 기존 Audience Segments ... */}
```

---

## 4. 파일별 변경 범위 요약

| 파일 | 변경 유형 | 변경 범위 |
|---|---|---|
| `config/redirect_config.json` | **신규 생성** | 파일 경로 설정 (2줄) |
| `redirect_tracker/redirectLinks.json` | **데이터 수정** | 5개 slug에 video_id 채우기 |
| `src/adapters/redirectAdapter.ts` | **소규모 수정** | `CampaignStat`에 `isNontargetRisk` 필드 추가 (3줄) |
| `src/components/youtube/CampaignPerformancePanel.jsx` | **신규 작성** | UI 컴포넌트 전체 |
| `src/components/YouTubeView.jsx` | **소규모 수정** | useEffect 추가 + Panel 배치 (20줄) |

**건드리지 않는 파일:**
- `electron/main.js` — IPC 핸들러 완전 구현됨
- `electron/preload.js` — 브릿지 완전 구현됨
- `redirect_tracker/redirect_server.py` — 서버 완전 구현됨

---

## 5. 비타겟 경보 로직 — 만검돌격 재발 방지

보고서에서 제시한 "외부 트래픽 25% 임계값" 경보는 YouTube Analytics API 데이터(트래픽 소스 비율)가 필요하다.
**현재는 API 파이프라인이 없으므로** Redirect Tracker 데이터만으로 가능한 경보 기준을 사용한다.

### 현재 구현 가능한 경보 기준

```
[Redirect Tracker 기반 경보]
  isNontargetRisk = clicks >= 10 AND conversionRate < 0.4
  → "이 캠페인의 클릭 대비 조회 전환이 낮습니다. 비타겟 유입 가능성."

[dungeon/arca_game slug 감지]
  arca_game 캠페인 클릭 발생 → 즉시 경보
  → "ARCA 커뮤니티 유입 감지. 만검돌격 사례 참조."
```

### YouTube Analytics API 연동 후 추가할 경보 (Phase 3)

```python
# analytics_snapshot_engine.py에 추가 예정
external_traffic_ratio = external_views / total_views
daily_views            = today_views
avg_daily_views        = recent_7d_avg

if external_traffic_ratio > 0.25 and daily_views > avg_daily_views * 3:
    alert("외부 유입 급등 — 비타겟 트래픽 위험 구간")
```

---

## 6. 구현 순서 (권장)

```
Step 1 — config/redirect_config.json 생성
         (30분 — 파일 생성 + 경로 확인)
         검증: window.api.readRedirectLogs() 반환값 확인

Step 2 — redirectLinks.json video_id 매핑
         (30분 — YouTube Studio에서 video_id 복사)
         검증: assassin.video ≠ "" 확인

Step 3 — redirectAdapter.ts isNontargetRisk 추가
         (15분 — 3줄 추가)

Step 4 — CampaignPerformancePanel.jsx 작성
         (2~3시간 — UI 컴포넌트 전체)

Step 5 — YouTubeView.jsx 연결
         (1시간 — useEffect + Panel 배치)
```

**총 예상 작업:** Step 1~3은 오늘, Step 4~5는 별도 구현 세션

---

## 7. 검증 시나리오

구현 완료 후 다음 순서로 검증한다.

```
① 앱 실행 → YouTube 탭 이동
② CampaignPerformancePanel 표시 여부 확인
   → campaignStats.length > 0 이면 패널 표시
   → 0이면 redirect_config.json 경로 재확인

③ redirect_server.py 실행 (python3 redirect_server.py)
   → 테스트 클릭: curl http://localhost:5050/r/assassin
   → redirect_logs.csv 새 행 추가 확인

④ 앱 새로고침
   → 패널의 assassin 클릭수 증가 확인

⑤ video_id 매핑 후
   → conversionLabel: "N 클릭 → M 조회 (XX%)" 형태 확인
   → quality "low"인 slug에 isNontargetRisk = true 확인
```

---

## 8. 결론

| 항목 | 현재 | 구현 후 |
|---|---|---|
| redirect_logs.csv | 파일 있음, 앱과 미연결 | config 경로 설정으로 즉시 연결 |
| redirectLinks.json | slug 있음, video_id 없음 | video_id 매핑으로 전환율 계산 가능 |
| 비타겟 경보 | 없음 | isNontargetRisk + ARCA 캠페인 감지 |
| 대시보드 표시 | MOCK 데이터 | 실제 캠페인 퍼포먼스 패널 |
| 만검돌격 재발 방지 | 불가 | dungeon/arca_game slug 경보 |

**가장 빠른 첫 번째 행동:**
`config/redirect_config.json` 파일 하나 생성하면 IPC 연결이 즉시 살아난다.

---
*관련 파일: `electron/main.js` L362~461, `src/adapters/redirectAdapter.ts`, `redirect_tracker/redirect_server.py`*
