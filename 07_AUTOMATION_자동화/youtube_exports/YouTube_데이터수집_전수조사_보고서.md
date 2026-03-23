# SOUNDSTORM 유튜브 데이터 수집 시스템 전수조사 보고서

**조사일**: 2026-03-18 | **조사자**: Claude Code

---

## 1. 시스템 구조 개요

```
┌─────────────────────────────────────────────────────────────┐
│  PATH A — YouTube Analytics API (자동, 30분 주기)           │
│  api_data_shuttler.py → GitHub Actions                      │
│  → _RawData_Master / _RawData_FullPeriod / Channel_KPI      │
│  → Analytics_7d / 30d / prev30 / all                        │
│  → SS_음원마스터_최종 (FinalLayerSync)                       │
├─────────────────────────────────────────────────────────────┤
│  PATH B — YouTube Studio CSV (반수동, 수동 다운로드)         │
│  download_studio_csv.py → git push → reach-data-sync.yml    │
│  studio_csv_ingestor.py                                      │
│  → _RawData_Master (impressions/ctr 업데이트)               │
│  → Thumbnail_Analysis (CTR 동기화)                          │
│  → Channel_CTR_KPI / Thumbnail_Style_Performance            │
│  → Video_Diagnostics / Reference_Videos                     │
│  → analytics_snapshot_engine.py → _Analytics_Snapshot       │
├─────────────────────────────────────────────────────────────┤
│  PATH C — 로컬 Poller (5분 주기, Mac 온라인 시)             │
│  auto_snapshot_poller.py → analytics_snapshot_engine.py     │
│  → _Analytics_Snapshot (변경 감지 시만 갱신)                │
└─────────────────────────────────────────────────────────────┘
```

**Google Sheets 현재 탭 목록 (17개, finallayersync.log 확인)**:

```
[1]  SS_음원마스터_최종          [2]  _RawData_Master            [3]  _RawData_FullPeriod
[4]  Channel_KPI                 [5]  Analytics_7d               [6]  Analytics_30d
[7]  Analytics_prev30            [8]  Analytics_all              [9]  업로드 예정
[10] 트랜드분석&인사이트          [11] Thumbnail_Analysis         [12] _Analytics_Snapshot
[13] Channel_CTR_KPI             [14] Thumbnail_Style_Perf.      [15] Video_Diagnostics
[16] Reference_Videos            [17] _RawData_Recent30
```

---

## 2. 탭별 업데이트 현황

| 탭 | 갱신 주기 | 담당 스크립트 | 현재 상태 | 비고 |
|---|---|---|---|---|
| `_RawData_Master` | 30분 | api_data_shuttler.py | ✅ 정상 | 56개 영상 로드 확인 |
| `_RawData_FullPeriod` | 30분 | api_data_shuttler.py | ✅ 정상 | append-only |
| `Channel_KPI` | 30분 | api_data_shuttler.py | ✅ 정상 | KST 변환 포함 |
| `Analytics_7d` | 30분 | api_data_shuttler.py | ✅ 정상 | overwrite |
| `Analytics_30d` | 30분 | api_data_shuttler.py | ✅ 정상 | overwrite |
| `Analytics_prev30` | 30분 | api_data_shuttler.py | ✅ 정상 | overwrite |
| `Analytics_all` | 30분 | api_data_shuttler.py | ✅ 정상 | overwrite |
| `_Analytics_Snapshot` | 변경 감지 | analytics_snapshot_engine.py | ✅ 정상 | poller 5분 주기 |
| `Thumbnail_Analysis` | CSV Push 시 | studio_csv_ingestor.py | ⚠️ 부분 작동 | CTR/impressions 0 다수 |
| `Channel_CTR_KPI` | CSV Push 시 | analytics/channel_ctr_engine.py | ⚠️ 조건부 작동 | impressions 0이면 분석 무의미 |
| `Thumbnail_Style_Performance` | CSV Push 시 | analytics/thumbnail_intelligence_engine.py | ⚠️ 조건부 작동 | 동상 |
| `Video_Diagnostics` | CSV Push 시 | analytics/video_diagnostics_engine.py | ⚠️ 조건부 작동 | 동상 |
| `Reference_Videos` | CSV Push 시 | analytics/reference_engine.py | ⚠️ 조건부 작동 | 동상 |

---

## 3. 발견된 문제점 전체 목록

