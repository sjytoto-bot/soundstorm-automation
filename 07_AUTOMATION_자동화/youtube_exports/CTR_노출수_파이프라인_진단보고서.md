# CTR / 노출수 데이터 파이프라인 진단 보고서
작성일: 2026-03-22

---

## 1. 문제 요약

대시보드 "콘텐츠 실행 > 최근 업로드 성과" 패널과 "영상 상세" 모달에서
CTR 및 노출수가 표시되지 않음 (항상 `—` 또는 `판단 보류` 표시).

---

## 2. 정상 데이터 흐름 (설계 의도)

```
[YouTube Studio]
  └─ studio_reach_report.csv
       콘텐츠(video_id) | 노출수 | 노출 클릭률 (%)

         ↓ 로컬 download_studio_csv.py (CDP Chrome 자동화)
         ↓ git commit + push → main

[GitHub Actions: reach-data-sync.yml]
  Step 1: studio_csv_ingestor.py
          CSV 파싱 → _RawData_Master.impressions / .ctr 셀 단위 업데이트

  Step 2: analytics_snapshot_engine.py

  Step 3: api_data_shuttler.py
          YouTube Data API → _RawData_Master 전체 재구성
          + _VideoTraffic, Channel_KPI 등 별도 시트 업데이트

[Google Sheets: _RawData_Master]
  video_id | upload_date | views | ... | impressions | ctr | ...

         ↓ Electron IPC (30분 polling + 수동 새로고침)

[soundstorm-panel: fetchReachData()]
  reachAdapter.ts → _RawData_Master + SS_음원마스터_최종 JOIN
  → reachRows[]

         ↓ useMemo

[DashboardPage: getRecentPerformanceVideos()]
  uploadedThisWeek × reachRows → video_id 기준 JOIN
  → recentPerfVideos[]

         ↓

[RecentUploadsTable]
  impressions / CTR 표시
```

---

## 3. 발견된 근본 원인: Race Condition

### 3-1. 문제 메커니즘

`studio_reach_report.csv` push 시 두 워크플로우가 **동시에 트리거**됨:

| 워크플로우 | 트리거 | 핵심 동작 |
|---|---|---|
| `reach-data-sync.yml` | CSV 파일 push (paths 필터) | studio_csv_ingestor → **impressions/ctr 씀** → api_data_shuttler |
| `youtube-data-sync.yml` | **모든 main push** (paths 필터 없음) | api_data_shuttler만 실행 |

### 3-2. 경쟁 조건 타임라인 (문제 발생 시나리오)

```
t=0   CSV push 발생
t=1   reach-data-sync.yml 시작
t=1   youtube-data-sync.yml 시작  ← 동시 트리거
t=2   youtube-data-sync.yml: api_data_shuttler.py 실행
      → get_all_records() 읽기: impressions=0 (아직 ingestor 미실행)
      → _RawData_Master.clear()
      → update(): impressions=0 씀
t=3   reach-data-sync.yml: studio_csv_ingestor.py
      → impressions=26756 씀  ← 타이밍에 따라 clear()에 덮여도 됨
t=4   reach-data-sync.yml: api_data_shuttler.py
      → get_all_records(): impressions=0  ← t=2에서 이미 0으로 덮였음
      → clear() + update(): impressions=0 씀  ← 최종 0 확정
```

**결과**: `_RawData_Master.impressions = 0` → UI에 `—` 표시

### 3-3. api_data_shuttler.py의 구조적 취약점

```python
# _RawData_Master 재구성 로직 (lines 1095~1143)
# 1) 기존 impressions/ctr 읽기 (이 시점에 이미 0이면 0 보존)
existing_rows = ws_master.get_all_records()
existing_reach_map = {vid: {'impressions': ..., 'ctr': ...}}

# 2) 전체 시트 삭제
ws_master.clear()

# 3) 0으로 채운 새 데이터 + 기존값 복원 후 전체 재기록
ws_master.update([headers] + df.values.tolist())
```

`clear()` 사용으로 인해 **race condition에 취약한 구조**. 읽는 시점의 값이 0이면
어떤 경우에도 0이 최종값이 됨.

---

## 4. 적용된 수정 사항

### Fix: youtube-data-sync.yml에 paths-ignore 추가

```yaml
# 수정 전
push:
  branches:
    - main   # paths 필터 제거 — main push 시 항상 실행

# 수정 후
push:
  branches:
    - main
  paths-ignore:
    # CSV 데이터 push는 reach-data-sync.yml 전용
    - "07_AUTOMATION_자동화/youtube_exports/**"
```

