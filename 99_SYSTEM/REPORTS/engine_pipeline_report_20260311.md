# SOUNDSTORM 엔진 파이프라인 현황 보고서

**기준일: 2026-03-11**

---

## 전체 파이프라인 구조

```
[Python 수집 레이어]  →  [Google Sheets]  →  [Electron IPC Bridge]
                                                      ↓
                                          [TypeScript Adapters]
                                                      ↓
                                           [React Controllers]
                                                      ↓
                                            [UI Panels / Dashboard]
```

---

## 1. Python 자동화 엔진 (07_AUTOMATION_자동화)

### 1-1. 데이터 수집 파이프라인

| 파일 | 버전 | 역할 |
|------|------|------|
| `scripts_스크립트/api_data_shuttler.py` | v15.2 | **메인 파이프라인 진입점** — YouTube API → Google Sheets 업로드 |
| `scripts_스크립트/youtube_data_collector.py` | — | YouTube Data API v3 영상 메타데이터 수집 |
| `scripts_스크립트/youtube_analytics_client.py` | — | YouTube Analytics API 클라이언트 |
| `scripts_스크립트/youtube_analyzer.py` | — | 수집 데이터 분석 처리 |

**핵심 특징:** CI/로컬 듀얼 인증 모드

- 로컬 환경: `service_account.json` 파일 기반
- GitHub Actions: `SERVICE_ACCOUNT_B64` 환경변수 → `/tmp` 경로 디코딩

**타깃 시트:** `Analytics_7d`, `Analytics_30d`, `Analytics_all`, `Analytics_prev30`, `_RawData_FullPeriod`, `Channel_KPI`

---

### 1-2. 데이터 동기화 엔진

| 파일 | 역할 |
|------|------|
| `engine/weekly_sync.py` | 주간 Google Sheets 동기화 + 서식 일괄 적용 |
| `engine/sync_to_google_sheets.py` | Sheets 데이터 동기화 전용 |
| `engine/update_single_sheet.py` | 개별 시트 업데이트 |
| `engine/google_sheets_formatting.py` | 서식화 함수 모음 |

---

### 1-3. 분석 엔진

| 파일 | 역할 |
|------|------|
| `engine/soundstorm_analyzer.py` | 전체 폴더 스캔 — audio/image/video 중복 검사 (librosa, sklearn cosine similarity) |
| `engine/snapshot_engine.py` | 팀가이드 스냅샷 draft → approve 2단계 자동화 |
| `scripts_스크립트/comment_analyzer.py` | 댓글 분석 |
| `scripts_스크립트/pattern_analyzer.py` | 패턴 분석 |

---

### 1-4. 음원 관리 파이프라인

| 파일 | 역할 |
|------|------|
| `scripts_스크립트/extract_audio_durations.py` | 음원 길이 추출 |
| `scripts_스크립트/rename_audio_files.py` | 음원 파일명 변경 |
| `scripts_스크립트/export_uploaded_audio.py` | 업로드된 음원 내보내기 |
| `scripts_스크립트/organize_files.py` | 파일 정렬/구조화 |
| `scripts_스크립트/cleanup_duplicates.py` | 중복 파일 정리 |

---

### 1-5. 라이선스 엔진 (license_engine/) — 14단계 워크플로우

```
Gmail 주문 수신
     ↓
[1]  입력 검증 + 중복 체크 (db_manager.py)
     ↓
[2~6] 채번 + PDF 생성 루프 (최대 2회 재시도)
     ├── [2] 라이선스 번호 채번  SS-{track_id}-{date}-{seq:02d}
     ├── [3] QR 코드 생성 (qr_generator.py)
     ├── [4] HTML 렌더링
     ├── [5] PDF 생성 (WeasyPrint)
     └── [6] PDF 존재 검증
     ↓
[7~8] Google Drive 폴더 생성 + PDF 업로드
     ↓
[9]  Cloudflare R2 업로드
     ↓
[10] SMTP 이메일 발송
     ↓
[11] SQLite DB 등록
     ↓
[12] Gmail 메시지 "처리됨" 마크
     ↓
[13~14] 기록 저장 + 결과 반환
```