---

### 🔴 P0 — 즉시 조치 필요

#### 문제 1: impressions/ctr 데이터가 대부분 0

**원인**: YouTube Analytics API v2가 개별 채널의 reach 지표(impressions, CTR)를 차단

`api_data_shuttler.py` 내부 코드:

```python
def fetch_video_ctr_map(analytics, end_dt):
    # [v16.1 ALERT] Reach metrics are restricted in YT Analytics API v2
    # for individual channels. Skipping to avoid quota waste and 400 errors.
    return {}  # 항상 빈 dict 반환
```

**영향 탭**: `_RawData_Master` (impressions/ctr 컬럼), `Thumbnail_Analysis`, `Channel_CTR_KPI`, `Thumbnail_Style_Performance`, `Video_Diagnostics`

**현재 완화 수단**: PATH B — Studio CSV 수동 다운로드 후 git push → `reach-data-sync.yml` 실행.
하지만 이 과정이 **완전히 수동**이며 마지막 실행 시점 이후 데이터는 0 상태.

**해결 방안**:

**Option A (권장)** — YouTube Reporting API 자동화
- `studio_csv_ingestor.py` AUTO 모드(기본값)에서 `channel_reach_a2` 리포트 자동 다운로드 시도
- 단, 채널이 YouTube 파트너 프로그램이 아닐 경우 404 에러 → MANUAL 모드로 자동 전환
- **현재 상태 확인 방법**: `reporting_setup.py` 실행하여 채널의 Reporting API 접근 여부 확인

**Option B** — `sync_studio_csv.sh` cron 자동 실행

```bash
# Mac launchd로 매일 KST 02:00 자동 실행 (Chrome이 로그인된 상태여야 함)
0 17 * * * bash /path/to/sync_studio_csv.sh
```

- Chrome 로그인 세션이 있어야 하므로 Mac이 항상 켜져 있어야 함
- 현재 해당 launchd 설정 여부 불명확

---

#### 문제 2: `analytics/` 패키지에 `__init__.py` 없음

```
07_AUTOMATION_자동화/analytics/
├── channel_ctr_engine.py
├── reference_engine.py
├── thumbnail_intelligence_engine.py
└── video_diagnostics_engine.py
   (❌ __init__.py 없음)
```

`__init__.py`가 없음. Python 3.3+ namespace package로 작동하긴 하지만, 일부 환경(GitHub Actions의 특정 pip 버전, 경로 충돌)에서 import 실패 가능성 있음.

`studio_csv_ingestor.py`의 임포트 코드:

```python
sys.path.insert(0, AUTO_ROOT)  # 07_AUTOMATION_자동화/ 추가
from analytics.channel_ctr_engine import build_channel_ctr_kpi
```

모든 import가 `try/except`로 감싸져 있어 실패해도 조용히 넘어감.
**Channel_CTR_KPI, Thumbnail_Style_Performance, Video_Diagnostics, Reference_Videos 탭이 업데이트되지 않아도 에러 로그조차 없음**.

**해결 방안**: `__init__.py` 생성

```bash
touch "07_AUTOMATION_자동화/analytics/__init__.py"
git add "07_AUTOMATION_자동화/analytics/__init__.py"
git commit -m "fix: add __init__.py to analytics package"
git push
```

---

### 🟡 P1 — 높은 우선순위

#### 문제 3: `youtube-data-sync.yml`의 requirements.txt 경로 불일치

```yaml
# 현재 (확인 필요)
- name: Install dependencies
  run: pip install -r requirements.txt
```

GitHub Actions는 git 레포 루트(`SOUNDSTORM/`)에서 실행됨.
`requirements.txt`가 루트에 있는지, `07_AUTOMATION_자동화/requirements.txt`를 참조해야 하는지 확인 필요.
**확인 방법**: GitHub Actions 로그에서 `pip install` 성공 여부 확인.

---

#### 문제 4: REPO_PAT Secret 미설정 시 토큰 갱신 수동화

`youtube-data-sync.yml`의 토큰 자동 갱신 로직:

```yaml
if [ -z "$REPO_PAT" ]; then
  echo "⚠️ REPO_PAT Secret이 없어 자동 업데이트 불가"
  echo "token_needs_manual_update=true" >> $GITHUB_ENV
```