**효과**: CSV push 시 `youtube-data-sync.yml`이 트리거되지 않음.
`reach-data-sync.yml`만 순차 실행 (ingestor → api_data_shuttler),
race condition 완전 차단.

### 수정 후 정상 흐름

```
CSV push
  → reach-data-sync.yml 단독 실행
      [Step 1] studio_csv_ingestor: impressions=26756, ctr=0.0632 씀
      [Step 2] analytics_snapshot_engine
      [Step 3] api_data_shuttler: impressions=26756 읽음 → 보존 → 재기록
  → _RawData_Master.impressions = 26756  ✅
  → UI: "6.3%  양호" 표시  ✅

코드/설정 push (youtube_exports 제외)
  → youtube-data-sync.yml 정상 실행 (30분 cron도 유지)
  → impressions/ctr 기존값 보존 ✅
```

---

## 5. 추가 확인된 사항 (코드 레벨)

### 5-1. 30분 polling (이전 세션 수정 완료)

```typescript
// DashboardPage.tsx — fetchReachData 30분 polling
useEffect(() => {
  const fetchWithGuard = async () => {
    if (isFetchingReachRef.current) return;
    isFetchingReachRef.current = true;
    try {
      const data = await fetchReachData();
      const hash = JSON.stringify(data);
      if (hash !== prevReachHashRef.current) {
        setReachRows(data);
        setLastReachUpdated(new Date());
        prevReachHashRef.current = hash;
      }
    } finally { isFetchingReachRef.current = false; }
  };
  fetchWithGuard();
  const interval = setInterval(fetchWithGuard, 30 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

초기에는 `useEffect([], [])` 한 번만 실행 → KPI는 polling 되지만
video CTR은 미갱신. 이 문제는 이미 수정됨.

### 5-2. CSV 포맷 검증 (정상)

YouTube Studio Reach CSV의 `콘텐츠` 컬럼:
- 값: `_4JLfEWkvUY` (11자리 YouTube video ID)
- `studio_csv_ingestor.py`의 `col_video_id` 매핑 정상 (`'콘텐츠'` → video_id)
- `normalizePercent("6.32")` → `0.0632` 정상 처리

### 5-3. video_id JOIN 체인 (정상)

```
_RawData_Master.video_id
  = GoogleSheetAdapter.RawVideoRow.videoId
  = useExecutionController.uploadedThisWeek[].videoId
  = reachRows[].video_id (reachAdapter)
  → JOIN 조건: r.video_id === v.videoId  ✅ 동일 소스, 동일 포맷
```

### 5-4. 데이터 표시 조건 (RecentUploadsTable)

| impressions 값 | CTR 표시 |
|---|---|
| 0 또는 null | `—` (empty) |
| < 500 | `판단 보류` (hold) |
| >= 500, CTR null | `—` (empty) |
| >= 500, CTR 있음 | `6.3%  양호/보통/점검` |

Race condition으로 impressions=0 → `—` 표시가 근본 원인.

---

## 6. 검증 방법

다음 CSV push 이후 GitHub Actions 로그에서 확인:

```
reach-data-sync.yml 로그:
  [studio_csv_ingestor] ✅ 매칭: N개 영상 | 스킵: M개 영상
  [api_data_shuttler]   🔒 [Master] impressions/ctr 기존 시트 값으로 복원 (N개)

youtube-data-sync.yml:
  → 트리거되지 않아야 함 (paths-ignore 적용)
```

Electron 앱 DevTools Console:
```
[reachAdapter] ⚠ impressions 누락 N/M개 (P%)
  → P가 낮아지면 수정 성공
[ExecutionController] 최근 업로드(30일 이내): N개
  → N > 0이면 uploadedThisWeek 정상
```

---

## 7. 잔여 리스크

| 항목 | 리스크 | 대응 |
|---|---|---|
| `api_data_shuttler.py` `clear()` 구조 | cron 실행 중 수동 실행과 race | 8-4 개선 방향 참고 |
| OAuth 토큰 만료 | `get_all_records()` 실패 → impressions=0 보존 실패 | 기존 token 갱신 자동화로 대응 중 |
| 합계 행 (`합계`) | reach_map에 포함되나 _RawData_Master에 없어 자동 skip | 영향 없음 |

---

## 8. 재발 방지 설계 (Hardening)

### 8-1. Write Protection (덮어쓰기 방지)

현재 구조는 `_RawData_Master.clear()` 후 전체 재기록 방식으로,
읽는 시점 데이터가 손상되면 그대로 확정되는 구조이다.

이를 방지하기 위해 **유효성 검증 후 쓰기(write guard)** 적용 필요:

```python
# 방법 A: 행 단위 보호
if new_impressions == 0 and existing_impressions > 0:
    print("Warning: Skip overwrite — protecting existing data")
    return

