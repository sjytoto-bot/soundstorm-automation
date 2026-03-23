---
description: 07_AUTOMATION Runtime Flow 설계 확정 및 아키텍처 구조
---

# 07_AUTOMATION Runtime Flow 설계 확정

작성일시: 2026-02-26 04:46 KST 
팀: 운영팀_개발 | 단계: 1단계 시스템 안정화 | 레이어: 설계 (구조 고정 전 단계) — 파일 이동/삭제 금지

## 1️⃣ 전체 Runtime Flow 구조도

═══════════════════════════════════════════════════════
  SOUNDSTORM ARCHITECTURE — MASTER RUNTIME FLOW
═══════════════════════════════════════════════════════
[EXTERNAL SOURCES] YouTube Analytics / Naver Store / Google Forms
    │
    └──▶ [01_WORKSPACE_워크스페이스] ── (휴먼 개입: 원본 데이터 입력 및 작업 지시)
              │
              ▼
         [07_AUTOMATION_자동화]  ◀────────── [Google Sheets / Apps Script]
         <RUNTIME 핵심 엔진 / PRODUCER>
          ┌───┬───┬───┬────┐
          │   │   │   │    │
          ▼   ▼   ▼   ▼    ▼
        [분석][페이지][연동][시트][라이선스]
              │
              ├──▶ [04_STORE_스토어]          ← (전시/판매 채널 / CONSUMER)
              │     생성된 상품 페이지(HTML), 이미지 리소스 호스팅
              │     (휴먼 개입: 네이버 스토어 최종 업로드 및 검수)
              │
              ├──▶ [06_BRAND_브랜드]           ← (브랜딩/대시보드 / CONSUMER)
              │     대시보드 리포트 및 지표 시각화 리소스 수신
              │
              ▼
         [99_SYSTEM_시스템]               ← (데이터/라이선스 보존 / STORAGE ONLY)
         마스터 메타데이터, 로그, 라이선스 발급 원본 영구 보존 기록
─────────────────────────────────────────────────────

## 2️⃣ 자동화 레이어 구조 초안

```text
07_AUTOMATION_자동화/
│
├── [LAYER 1: SYSTEM CORE]           ← 전체 경로/환경 의존성 제어
│   └── core/path_config.py          → (STORE, BRAND, SYSTEM 경로 동적 주입)
│
├── [LAYER 2: ENGINE BLOCK]          ← 핵심 비즈니스 로직
│   ├── sheet_engine/                → Google Sheets 데이터 파싱 & 셔틀러 (hybrid_data_shuttler 등)
│   ├── analysis_engine/             → MP3/WAV 데이터 스캔 및 고도화 분석 (audio_analyzer_advanced 등)
│   ├── page_engine/                 → 상품 상세 페이지 HTML / 이미지 자동 생성
│   └── license_engine/              → 맞춤/전곡 라이선스 생성 및 발급
│
├── [LAYER 3: INTEGRATION]           ← 외부 서비스 결합
│   ├── google_apps_script/          → GAS 백업본 및 Webhook 수신부
│   └── automation_runtime/          → auto_sync.sh 등 크론/수동 트리거 진입점
│
└── [LAYER 4: ARCHIVE]               ← 레거시 보존
    └── legacy_tools/                → 과거 스크립트 도구 및 하위 호환성 아카이브
```

## 3️⃣ LICENSE 흐름 구조도

┌─────────────────────────────────────────────────────┐
│              LICENSE ENGINE FLOW                    │
└─────────────────────────────────────────────────────┘
**[주문 인입]**
 네이버 스토어 결제 → 결제자 폼 제출
   └──▶ `01_WORKSPACE_워크스페이스` 주문서 데이터 인입

**[검증 및 발급]**
 `07_AUTOMATION/license_engine` 트리거
   ├──▶ `01_WORKSPACE` RAW 정보 읽기
   ├──▶ `99_SYSTEM` 메타데이터 크로스체크 (MASTER_AUDIO 직접 접근 차단)
   └──▶ PDF 라이선스 문서 및 관리 코드 렌더링 / 드라이브 공유 링크 생성