**진입점 2개:**
- `main.py` → CLI 수동 실행
- `main_web.py` → Flask `/trigger` 엔드포인트 (Cloud Scheduler 연동)

**라이선스 타입:** `one_time` / `permanent`
**검증 URL:** `https://soundstorm.kr/verify`

---

## 2. TypeScript 어댑터 레이어 (src/adapters/)

| 어댑터 | 역할 | 데이터 소스 |
|--------|------|------------|
| `GoogleSheetAdapter.ts` | Sheets 원본 행 → NormalizedVideo[] | `_RawData_Master` |
| `AnalyticsAdapter.ts` | Analytics 다차원 데이터 파싱 | `Analytics_*`, `_RawData_FullPeriod`, `Channel_KPI` |
| `ChannelKPIAdapter.ts` | 채널 KPI 이력 | `Channel_KPI` |
| `YouTubeApiAdapter.ts` | YouTube API 응답 정규화 | YouTube Data API v3 |
| `dataNormalizer.ts` | RawVideoRow → NormalizedVideo | 내부 변환 |

### AnalyticsAdapter 처리 데이터

```
_RawData_FullPeriod (행 형식 3가지 자동 판별)
  ├── [AGG]    4컬럼 집계행  : metric_type | dim_1 | dim_2 | value
  ├── [SNAP-A] 8컬럼 구버전  : snapshot_id | ... | collected_at | metric_type | dim_1 | dim_2 | value
  └── [SNAP-B] 8컬럼 신버전  : snapshot_id | ... | metric_type | dim_1 | dim_2 | value | collected_at

metric_type 분류:
  DEMOGRAPHICS   → age[]            (dim_1 startsWith "age" OR dim_1 = male/female)
  COUNTRY        → countries[]
  DEVICE         → devices[]
  KEYWORD        → keywords[]       (dim_2 = "search" 필터)
  EXTERNAL       → trafficSources[]
  EXTERNAL_DETAIL → internalInfluence[] (Top 10)
```

---

## 3. Electron IPC 브릿지 (electron/main.js)

| IPC 채널 | 방향 | 역할 |
|----------|------|------|
| `FETCH_SHEET_VIDEOS` | Renderer → Main | Google Sheets API 호출 |
| `FETCH_YT_ANALYTICS` | Renderer → Main | YouTube Analytics API 호출 |
| `YT_AUTH_STATUS` | Renderer → Main | YouTube OAuth 상태 확인 |
| `YT_AUTH_CLEAR` | Renderer → Main | YouTube 토큰 초기화 |
| `SHEETS_AUTH_STATUS` | Renderer → Main | Sheets OAuth 상태 확인 |
| `SHEETS_AUTH_CLEAR` | Renderer → Main | Sheets 토큰 초기화 |
| `load-official-state` | Renderer → Main | `logs/state.json` 로드 |
| `set-roadmap-meta` | Renderer → Main | 로드맵 메타 업데이트 |
| `load-tasks` / `add-task` / `update-task` / `delete-task` | Renderer → Main | 태스크 CRUD |
| `load-changelog` / `append-changelog` | Renderer → Main | 변경 이력 관리 |
| `get-pending-proposals` | Renderer → Main | AI 제안 목록 조회 |
| `approve-proposal` / `execute-proposal` | Renderer → Main | AI 제안 승인/실행 |

---

## 4. React 컨트롤러 레이어

### useYouTubeController

- **5분 폴링** (`setInterval 300,000ms`) — 자동 데이터 갱신
- `loadVideos()` → `fetchSheetVideos()` → `normalizeVideos()` → `runFullAnalysis()`
- `loadChannelKPI()` → `fetchChannelKPI()`
- `runFullAnalysis()` 메모이즈 (videos, period, weights 변경 시만 재계산)

**반환값:**