- `REPO_PAT` 없으면 OAuth 토큰 갱신 시 GitHub Issue 생성으로 수동 알림
- 미설정 상태이면 **토큰 만료 → 수집 전면 중단** 위험

**해결 방안**:
GitHub → Settings → Developer Settings → Personal Access Tokens (Classic) → `repo` 스코프 → `REPO_PAT`으로 저장

---

#### 문제 5: `sync_studio_csv.sh`의 Chrome 세션 관리 미흡

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222
# Chrome 종료 로직 없음 → 중복 인스턴스 축적 가능
```

매일 자동 실행 시 Chrome 인스턴스가 쌓일 수 있음.

---

#### 문제 6: `_RawData_FullPeriod` 무한 증가

- append-only 방식으로 매 30분마다 행 추가
- 오래된 데이터에 대한 purge/archive 로직 없음
- 장기 운영 시 시트 속도 저하 및 Google Sheets 한도(1,000만 셀) 도달 가능

---

### 🟢 P2 — 개선 권장

#### 문제 7: Python `datetime.utcnow()` Deprecation

```
finallayersync_err.log:
DeprecationWarning: datetime.datetime.utcnow() is deprecated
  Use timezone-aware objects: datetime.datetime.now(datetime.UTC).
  → test_final_layer_sync.py:221
```

Python 3.14에서 제거 예정. 현재 license_engine이 Python 3.14 venv 사용 중이므로 우선 대응 필요.

---

#### 문제 8: 로컬 DNS 오류 (auto_snapshot_poller)

```
poller_stderr.log:
socket.gaierror: [Errno 8] nodename nor servname provided
→ oauth2.googleapis.com 접근 불가
```

Mac 네트워크 전환(와이파이 변경, VPN 등) 시 DNS 캐시 문제로 로컬 poller 실패.
GitHub Actions에는 영향 없음.

---

#### 문제 9: `_VideoTrend`, `_RawData_Recent30` 탭 관리 주체 불명확

- `studio_csv_ingestor.py`가 `_VideoTrend` 시트를 생성/관리하지만 사용자 탭 목록에 없음
- `_RawData_Recent30` 탭이 존재하지만 생성 스크립트 불명확

---

## 4. 스크립트별 동작 요약

| 스크립트 | 실행 위치 | 트리거 | 상태 |
|---|---|---|---|
| `api_data_shuttler.py` | GitHub Actions | 30분 cron + push | ✅ 정상 |
| `studio_csv_ingestor.py` | GitHub Actions | CSV git push | ⚠️ CSV 없으면 스킵 |
| `analytics_snapshot_engine.py` | GitHub Actions + 로컬 | CSV push 후 / poller | ✅ 정상 |
| `auto_snapshot_poller.py` | 로컬 Mac (5분) | launchd | ✅ 정상 (DNS 간헐 오류) |
| `download_studio_csv.py` | 로컬 Mac (수동) | 수동 실행 | ⚠️ Chrome CDP 필요 |
| `sync_studio_csv.sh` | 로컬 Mac (수동/cron) | 수동 또는 cron | ⚠️ Chrome 로그인 필요 |

---

## 5. 즉시 조치 사항 (우선순위 순)

### Step 1 — `analytics/__init__.py` 생성 (1분)

```bash
touch "07_AUTOMATION_자동화/analytics/__init__.py"
git add "07_AUTOMATION_자동화/analytics/__init__.py"
git commit -m "fix: add __init__.py to analytics package"
git push
```

이후 자동으로 `reach-data-sync.yml`이 실행되어 Channel_CTR_KPI, Video_Diagnostics 등 탭 갱신 여부 확인.

### Step 2 — Studio CSV 최신 수집 (10분)

```bash
bash "07_AUTOMATION_자동화/scripts_스크립트/sync_studio_csv.sh"
# → CSV 다운로드 → git commit → push → GitHub Actions 자동 실행
```

### Step 3 — REPO_PAT Secret 등록 (3분)

GitHub → Settings → Developer Settings → Personal Access Tokens (Classic)
→ `repo` 스코프 체크 → 생성 → 이 저장소 Secrets → `REPO_PAT` 이름으로 저장

### Step 4 — Reporting API 채널 지원 여부 확인 (5분)

```bash
python3 "07_AUTOMATION_자동화/scripts_스크립트/reporting_setup.py"
# → channel_reach_a2 Job 생성 가능 여부 확인
# → 가능하면 AUTO 모드로 매일 자동 수집 가능
# → 불가 (404)이면 수동 Studio CSV 유지
```

---

## 6. 구글시트 탭 통합 방안

### 6.1 현재 탭 구조의 문제

현재 17개 탭은 세 가지 문제가 있음:

1. **기간별 뷰 중복**: Analytics_7d / Analytics_30d / Analytics_prev30 / Analytics_all — 동일 데이터의 기간만 다른 탭 4개
2. **파생 분석 탭 분산**: Channel_CTR_KPI / Thumbnail_Analysis / Thumbnail_Style_Performance / Video_Diagnostics — 모두 `_RawData_Master` 기반 분석인데 따로 존재
3. **수동 운영 탭 혼재**: `업로드 예정`, `트랜드분석&인사이트` — 자동화와 무관한 수동 탭이 자동화 탭과 섞임

---

### 6.2 통합 제안 (3가지 옵션)

#### [통합안 A] Analytics_7d~all → `Analytics_Periods` 단일 탭

| 현재 | 통합 후 |
|---|---|
| Analytics_7d | → |
| Analytics_30d | → `Analytics_Periods` (period 컬럼 추가) |
| Analytics_prev30 | → |
| Analytics_all | → |

**구조 변경**:

```
현재: Analytics_7d = [video_id, views, likes, ...]  (기간별 집계)
통합: Analytics_Periods = [video_id, period, views, likes, ...]
  period 값: "7d" | "30d" | "prev30" | "all"