# 방법 B: 전체 데이터셋 유효성 검증
def has_valid_reach(data):
    return any(row["impressions"] > 0 for row in data)

if not has_valid_reach(new_data):
    print("Invalid data — abort write")
    return
```

**효과**:
- race condition 발생 시에도 데이터 손실 방지
- 0 덮어쓰기 원천 차단

---

### 8-2. Workflow Concurrency Lock

GitHub Actions는 기본적으로 동일 리소스 동시 접근을 제한하지 않는다.
동일 시트를 수정하는 워크플로우 간 동시 실행 방지 설정 필요:

```yaml
# reach-data-sync.yml 및 youtube-data-sync.yml 모두 동일 그룹 지정
concurrency:
  group: youtube-data-pipeline
  cancel-in-progress: false   # 취소가 아닌 대기(queue) 방식
```

**효과**:
- reach / youtube workflow 동시 실행 차단
- 순차 실행 보장

> 현재 `reach-data-sync.yml`은 `group: reach-data-sync`로 자체 그룹만 가짐.
> `youtube-data-sync.yml`은 concurrency 설정 없음.
> 두 workflow가 동일 그룹을 공유하도록 통일 필요.

---

### 8-3. Sheet Layer 분리 (권장)

**현재 구조**:
```
_RawData_Master  ← studio_csv_ingestor + api_data_shuttler 모두 직접 수정
```

**개선 구조**:
```
Sheet A: _Raw_CSV_Data     (studio_csv_ingestor 전용 — impressions/ctr 원본)
Sheet B: _Raw_API_Data     (api_data_shuttler 전용 — views/likes/upload_date 등)
Sheet C: _RawData_Master   (읽기 전용 View — 두 시트 merge 결과, formula 기반)
```

**효과**:
- 데이터 출처 분리 → overwrite 구조 자체 제거
- 각 스크립트가 독립 시트만 관리 → race condition 원천 불가
- 디버깅 단순화 (어느 스크립트가 어떤 값을 썼는지 추적 가능)

---

### 8-4. clear() 제거 (중요)

**현재 구조**:
```python
ws_master.clear()         # 전체 삭제
ws_master.update(...)     # 전체 재기록
```

**문제**: race 발생 시 clear() 직후 다른 프로세스가 읽으면 전체 데이터 손실.

**개선 방향 — Upsert 방식으로 전환**:
```python
# 1) 기존 시트 헤더 + video_id 위치 파악
# 2) 기존 행 video_id → 시트 행 번호 Map 구성
# 3) 있는 행은 해당 셀만 업데이트 (batch_update, 셀 단위)
# 4) 없는 행만 append_rows로 추가
# 5) clear() 호출 없음 — 시트는 항상 유효한 상태 유지
```

**효과**:
- `clear()` 제거 → 어느 시점에 읽어도 유효한 데이터 보장
- race condition 발생 시에도 부분 데이터 유지 (전체 손실 없음)
- 단, 삭제된 video 행 정리 로직 별도 필요 (주기적 cleanup)

---

## 9. 결론

본 문제는 단순 트리거 설정 오류가 아닌,
**"동시 실행 + 전체 재작성(clear) 구조"** 에서 발생한 구조적 문제이다.

| 단계 | 조치 | 상태 |
|---|---|---|
| 트리거 레벨 | `youtube-data-sync.yml` `paths-ignore` 추가 | **완료** |
| 읽기 보호 | write guard (8-1) | 미적용 |
| 실행 순서 보장 | concurrency group 통일 (8-2) | 미적용 |
| 구조적 분리 | Sheet Layer 분리 (8-3) | 미적용 (장기 과제) |
| 근본 해결 | clear() → upsert 전환 (8-4) | 미적용 (중기 과제) |

`paths-ignore`는 트리거 레벨 임시 해결이며,
**write protection(8-1) + concurrency lock(8-2)** 적용 시
race condition 재발 가능성을 구조적으로 제거할 수 있다.
Sheet Layer 분리(8-3)와 upsert 전환(8-4)은 데이터 파이프라인 안정성의
장기적 hardening 방향이다.