**[PDF 공식 저장 위치] (설계 확정)**
 `99_SYSTEM/licenses/`
   ├── YYYY-MM/
   │   └── {SS-트랙ID-번호}_license.pdf
   └── license_index.db  ← 발급 기록 메타데이터

**[최종 배포]**
 결제자 이메일 자동 발송 (또는 04_STORE_스토어 채널 전달)


## 4️⃣ DATA 흐름 구조도

┌─────────────────────────────────────────────────────┐
│              DATA MASTER FLOW                       │
└─────────────────────────────────────────────────────┘
**[수집 (RAW DATA)]**
 YouTube Analytics (API/CSV) & 음원 제작 완료 (02_MUSIC) 데이터
   │
   ▼
**[가공 (PROCESSING)]**
 `07_AUTOMATION/`
   ├──▶ `analysis_engine` : MP3/WAV Raw 데이터 스캔 (librosa 등 활용)
   └──▶ `sheet_engine`    : Spreadsheet에서 _RawData_Master 셔틀링 수행
   │
   ▼
**[출력 (OUTPUT / CONSUMER)]**
   ├──▶ `04_STORE_스토어` : HTML 상품 상세/목록 페이지 렌더링 배포
   └──▶ `06_BRAND_브랜드` : JSON 리포트화 및 대시보드 지표 파일 반영
   │
   ▼
**[보존 (ARCHIVE / STORAGE)] (설계 확정)**
 `99_SYSTEM/`
   ├── master_archive/    ← 최상위 원본 아카이브 
   └── logs/              ← 실행 로그 및 상태 락(Lock) 기록 (READ-ONLY)


## 5️⃣ 구조 고정 제안안 (이동 전 단계)

> **IMPORTANT**
> 이 제안은 향후 파일 이주를 위한 확정 초안입니다. 실제 리소스 변경 및 폴더 생성은 다음 프로세스에서 수행합니다.

**Phase 1 — 역할 정의 및 레거시 제거 스코프**

| 항목 | 현재 상태 | 조치 예정 사항 |
| :--- | :--- | :--- |
| **04_STORE_스토어/** | 구동형 스크립트 대거 혼재 (MIXED) | 로직 실행 배제, 순수 **CONSUMER(정적 에셋 호스팅)** 뷰로 완전 전환 |
| **07_AUTOMATION_자동화/** | 산발적 스크립트 및 절대 경로 의존 | **PRODUCER 런타임 엔진**으로 격상, `path_config.py` 기반 완전 독립 |
| **99_SYSTEM_시스템/** | 아카이브 저장소 규칙 미비 | **SAFE_GUARD 스토리지**로 격리, 시스템 로그/메타데이터 전용 공간화 |

**Phase 2 — 핵심 자동화 스크립트 이주 준비 (04_STORE → 07_AUTOMATION)**
절대 경로 및 의존성 패치를 통과한 스토어 내부의 구동형 스크립트들을 자동화 레이어로 이관할 준비 상태 확립.
* 대상 파일: `hybrid_data_shuttler.py`, `audio_analyzer_advanced.py`, `finalize_master_data.py`, `find_missing_audio.py`, `auto_sync.sh` 및 의존 Python 모듈.

**Phase 3 — 구조 상태 검증 체크리스트 (최종)**
```yaml
store_code_files_remaining: 0 (구동형 코드의 하드 블로킹 완전 치유 확정)
automation_integrity: true (path_config 기반 프로젝트 디렉토리 루트 독립 역량 확보)
license_flow_intact: true (레이어 분리에 따른 문서/경로 소실 우려 차단)
data_flow_intact: true (절대경로 및 하드코딩 직접 접근 0개 도달로 안정성 입증)
structure_drift_risk: false (루트 동적 탐색 구조 도입으로 붕괴 리스크 100% 소거)
ready_for_move: true (엔진 물리적 이주 및 폴더 역할 조정 단계 진입 허가됨)
```