| 키 | 설명 |
|----|------|
| `dailyStats` | 일별 조회수 추세 |
| `topVideos` | 상위 영상 목록 |
| `contentClusters` | 콘텐츠 클러스터 분석 |
| `trendClusters` | 트렌드 클러스터 |
| `algorithmSignals` | 알고리즘 신호 |
| `algorithmFitness` | 알고리즘 적합도 점수 |
| `nextStrategy` | 다음 전략 제안 |
| `opportunityVideos` | 기회 영상 목록 |
| `tracksWithScore` | 트랙별 종합 점수 |
| `internalAnalysis` | 내부 분석 결과 |

**가중치 설정 (기본값):**

```js
{ growth: 0.25, reach: 0.25, engagement: 0.30, monetization: 0.20 }
```

---

### useAnalyticsController

- `period` 변경 시 `fetchAnalytics()` 재호출
- `periodRef`로 stale 응답 방지 (경쟁 조건 제거)
- `calcGrowth(current, prev30)` → 지표별 성장율 % 계산

**반환값:**

| 키 | 설명 |
|----|------|
| `analytics` | AnalyticsResult (current, prev30, hitVideos) |
| `growth` | 성장율 { views, likes, watchTime, avgDuration, subscribers } |
| `loadingAnalytics` | 로딩 상태 |

---

## 5. 경로 보호 시스템 (00_GUARD/path_rules.py)

```
허용 쓰기 경로
  ✅ 07_AUTOMATION/03_RUNTIME/    (캐시, 로그, 임시)
  ✅ 99_SYSTEM/DATA_SNAPSHOTS/
  ✅ 99_SYSTEM/LICENSE/DELIVERY/
  ✅ 99_SYSTEM/LICENSE/LOGS/

차단 경로
  ❌ 00_SOUNDSTORM_OS/            (01_TEAM_GUIDES 제외)
  ❌ 08_ARCHIVE_보관/             (직접 자동화 쓰기 금지)
```

---

## 6. 외부 연동 서비스

| 서비스 | 용도 |
|--------|------|
| YouTube Data API v3 | 영상 메타데이터, 채널 정보 수집 |
| YouTube Analytics API | 조회수, 시청시간, 트래픽 소스 분석 |
| Google Sheets API | 데이터 저장소 (원본 + 집계) |
| Google Drive API | 라이선스 PDF 폴더 저장 |
| Gmail API | 주문 이메일 수신 + 처리됨 마크 |
| SMTP (Gmail) | 라이선스 이메일 발송 |
| Cloudflare R2 | 라이선스 PDF 오브젝트 스토리지 |
| SQLite | 라이선스 발급 이력 DB |

---

## 7. 파이프라인 수 요약

| 레이어 | 파이프라인/모듈 수 | 상태 |
|--------|-----------------|------|
| Python 데이터 수집 (CI/로컬) | 4개 스크립트 | 운영 중 |
| Python 분석/동기화 엔진 | 6개 엔진 | 운영 중 |
| 라이선스 자동화 | 14단계 워크플로우 + 8개 core 모듈 | 운영 중 |
| 음원 관리 유틸 | 5개 스크립트 | 보조 도구 |
| TypeScript 어댑터 | 5개 | 운영 중 |
| Electron IPC 핸들러 | 13개 채널 | 운영 중 |
| React 컨트롤러 | 2개 | 운영 중 |

---

## 8. 핵심 설계 원칙

- **절대 키**: 모든 데이터 매핑은 `video_id` 기준
- **보호 컬럼**: `곡명`, `상품ID`, `음원파일`, `영상파일`, `장르`, `BPM` — 자동화 덮어쓰기 금지
- **경로 불변**: 절대 경로 하드코딩 금지 → `path_config.py` 동적 해석
- **쓰기 보호**: `path_rules.py` 가드 통과 후에만 쓰기 허용
- **셀 단위 업데이트**: `setValues()` 일괄 금지 → `setValue()` 개별 처리