```

- **장점**: 4탭 → 1탭 (75% 감소), 기간 비교 쿼리 단순화
- **단점**: 기존 soundstorm-panel Adapter 코드 수정 필요 (AnalyticsAdapter.ts)
- **비용**: 중간 (Adapter 수정 + 스크립트 변경)

---

#### [통합안 B] 분석 탭 → `Video_Intelligence` 통합

| 현재 탭 | 통합 방식 |
|---|---|
| Channel_CTR_KPI | → `Video_Intelligence` 탭의 섹션 A (A1:C20) |
| Thumbnail_Analysis | → 섹션 B (E1~) |
| Video_Diagnostics | → 섹션 C (K1~) |

- **장점**: 3탭 → 1탭, soundstorm-panel 대시보드에서 단일 탭 읽기로 분석 통합
- **단점**: 탭 레이아웃이 복잡해짐, 현재 panel Adapter들이 별도 탭 기준
- **비용**: 높음 (엔진 4개 + Adapter 수정)

---

#### [통합안 C — 권장] 최소 침습 구조 정리

가장 현실적인 방안: 탭 역할을 세 그룹으로 명확히 분리하되, 병합은 위험도가 낮은 것만 진행.

**그룹 1 — Raw 원본 (건드리지 않음)**

```
_RawData_Master      — 기준 원본, 절대 건드리지 않음
_RawData_FullPeriod  — 차원 분석 원본
_RawData_Recent30    — 최근 30일 뷰 (생성 로직 확인 후 결정)
```

**그룹 2 — 자동화 분석 (4탭 → 1탭 통합)**

```
통합 전:
  Analytics_7d / Analytics_30d / Analytics_prev30 / Analytics_all
  _Analytics_Snapshot
  Channel_KPI

통합 후 (권장):
  Analytics_Periods   — 7d/30d/prev30/all 4개 탭을 period 컬럼으로 통합
  _Analytics_Snapshot — 유지 (대시보드 전용 최적화)
  Channel_KPI         — 유지 (시계열 추적용)
```

**그룹 3 — AI 인사이트 (현행 유지)**

```
Thumbnail_Analysis          — 유지 (CTR 동기화 타깃)
Channel_CTR_KPI             — 유지 (Video_Diagnostics의 기준선 소스)
Thumbnail_Style_Performance — 유지 (style_engine 별도 로직)
Video_Diagnostics           — 유지 (진단 결과 소비)
Reference_Videos            — 유지 (벤치마크용)
```

**그룹 4 — 수동 운영 (별도 스프레드시트로 분리 권장)**

```
SS_음원마스터_최종    — 유지 (주요 마스터 시트)
업로드 예정           → 별도 '운영 시트'로 이동 권장
트랜드분석&인사이트   → 별도 '운영 시트'로 이동 권장
```

**최종 결과**: 현재 17탭 → **12탭** (수동 운영 탭 2개 이동 + Analytics 4탭 → 1탭 통합)

---

### 6.3 탭 통합 구현 우선순위

| 순서 | 작업 | 효과 | 비용 |
|---|---|---|---|
| 1 | `업로드 예정`, `트랜드분석&인사이트` → 별도 운영 스프레드시트 이동 | 혼재 해소 | 낮음 (수동 이동) |
| 2 | Analytics_7d/30d/prev30/all → `Analytics_Periods` 통합 | 4탭 → 1탭 | 중간 |
| 3 | `_RawData_Recent30` 생성 로직 확인 후 중복 여부 판단 | 1탭 정리 가능 | 낮음 |
| 4 | Channel_CTR_KPI + Thumbnail_Analysis → 통합 검토 | 2탭 → 1탭 | 높음 |

---

## 7. 결론

| 항목 | 평가 | 근거 |
|---|---|---|
| **자동 수집 (Path A)** | 🟢 정상 | 30분마다 안정적 실행, 56개 영상 갱신 확인 |
| **Reach 수집 (Path B)** | 🔴 병목 | API 차단으로 수동 의존, impressions/ctr 대부분 0 |
| **분석 탭 갱신** | 🟡 조건부 | CSV push 없으면 Channel_CTR_KPI 등 미갱신 |
| **데이터 무결성** | 🟢 양호 | 보호 컬럼 이중 차단, 셀 단위 업데이트 |
| **탭 구조** | 🟡 개선 필요 | 17탭 과다, 기간별 탭 4개 중복 |
| **토큰 관리** | 🟡 부분적 | REPO_PAT 미설정 시 만료 위험 |

**가장 큰 실질적 문제는 impressions/ctr 데이터 공백**입니다. API 제한으로 이 데이터는 Studio CSV를 통해서만 얻을 수 있는데, 현재 이 과정이 수동에 의존합니다. Studio CSV 자동 수집 주기를 확립하는 것이 최우선입니다.

---

*조사 기반 파일: `api_data_shuttler.py`, `studio_csv_ingestor.py`, `youtube-data-sync.yml`, `reach-data-sync.yml`, `analytics/*.py`, `finallayersync.log`, `poller_stderr.log`*



----
 이번 실행으로 업데이트된 탭 (전부 실데이터):                                           
                                                                                         
  ┌─────────────────────────────┬─────────────────────────────────────────────────────┐  
  │             탭              │                        결과                         │  
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤
  │ _RawData_Master             │ ✅ 56개 영상 impressions/ctr 갱신 (예: LbvbdVN8te8  │
  │                             │ impressions=11,133 ctr=5.79%)                       │
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤  
  │ Thumbnail_Analysis          │ ✅ 55개 영상 CTR 동기화 완료                        │
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤  
  │ Channel_CTR_KPI             │ ✅ avg_ctr=6.10%, median=6.04%,                     │
  │                             │ total_impressions=141,118                           │  
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Thumbnail_Style_Performance │ ✅ 13개 스타일 분석, 최고: dark (CTR 6.66%)         │  
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Video_Diagnostics           │ ✅ 56개 진단 (NORMAL 30, CONTENT_RETENTION_WEAK 12, │  
  │                             │  THUMBNAIL_WEAK 9, TITLE_DISCOVERY_WEAK 5)          │  
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤
  │ Reference_Videos            │ ✅ TOP 6 레퍼런스 영상 선정                         │  
  ├─────────────────────────────┼─────────────────────────────────────────────────────┤  
  │ _Analytics_Snapshot         │ ❌ 엔진 파일 미커밋 → 방금 커밋해서 다음 실행부터   │
  │                             │ 정상                                                │  
  └─────────────────────────────┴─────────────────────────────────────────────────────┘
  analytics_snapshot_engine.py를 방금 커밋했으므로, 다음 CSV push 시 
  _Analytics_Snapshot까지 완전히 자동으로 갱신됩니다.                                    
                                                     
  P0 문제 1 해결 완료 요약:                                                              
  - Chrome CDP 전용 프로필 + KeepAlive 설정 ✅                                           
  - cron 0 17 * * * 기존 등록 확인 ✅                                                    
  - 실제 동작 테스트 통과 ✅                                                             
  - 6개 분석 탭 실데이터로 갱신 ✅    