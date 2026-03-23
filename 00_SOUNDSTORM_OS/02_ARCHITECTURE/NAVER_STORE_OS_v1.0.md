# SOUNDSTORM NAVER STORE OS v1.2
**작성일: 2026-03-19 | 최종수정: 2026-03-19**
**기반 문서: Creator OS 마스터 보고서 + AI_OS v4.1 + Naver_walkthrough.md + 07_AUTOMATION Runtime Flow 설계 확정**
**실제 구현 파일 기준: smartstore_listener.py / issue_license.py / main_web.py / db_manager.py / config.py**

---

# 1. SYSTEM OVERVIEW

## 전체 구조 요약

```
SOUNDSTORM Business OS
│
├── Content Layer (YouTube Creator OS) ─────── 노출 엔진
│   ├── 영상 제작 → 업로드 → 알고리즘 최적화
│   ├── CTRAlertPanel / GoldenHourPanel / DiagnosticsPanel
│   └── video_id 기준 성과 데이터 → Google Sheets 동기화
│
├── Store Layer (Naver Store OS) ────────────── 전환 엔진  ← 이 문서
│   ├── 상품 패키지 → 키워드 → 클릭 → 구매
│   └── 주문 데이터 → License Engine으로 전달
│
├── Fulfillment Layer (License Engine v4.1) ── 발급 엔진
│   ├── Cloud Scheduler 5분 → /check-orders → Naver Commerce API → 발급 14단계
│   └── SQLite(licenses.db) + processed_orders.json 이중 중복 방지
│
└── Data Layer (Google Sheets + Snapshots) ─── 기억 엔진
    ├── 마스터 시트: video_id ↔ 상품ID 매핑
    └── 판매 기록 / 발급 로그 / 성과 스냅샷
```

## Growth Loop (핵심 순환 구조)

```
[YouTube 영상 노출]
        ↓
   시청자 유입 (외부 트래픽)
        ↓
   영상 설명란 / 고정 댓글 → 네이버스토어 링크
        ↓
   [네이버스토어 방문]
        ↓
   상품 클릭 → 구매 (네이버페이)
   ※ 배송메모에 YouTube URL + 이메일 입력 필수
        ↓
   [License Engine 자동 감지] ← Cloud Scheduler 5분 주기
        ↓
   음원 발급 → 이메일 수신 (보통 1시간 이내, 24시간 운영)
        ↓
   구매자 만족 → 재구매 / 리뷰 → 상품 노출 증가
        ↓
   스토어 트래픽 증가 → YouTube CTR 피드백
        ↓
   [Data Layer 기록] → 채널-매출 연결 분석
```

---

# 2. CORE LAYERS

## Content Layer (YouTube)

| 항목 | 상태 | 역할 |
|------|------|------|
| video_id 기준 영상 관리 | ✅ | 모든 데이터의 primary key |
| CTRAlertPanel | ✅ | CTR 3% 이하 영상 감지 → 썸네일 교체 트리거 |
| DiagnosticsPanel A-D' | ✅ | 채널 건강 진단 |
| GoldenHourPanel | ❌ 미구현 | 업로드 후 6시간 초기 반응 모니터링 |
| 외부 유입 Redirect Tracker | ❌ 미구현 | 네이버 링크 클릭 추적 |
| CampaignPerformancePanel | ✅ | 캠페인별 성과 추적 |

**스토어와 연결점**: 영상 설명란 URL → Redirect Tracker(미구현) → 스토어 방문 수

## Store Layer (Naver)

| 항목 | 현황 |
|------|------|
| 플랫폼 | 네이버 스마트스토어 |
| 결제 | 네이버페이 (네이버 생태계 내 완결) |
| 주문 API | Naver Commerce API (bcrypt + base64 서명) |
| 상품 유형 | 음원 편집·편곡 패키지 (디지털 배송) |
| 가격대 | 2만원 ~ 80만원 |
| 배송 방식 | 이메일 발송 (R2 presigned URL 7일) |
| 배송메모 활용 | YouTube URL + 이메일 주소 수집 필드로 사용 |
| ⚠️ 이메일 중요 | Naver Commerce API는 구매자 이메일 미제공 → 배송메모에서만 추출 |

## Data Layer

| 저장소 | 실제 경로 | 데이터 | 갱신 주기 |
|--------|----------|--------|----------|
| SQLite | `license_engine/data/license.db` | 발급 이력 (licenses 테이블) | 실시간 |
| processed_orders.json | `license_engine/data/processed_orders.json` | 처리 완료 주문 ID 목록 | 실시간 (⚠️ 재시작 시 초기화) |
| tracks.json | `license_engine/data/tracks.json` + GCS | Drive 음원 인덱스 | /rebuild-index 호출 또는 1시간 자동 |
| JSON 로그 | `license_engine/logs/{license_number}_log.json` | 발급별 최종 상태 | 발급마다 생성 |
| Google Drive / MASTER_AUDIO | MASTER_AUDIO_FOLDER_ID | 원본 WAV+MP3 마스터 음원 | 수동 업로드 |
| Cloudflare R2 | `soundstorm-license/licenses/{license_number}/` | 배송용 음원 사본 | 자동 업로드 |
| Google Sheets 마스터 | GDrive | video_id ↔ 상품ID ↔ 곡명 매핑 | 수동 (보호 컬럼) |
| 99_SYSTEM/DATA_SNAPSHOTS | GDrive | 성과 스냅샷 | 자동 (주기적) |

---

# 3. STORE OS 구조 (핵심)

## Store Pack 구조 정의

```
SOUNDSTORM Store Pack
│
├── Pack_ID: SP-{번호}
├── 연결 video_id: YT_{video_id}   ← 반드시 존재해야 함 (primary key)
├── 연결 track_id: YouTube ID 11자리 ← Drive 음원 파일명에 사용
│
├── [상품 구성]
│   ├── 기본팩: 음원 단품 (MP3/WAV 선택)
│   ├── 편곡팩: 기본 + 악보 + 편곡 파일
│   └── 풀팩: 모든 포함 + 상업용 라이선스
│
├── [가격 구조]
│   ├── 개인 사용: 20,000원
│   ├── 방송/유튜브: 50,000원
│   ├── 상업용 전용: 80,000원
│   └── 편곡 의뢰: 별도 견적
│
├── [배송 메모 필드 — 구매자 안내 필수]
│   ├── youtube_url: 사용할 YouTube 영상 URL
│   └── email: 음원 발송 이메일 주소
│   ※ 안내 문구 예시:
│     "배송 메모에 아래 두 가지를 입력해 주세요.
│      1. 사용할 YouTube 영상 URL
│      2. 라이선스를 받을 이메일 주소
│      예: https://youtube.com/watch?v=XXXXXXXXXXX / my@email.com"
│
└── [키워드 구조]
    ├── 장르 키워드: {장르} 음원, {장르} bgm
    ├── 용도 키워드: 유튜브 브금, 방송 배경음악, 편곡 의뢰
    └── 영상 연결: 영상 제목 키워드 → 스토어 검색 연결
```

## 음원 파일명 규칙 (매우 중요 — License Engine 의존)

```
SS-{번호}_{YouTubeID}_{곡명}.{확장자}

예:
  SS-028_abc123xyz89_토벌.mp3
  SS-028_abc123xyz89_토벌.wav

동일 YouTube ID로 wav + mp3 두 파일을 올리면 자동으로 패키지 발송됨
(drive_manager.download_files()가 youtube_id 기반으로 파일명 검색)
```

## 상품 Lifecycle

```
[Phase 1: 영상 업로드]
video_id 생성 → YouTube 영상 게시
→ 영상 설명란에 스토어 링크 삽입
→ 음원 파일 Drive에 업로드 (SS-{N}_{video_id}_{곡명}.wav + .mp3)
→ POST /rebuild-index 호출 → tracks.json 갱신 (GCS + 로컬)
→ 마스터 시트에 video_id 등록

[Phase 2: 상품 등록]
스마트스토어 상품 생성 → 상품ID 발급
→ 마스터 시트에 상품ID 기록 (video_id와 연결)
→ 키워드 최적화 → 상품 썸네일 설정
→ 배송메모 안내 문구 삽입 확인

[Phase 3: 판매 중]
구매 발생 → 배송메모 입력 (YouTube URL + email)
→ License Engine 자동 감지 (5분 이내)
→ 음원 발급 (14단계) → 이메일 발송 → 발송처리(배송완료 전환)

[Phase 4: 성과 분석]
판매 데이터 → Data Layer 기록
→ 영상별 매출 연결 (video_id 기준)
→ 어떤 영상이 구매로 이어지는지 추적

[Phase 5: 최적화]
낮은 전환 상품 → 키워드 수정 / 썸네일 변경
높은 전환 영상 → 해당 음원 추가 프로모션
```

---

# 4. LICENSE ENGINE 상세 (실제 구현 기준)

## 실제 인프라

| 항목 | 값 |
|------|----|
| GCP 프로젝트 | soundstorm-automation |
| License Engine | Cloud Run (Flask, PORT=8080) |
| Engine URL | https://license-engine-774503242418.asia-northeast3.run.app |
| Cloud Scheduler 이름 | smartstore-check-orders |
| Scheduler Cron | `*/5 * * * *` (5분마다 /check-orders 호출) |
| tracks.json 동기화 | sync-tracks-index (1시간마다 /rebuild-index 호출) |
| Max Instance | 1 (동시 실행 방지) |
| R2 버킷 | soundstorm-license (Config.R2_BUCKET 기본값) |
| Email SMTP | smtp.gmail.com:587 (Config 기본값) |
| Secrets 관리 | GCP Secret Manager + .env |
| MASTER_AUDIO_FOLDER_ID | 13PwE6LIkhQRWvxWTuV57Coh0RBDMVK3- |
| DRIVE_ROOT_FOLDER_ID | 12Ae8iVE7n8FYRgJtRWezaeRQLzwPJyfF |
| VERIFY_BASE_URL | https://soundstorm.kr/verify |

## Config 환경변수 (config.py 기준)

```python
# license_engine/config.py — 실제 Config 클래스
BASE_DIR  = license_engine/               # __file__ 기준
DATA_DIR  = license_engine/data/
LOGS_DIR  = license_engine/logs/
OUTPUT_DIR = license_engine/output/       # 음원 임시 다운로드 폴더
TEMPLATES_DIR = license_engine/templates/
DB_PATH   = license_engine/data/license.db
```

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| DRIVE_ROOT_FOLDER_ID | '' | 12Ae8iVE7n8FYRgJtRWezaeRQLzwPJyfF |
| MASTER_AUDIO_FOLDER_ID | '' | 13PwE6LIkhQRWvxWTuV57Coh0RBDMVK3- |
| R2_ENDPOINT | '' | Cloudflare R2 엔드포인트 |
| R2_BUCKET | 'soundstorm-license' | R2 버킷명 |
| R2_ACCESS_KEY | '' | - |
| R2_SECRET_KEY | '' | - |
| SMTP_SERVER | 'smtp.gmail.com' | - |
| SMTP_PORT | 587 | - |
| SMTP_USER | '' | - |
| SMTP_PASSWORD | '' | - |
| GMAIL_CREDENTIALS_JSON | None | Secret Manager JSON 문자열 우선 |
| GMAIL_TOKEN_JSON | None | Secret Manager JSON 문자열 우선 |
| NAVER_CLIENT_ID | '' | ⚠️ I vs l 혼동 주의 |
| NAVER_CLIENT_SECRET | '' | bcrypt salt ($2a$04$...) |
| NAVER_ACCOUNT_ID | '' | ncp_1otl6a_01 |
| VERIFY_BASE_URL | 'https://soundstorm.kr/verify' | QR 코드 URL |

## License Engine 폴더 구조

```
license_engine/
├── core/
│   ├── drive_manager.py        ← Google Drive 음원 검색 + 다운로드
│   ├── r2_manager.py           ← Cloudflare R2 업로드 + presigned URL 생성
│   ├── mail_sender.py          ← Gmail SMTP 발송 (PDF + WAV링크 + MP3링크)
│   ├── pdf_renderer.py         ← WeasyPrint + Jinja2, A4 2페이지
│   ├── qr_generator.py         ← QR 코드 base64 생성
│   ├── issue_license.py        ← 발급 메인 14단계 워크플로우
│   ├── db_manager.py           ← SQLite CRUD + 중복 체크
│   ├── number_generator.py     ← 라이선스 번호 생성 보조
│   └── smartstore_listener.py  ← Naver Commerce API 주문 조회 + 발송처리
├── templates/
│   └── soundstorm_license_TEMPLATE.html
├── data/
│   ├── license.db              ← SQLite (licenses 테이블)
│   ├── tracks.json             ← Drive 음원 인덱스 (YouTube ID → 파일경로)
│   └── processed_orders.json   ← 처리 완료 주문 ID (⚠️ 재시작 시 초기화)
├── logs/
│   └── {license_number}_log.json  ← 발급별 최종 상태 JSON 로그
├── output/                     ← 음원 임시 다운로드 폴더 (발급 후 자동 삭제)
├── scripts/
│   └── build_tracks_index.py   ← Drive 스캔 → tracks.json 생성 → GCS 업로드
├── main_web.py                 ← Flask 앱 (엔드포인트 정의)
├── config.py
├── Dockerfile
└── requirements.txt
```

## SQLite licenses 테이블 스키마 (실제)

```sql
CREATE TABLE IF NOT EXISTS licenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    license_number  TEXT UNIQUE,                      -- SS-{track_id}-{YYYYMMDD}-{seq:02d}
    order_number    TEXT,                             -- Naver product_order_id
    message_id      TEXT,                             -- 현재 = product_order_id (동일값)
    track_id        TEXT,                             -- YouTube ID 11자리
    buyer_name      TEXT,
    buyer_email     TEXT,
    issue_date      TEXT,                             -- ISO datetime
    status          TEXT,                             -- PENDING / SUCCESS / FAILED / PARTIAL / ROLLBACK
    error_code      TEXT,
    error_message   TEXT,
    created_at      TEXT,
    UNIQUE(order_number, message_id)                  -- 복합 유니크 제약
);
```

## 라이선스 번호 형식 (실제)

```
SS-{track_id}-{YYYYMMDD}-{seq:02d}

예:
  SS-abc123xyz89-20260319-01   ← 해당 트랙+날짜 첫 번째 발급
  SS-abc123xyz89-20260319-02   ← 같은 날 두 번째 발급

seq는 get_latest_seq_for_date(track_id, date_str)로 조회 후 +1
동시성 충돌 시 max 2회 재시도 (BEGIN IMMEDIATE 트랜잭션)
```

## R2 저장 구조

```
soundstorm-license/
└── licenses/
    └── {license_number}/
        ├── SS-028_abc123xyz89_토벌.wav
        └── SS-028_abc123xyz89_토벌.mp3

R2 Object Name: licenses/{license_number}/{audio_filename}
Presigned URL 유효기간: 604800초 (7일)
```

## 발급 상태 전이 (실제 DB status 컬럼)

```
주문 감지
    ↓
PENDING  ← create_pending_license() — BEGIN IMMEDIATE 트랜잭션
    ↓
Drive 다운로드 + R2 업로드 성공
    ↓
이메일 발송 성공 → SUCCESS (update_license_status)
이메일 발송 실패 → PARTIAL (Drive+R2 유지, 이메일만 실패)
Drive/R2 실패  → FAILED

PARTIAL 상태: 발송처리(dispatch_order) 스킵됨
             ⚠️ 구매자에게 음원 미전달 — 현재 운영자 알림 없음
```

---

# 5. DATA FLOW (실제 코드 기준)

## 전체 처리 흐름

```
STAGE 0: Cloud Scheduler 트리거
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cloud Scheduler (smartstore-check-orders, */5 * * * *)
  → POST https://license-engine-774503242418.asia-northeast3.run.app/check-orders


STAGE 1: Naver Commerce API 주문 조회 (smartstore_listener.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1. _get_access_token()
  - timestamp = str(int(time.time() * 1000))
  - message = f"{client_id}_{timestamp}"
  - hashed = bcrypt.hashpw(message, client_secret)
  - sig = base64.b64encode(hashed)
  - POST /v1/oauth2/token → access_token

Step 2. 결제완료 주문 ID 목록 조회
  - GET /v1/pay-order/seller/product-orders/last-changed-statuses
    params: lastChangedFrom(24h전 KST), lastChangedTo(현재 KST), lastChangedType=PAYED
  - 응답: data.lastChangeStatuses[].productOrderId
    ⚠️ 키 이름: lastChangeStatuses (Changed 아닌 Change)

Step 3. 주문 상세 조회
  - POST /v1/pay-order/seller/product-orders/query
    body: {"productOrderIds": [...], "quantityClaimCompatibility": true}
  - 응답: data[] → {order: {...}, productOrder: {...}}

Step 4. _parse_order() — 필드 추출
  YouTube ID 탐색 순서 (11자리 추출):
    1. productOrder.shippingMemo → URL 패턴 또는 11자리 코드 추출
    2. productOrder.productOption
    3. productOrder.sellerCustomCode1
    4. productOrder.sellerCustomCode2
    5. productOrder.productName

  이메일 탐색 순서 (regex: [a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}):
    1. order.buyerEmail (API 미제공 — 항상 빈 값)
    2. order.ordererEmail (API 미제공)
    3. productOrder.shippingMemo 이메일 패턴
    4. productOrder.productOption 이메일 패턴

  반환 구조:
    {
      product_order_id: str,
      order_id: str,
      buyer_name: str,
      buyer_email: str,
      track_id: str,          # YouTube ID 11자리
      track_title: str,       # productOrder.productName
      license_type: "permanent",
      raw_memo: str,          # YouTube ID 발견된 원본 필드 값
      product_order_status: str
    }


STAGE 2: 중복 체크 + 발급 (main_web.py → issue_license.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[중복 방지 3단계]
1. productOrderStatus != "PAYED" → skip ("not_payed")
2. product_order_id in processed_orders.json → skip
3. db_manager.order_exists(order_number) → skip ("duplicate")
4. db_manager.check_duplicate(order_number, message_id) → skip ("skip")
   ※ 현재 order_number == message_id (같은 값) → 사실상 3,4번은 동일

[issue_license_process() 14단계]
1.  입력값 검증 (all 필수 필드 체크)
2.  채번: SS-{track_id}-{YYYYMMDD}-{seq:02d}
         seq = get_latest_seq_for_date(track_id, date_str) + 1
3.  QR 생성: generate_qr_base64(license_number) → base64
4.  HTML 렌더링: Jinja2 템플릿 + 구매자/곡명/라이선스번호/QR
5.  PDF 생성: WeasyPrint → output/ 임시 저장
6.  DB PENDING 등록: BEGIN IMMEDIATE (동시성 충돌 시 재시도, max 2회)
7.  Drive 다운로드: drive_manager.download_files(youtube_id=track_id,
                   target_folder_id=MASTER_AUDIO_FOLDER_ID, save_dir=OUTPUT_DIR)
                   → 파일명 SS-{번호}_{youtube_id}_{곡명}.{ext}로 검색
8.  R2 업로드: r2_manager.upload_file(local_path, "licenses/{license_number}/{filename}")
9.  Presigned URL 생성: r2_manager.generate_presigned_url(r2_object_name, 604800)
10. 로컬 임시파일 삭제: os.remove(local_audio_path)
11. (drive_links 딕셔너리 완성: {"wav": url, "mp3": url})
12. 이메일 발송: send_license_email(buyer_email, license_number, drive_links, pdf_path)
                 → 라이선스 PDF 첨부 + WAV 링크 + MP3 링크
13. DB SUCCESS 업데이트: update_license_status(license_number, "SUCCESS")
14. JSON 로그: db_manager.save_json_log(license_number, result_data)
               → logs/{license_number}_log.json

[발송처리]
  res.status == "success"인 경우에만:
    listener.dispatch_order(product_order_id)
    → POST /v1/pay-order/seller/product-orders/dispatch
       payload: deliveryMethod="NOTHING", deliveryCompanyCode="NOTHING",
                trackingNumber="DIGITAL", dispatchDate=KST ISO datetime
    → 스마트스토어 주문 상태 = 배송완료

[processed_orders.json 갱신]
  발급 성공/실패 모두 processed_ids에 추가 후 파일 저장
  ⚠️ Cloud Run 로컬 파일 → 인스턴스 재시작 시 초기화


STAGE 3: 데이터 기록
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SQLite licenses 테이블 status 전이:
  PENDING → SUCCESS: 모든 과정 완료
  PENDING → PARTIAL: 이메일 발송 실패 (Drive+R2 성공)
  PENDING → FAILED:  Drive/R2/PDF/QR 오류

JSON 로그 파일: logs/{license_number}_log.json
  {
    "status": "success" | "failed" | "partial",
    "issued_at": "ISO datetime",
    "license_number": "SS-...",
    "drive_folder_url": "R2 presigned URL",
    "error_code": "ERR001" | null,
    "error_message": "..." | null
  }
```

---

# 6. NAVER COMMERCE API 상세

## 인증 (실제 코드 기준)

```python
# smartstore_listener.py _get_access_token()

timestamp = str(int(time.time() * 1000))
message = f"{self.client_id}_{timestamp}"

hashed = bcrypt.hashpw(
    message.encode('utf-8'),
    self.client_secret.encode('utf-8')   # client_secret이 bcrypt salt 역할
)
sig = base64.b64encode(hashed).decode('utf-8')

POST /v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
Body: client_id, timestamp, client_secret_sign=sig, grant_type=client_credentials, type=SELF
```

## 발송처리 API Payload (실제)

```json
POST /v1/pay-order/seller/product-orders/dispatch

{
  "dispatchProductOrders": [
    {
      "productOrderId": "{product_order_id}",
      "deliveryMethod": "NOTHING",
      "deliveryCompanyCode": "NOTHING",
      "trackingNumber": "DIGITAL",
      "dispatchDate": "2026-03-19T10:30:00.000+09:00"
    }
  ]
}
```

⚠️ 주의사항:
- `deliveryMethod: ETC` — API enum에 없음 (코드 주석에 명시)
- `dispatchDate` — NotNull 필수, 누락 시 400 에러
- 이미 발송처리된 주문에 재호출 시 API 에러 반환 (정상 동작)
- PARTIAL 상태(이메일 실패) 시 dispatch_order 호출 안 됨

---

# 7. FLASK API 엔드포인트 (main_web.py)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/` | GET | Health check → "License Engine v2.0 is running." |
| `/check-orders` | GET, POST | Cloud Scheduler 주문 감지 + 발급 처리 |
| `/issue-license` | POST | 직접 발급 (테스트용) |
| `/rebuild-index` | GET, POST | Drive 스캔 → tracks.json 재생성 → GCS 업로드 + 로컬 갱신 |

### /issue-license 필수 필드
```json
{
  "order_number": "TEST-001",
  "buyer_name": "테스트",
  "buyer_email": "test@example.com",
  "track_id": "YouTubeID11",
  "track_title": "테스트 트랙",
  "license_type": "permanent"
}
```

### /rebuild-index 동작
```python
# build_tracks_index.py
scan_drive_files()   # MASTER_AUDIO 폴더 스캔
build_index(files)   # YouTube ID → 파일경로 매핑
upload_to_gcs(index) # GCS에 영구 저장
# + 로컬 data/tracks.json도 임시 갱신
```

---

# 8. 07_AUTOMATION 레이어 구조

```
07_AUTOMATION_자동화/
│
├── [LAYER 1: SYSTEM CORE]           ← 전체 경로/환경 의존성 제어
│   └── core/path_config.py          → STORE, BRAND, SYSTEM 경로 동적 주입
│
├── [LAYER 2: ENGINE BLOCK]          ← 핵심 비즈니스 로직
│   ├── sheet_engine/                → Google Sheets 데이터 파싱 & 셔틀러
│   ├── analysis_engine/             → MP3/WAV 데이터 스캔 및 오디오 분석
│   ├── page_engine/                 → 상품 상세 페이지 HTML/이미지 자동 생성
│   └── license_engine/              ← ✅ 현재 완전 가동 중
│
├── [LAYER 3: INTEGRATION]           ← 외부 서비스 결합
│   ├── google_apps_script/          → GAS 백업본 및 Webhook 수신부
│   └── automation_runtime/          → auto_sync.sh 등 크론/수동 트리거
│
└── [LAYER 4: ARCHIVE]               ← 레거시 보존
    └── legacy_tools/                → 과거 스크립트 도구
```

## 레이어 역할 분리 원칙

| 레이어 | 역할 | 쓰기 권한 |
|--------|------|----------|
| 07_AUTOMATION | PRODUCER (실행 전용) | 03_RUNTIME, 99_SYSTEM |
| 04_STORE_스토어 | CONSUMER (정적 에셋 호스팅만) | 없음 (읽기 전용) |
| 06_BRAND_브랜드 | CONSUMER (대시보드 시각화) | 없음 (읽기 전용) |
| 99_SYSTEM | SAFE_GUARD STORAGE | 자동화만 쓰기 가능 |
| 01_WORKSPACE | 휴먼 입력 포인트 | 사람만 |

---

# 9. PROBLEM DETECTION SYSTEM

## 감지 → 판단 → 액션 테이블

| 문제 유형 | 감지 데이터 | 판단 기준 | 트리거 액션 |
|-----------|------------|----------|------------|
| **Drive 음원 누락** | tracks.json 매핑 실패 | YouTube ID 매칭 없음 → 발급 FAILED | /rebuild-index 호출 + 수동 확인 Task |
| **이메일 발송 실패** | DB status = PARTIAL | 이메일 미발송 (Drive+R2 성공) | 현재: 조용히 실패 ❌ → 재시도 구현 필요 |
| **발급 전체 실패** | DB status = FAILED | Drive/R2/PDF 오류 | 현재: JSON 로그만 기록 ❌ → 알림 필요 |
| **배송메모 YouTube ID 없음** | _parse_order() None 반환 | 모든 필드에서 11자리 미발견 | logging.warning만 기록 (알림 없음) |
| **배송메모 이메일 없음** | buyer_email = '' | 이메일 패턴 미발견 | 빈 이메일로 발급 시도 → PARTIAL |
| **processed_orders.json 초기화** | 인스턴스 재시작 | 파일 없음 | SQLite 3단계 중복 체크로 커버 |
| **상품 CTR 급락** | 네이버 노출/클릭 | CTR < 3% or -30% | 썸네일 교체 Task 생성 (미구현) |
| **구매 전환율 급락** | CVR = orders/clicks | CVR < 1% 지속 3일 | 상세페이지 리뉴얼 Task (미구현) |
| **R2 링크 만료** | presigned_url 생성일 | D-1 접근 | 재발급 여부 확인 (자동화 없음) |

## 에러 코드 정의 (실제)

| 코드 | 의미 |
|------|------|
| ERR000 | 처리 중 알 수 없는 시스템 오류 |
| ERR001 | 필수 입력값 누락 |
| ERR004 | PDF 생성 실패 |
| ERR006 | 라이선스 번호 채번 충돌 연속 (max 2회 초과) |
| R2_ERR | R2 업로드 또는 파일 처리 오류 |
| DriveManagerError.code | Drive 다운로드 실패 (별도 정의) |
| MailSenderError.code | 이메일 발송 실패 (별도 정의) |

---

# 10. AUTOMATION STRUCTURE

## 현재 가동 중인 자동화

```
1. License Engine (Cloud Run, asia-northeast3) ✅ 완전 가동
   URL: https://license-engine-774503242418.asia-northeast3.run.app
   ├── Cloud Scheduler: smartstore-check-orders — 5분 주기
   ├── Cloud Scheduler: sync-tracks-index — 1시간 주기 /rebuild-index
   ├── Max Instance = 1 (동시 실행 방지)
   ├── 발급 14단계 완전 자동 (주문 감지 → 음원 → PDF → 이메일 → 발송처리)
   └── SQLite + processed_orders.json 이중 중복 방지

2. YouTube Analytics 자동화 ✅
   ├── api_data_shuttler.py: YouTube → Google Sheets 동기화
   ├── analytics_snapshot_engine.py: 주기적 스냅샷
   ├── alert_engine.py: CTR/노출 이상 감지
   └── action_tracker.py: 액션 기록

3. SmartStore 청취 (License Engine 내) ✅
   └── smartstore_listener.py: Naver Commerce API 주문 조회 + 발송처리
```

## 부족한 자동화 (GAP 목록)

| 자동화 항목 | 우선순위 | 현재 상태 | 구현 위치 |
|------------|---------|----------|----------|
| **발급 실패 운영자 알림** | P0 | ❌ 조용히 실패 | license_engine/core/issue_license.py |
| **PARTIAL 상태 재시도** | P0 | ❌ 이메일 실패 시 방치 | license_engine/core/mail_sender.py |
| **배송메모 파싱 실패 알림** | P0 | ❌ logging.warning만 | smartstore_listener.py |
| **processed_orders.json → Cloud Storage** | P0 | ❌ 휘발성 위험 | main_web.py 또는 SQLite 단일화 |
| **Redirect Tracker** | P1 | ❌ 폴더만 존재 | 07_AUTOMATION/redirect_tracker/ |
| **Store 지표 수집기** | P1 | ❌ 없음 | scripts_스크립트/naver_store_metrics.py |
| **video_id → 매출 연결** | P1 | ❌ 수동만 가능 | analytics/store_revenue_engine.py |
| **Store CTR Alert** | P2 | ❌ 없음 | analytics/store_alert_engine.py |
| **대시보드 Store 탭** | P2 | ❌ 없음 | src/components/StoreView.jsx |
| **상품-영상 자동 매핑 알림** | P2 | ❌ 없음 | YouTube webhook → Task 생성 |
| **리뷰 모니터링** | P3 | ❌ 없음 | Playwright 스크래핑 |
| **License Engine Webhook** | P3 | ❌ Poll 방식 | Naver webhook 연동 |

---

# 11. DASHBOARD 구조

## Layer 0~3 (Store OS 탭 — 미구현, StoreView.jsx 신규 개발 필요)

```
LAYER 0: KPI STRIP (항상 상단 고정)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  이번달  │  노출수  │  클릭률  │  전환율  │  미처리  │
│  매출    │         │  (CTR)  │  (CVR)  │  주문수  │
│ 320,000 │ 48,200  │  4.2%   │  1.8%   │   0     │
└─────────┴─────────┴─────────┴─────────┴─────────┘


LAYER 1: 실행 시그널 (긴급 액션 필요 항목)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────────────────────┐ ┌─────────────────────────┐
│  FulfillmentAlert       │ │  ProductCTRAlert         │
│  PARTIAL 주문: 0         │ │  CTR 위험 상품: 2개      │
│  FAILED 주문: 0          │ │  [힐링피아노브금] 2.1%   │
│  상태: ✅ 정상           │ │  [재즈카페브금] 1.8%     │
└─────────────────────────┘ └─────────────────────────┘

┌─────────────────────────┐ ┌─────────────────────────┐
│  RevenueByVideo         │ │  StoreTrafficPanel       │
│  video_id별 매출         │ │  유입 소스 분포          │
│  YT_abc123: 160,000     │ │  네이버검색: 72%         │
│  YT_def456:  80,000     │ │  YouTube 직접: ?% (미추적)│
└─────────────────────────┘ └─────────────────────────┘


LAYER 2: 분석 근거
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ProductPerformanceTable: 상품ID | 이름 | 노출 | CTR | CVR | 매출
FulfillmentLogTable: 주문ID | 상품 | 발급시간 | status (최근 10건)


LAYER 3: 로우 데이터
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- SQLite 전체 발급 이력 (license_number, status, buyer_name, track_id)
- 네이버 주문 원본 데이터 (JSON 뷰어)
- JSON 로그 파일 목록 (logs/)
```

## StoreKPI 타입 정의

```typescript
interface StoreKPI {
  // LAYER 0
  revenue_this_month: number;
  impressions_30d: number;
  store_ctr: number;
  store_cvr: number;
  pending_orders: number;           // = 0이어야 정상

  // LAYER 1 시그널
  partial_orders: Order[];          // DB status = PARTIAL (이메일 미발송)
  failed_orders: Order[];           // DB status = FAILED
  low_ctr_products: Product[];      // CTR < 3%
  top_revenue_video_id: string;

  // LAYER 2 분석
  revenue_by_video: Record<string, number>;
  revenue_by_product: Record<string, number>;
  fulfillment_success_rate: number; // SUCCESS / (SUCCESS + PARTIAL + FAILED)
}
```

---

# 12. CURRENT SYSTEM GAP

## 완전성 평가

| 영역 | 현재 완성도 | 핵심 GAP |
|------|-----------|---------|
| 발급 자동화 (14단계) | ✅ 95% | PARTIAL/FAILED 알림 없음 |
| 중복 방지 | ✅ 90% | processed_orders.json 휘발성 위험 |
| 배송메모 파싱 | ✅ 80% | YouTube ID 없으면 None 반환 + warning만 |
| 스토어 지표 수집 | ❌ 10% | 네이버 통계 자동 수집 없음 |
| YouTube → Store 유입 추적 | ❌ 0% | Redirect Tracker 미구현 |
| video_id ↔ 매출 연결 | ❌ 20% | 수동 연결만 가능 |
| 대시보드 Store 탭 | ❌ 0% | soundstorm-panel에 Store 탭 없음 |
| 문제 감지 (Store) | ❌ 0% | StoreAlertEngine 미구현 |
| 재구매 추적 | ❌ 0% | buyer_youtube_id 활용 없음 |

## 병목 구간 (Bottleneck Analysis)

```
BOTTLENECK #1: PARTIAL 상태 운영자 알림 없음 [운영 위험]
현상: 이메일 발송 실패 시 DB에 PARTIAL로만 기록, 조용히 넘어감
위험: 구매자 음원 미수신 → 고객 불만 → 리뷰 하락
해결: issue_license.py — PARTIAL 발생 시 즉시 운영자 알림

BOTTLENECK #2: processed_orders.json 휘발성 [운영 위험]
현상: Cloud Run 인스턴스 재시작 시 처리 기록 초기화
위험: SQLite 체크 전 processed_orders.json 체크가 소실됨
해결: SQLite를 단일 소스로 격상, JSON 파일 제거 (더 안전)

BOTTLENECK #3: YouTube → Store 유입 블랙홀 [데이터 손실]
현상: 영상 설명란 링크 클릭 후 어떻게 되는지 모름
해결: 07_AUTOMATION/redirect_tracker/ 내 FastAPI 서버 구축 (폴더 이미 존재)

BOTTLENECK #4: 네이버 스토어 지표 수집 없음 [데이터 손실]
현상: 상품별 노출/클릭 데이터가 시스템에 없음
해결: 네이버 파트너센터 통계 API 또는 Playwright 스크래핑

BOTTLENECK #5: 대시보드 Store 탭 없음 [운영 불편]
현상: soundstorm-panel에 YouTube 탭은 있으나 Store 탭 없음
해결: StoreView.jsx 구현 (P2)
```

---

# 13. NEXT ACTION ROADMAP

## P0 — 즉시 구현 (운영 안전 보장)

**[P0-A] PARTIAL/FAILED 상태 운영자 알림**
```
파일: license_engine/core/issue_license.py
추가:
  - process_status == "partial" → 운영자에게 즉시 알림
    (이메일 또는 Electron 알림)
  - error_code/error_message 포함한 알림 내용
  - alert_log.json 기록 (기존 alert_engine.py와 동일 구조)
```

**[P0-B] 이메일 발송 재시도 (max 3회)**
```
파일: license_engine/core/mail_sender.py 또는 issue_license.py
추가:
  - MailSenderError 발생 시 10분 간격 retry (max 3회)
  - 3회 모두 실패 시 PARTIAL + 운영자 알림
```

**[P0-C] processed_orders.json → SQLite 단일화**
```
파일: license_engine/main_web.py
변경:
  - processed_orders.json 체크 제거
  - SQLite order_exists() + check_duplicate() 만으로 중복 방지
  - (또는 Cloud Storage에 영구 저장)
```

**[P0-D] 배송메모 파싱 실패 알림**
```
파일: license_engine/core/smartstore_listener.py
추가:
  - YouTube ID 추출 실패 시 → logging.warning + 홀딩 큐
  - 이메일 추출 실패 시 → 발급 시도 전 운영자 확인 Task
```

---

## P1 — 1주 내 구현 (핵심 데이터 수집)

**[P1-A] Redirect Tracker 구축**
```
기존 폴더: 07_AUTOMATION_자동화/redirect_tracker/ (이미 존재)
구현:
  - FastAPI 서버: /r/{short_code} → redirect + click 기록
  - short_code = video_id 기반 생성
  - 클릭 로그: {video_id, timestamp, user_agent, referer}
  - 주 1회 집계 → Google Sheets 동기화
```

**[P1-B] 네이버 스토어 지표 수집**
```
신규 파일: 07_AUTOMATION_자동화/scripts_스크립트/naver_store_metrics.py
수집 대상:
  - 상품별 노출수, 클릭수, 구매수
  - 수집 주기: 일 1회 (야간)
  - 저장: Google Sheets "Store_Metrics" 시트
```

**[P1-C] video_id ↔ 매출 자동 집계**
```
신규 파일: 07_AUTOMATION_자동화/analytics/store_revenue_engine.py
로직:
  - SQLite license.db → track_id 기반 집계
  - track_id → video_id 변환 (마스터 시트 참조)
  - 출력: revenue_by_video.json → 99_SYSTEM/DATA_SNAPSHOTS
```

---

## P2 — 2주 내 구현 (대시보드)

**[P2-A] soundstorm-panel Store 탭**
```
신규 파일: 00_SOUNDSTORM_OS/soundstorm-panel/src/components/StoreView.jsx
컴포넌트:
  - StoreKPIStrip           (LAYER 0)
  - FulfillmentStatusPanel  (LAYER 1: PARTIAL/FAILED 주문 수)
  - ProductCTRAlertPanel    (LAYER 1: CTR 위험 상품)
  - RevenueByVideoPanel     (LAYER 2: 영상별 매출)
  - ProductPerformanceTable (LAYER 2: 상품 성과표)
  - FulfillmentLogTable     (LAYER 3: 발급 이력)
데이터 소스: SQLite → store_revenue_engine.py 결과 JSON
```

**[P2-B] StoreAlertEngine**
```
신규 파일: 07_AUTOMATION_자동화/analytics/store_alert_engine.py
감지: CTR_LOW, CTR_DROP, CVR_LOW, FULFILLMENT_FAIL, AUDIO_MISSING
통합: 기존 alert_engine.py와 동일한 alert_log.json 구조
```

---

## P3 — 3주 이후 (고도화)

**[P3-A] License Engine Webhook 전환**
```
현재: Cloud Scheduler Poll (5분 지연)
목표: Naver 주문 Webhook → 즉시 발급
```

**[P3-B] buyer_youtube_id 활용**
```
track_id(구매한 음원 영상 ID)와 별도로,
구매자가 사용할 영상 ID 추적 → 어떤 규모의 창작자가 구매하는지 파악
```

**[P3-C] 가격 최적화 분석**
```
license_type별 전환율 분석 (현재 고정값 "permanent")
→ 가격 조정 추천
```

---

# 14. 운영 명령어 레퍼런스

```bash
# check-orders 수동 실행
curl -X POST https://license-engine-774503242418.asia-northeast3.run.app/check-orders

# tracks.json 인덱스 강제 갱신 (Drive 스캔 → GCS + 로컬 갱신)
curl -X POST https://license-engine-774503242418.asia-northeast3.run.app/rebuild-index

# Health check
curl https://license-engine-774503242418.asia-northeast3.run.app/
# → "License Engine v2.0 is running."

# Cloud Scheduler 강제 실행
gcloud scheduler jobs run smartstore-check-orders --location=asia-northeast3

# License Engine 로그 조회
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="license-engine"' \
  --limit=20 --format="table(timestamp, textPayload)"

# 라이선스 직접 발급 (테스트)
curl -X POST https://license-engine-774503242418.asia-northeast3.run.app/issue-license \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "TEST-001",
    "buyer_name": "테스트",
    "buyer_email": "test@example.com",
    "track_id": "YouTubeID11",
    "track_title": "테스트 트랙",
    "license_type": "permanent"
  }'
```

---

# 15. 시스템 상태 (2026-03-19 기준)

| 항목 | 상태 |
|------|------|
| Naver Commerce API 인증 | ✅ 정상 |
| Cloud Scheduler (5분 주기) | ✅ 정상 |
| License Engine (Cloud Run) | ✅ 정상 |
| Drive 음원 매칭 (tracks.json) | ✅ 정상 |
| tracks.json GCS 동기화 | ✅ 정상 |
| R2 업로드 + presigned URL | ✅ 정상 |
| PDF 생성 (WeasyPrint + Jinja2) | ✅ 정상 |
| QR 코드 생성 | ✅ 정상 |
| 이메일 발송 (Gmail SMTP) | ✅ 정상 |
| 발송처리 (스마트스토어 배송완료) | ✅ 정상 |
| SQLite 중복 방지 | ✅ 정상 |
| 발급 상태 DB 추적 (PENDING/SUCCESS/PARTIAL/FAILED) | ✅ 정상 |
| PARTIAL/FAILED 운영자 알림 | ❌ 미구현 |
| 이메일 발송 재시도 | ❌ 미구현 |
| processed_orders.json 영속성 | ❌ 위험 (휘발성) |
| 배송메모 파싱 실패 알림 | ❌ 미구현 (warning만 기록) |
| Store 대시보드 탭 | ❌ 미구현 |
| Redirect Tracker | ❌ 미구현 |
| 네이버 스토어 지표 수집 | ❌ 미구현 |

---

# 16. 가격 정책 (실제 판매 기준)

## 기본 라이선스 가격

| 상품 | 가격 | 비고 |
|------|------|------|
| 일회성 라이선스 (1회 공연/행사용) | 99,000원 | 횟수·기간 제한 |
| 영구 라이선스 (평생 사용) | 149,000원 | 기간·횟수 무제한 |
| 편집 옵션 | +50,000원 | 라이선스 별도 구매 필요 |
| 편곡 옵션 | +250,000원 | 라이선스 비용 별도 |
| 맞춤 제작 (Bespoke) | 800,000원 ~ | 범위에 따라 협의 |

## 편집 범위 정의 (미확정 — 정의 필요)

```
편집 (+50,000원) 포함 범위:
  [ ] 러닝타임 단순 컷 (인트로/아웃트로 제거)
  [ ] 구간 반복 (특정 부분 루프)
  [ ] 페이드인/페이드아웃 처리
  [ ] BPM 미세 조정 (±5% 이내)

편집 제외 범위 (→ 편곡으로 분류):
  [ ] 구간 재구성 (전반부/후반부 뒤집기 등)
  [ ] 악기 추가/제거
  [ ] 분위기/장르 변경
```

## 편곡 범위 정의 (미확정 — 정의 필요)

```
편곡 (+250,000원, 라이선스 별도) 포함 범위:
  [ ] 구간 재구성 및 타이밍 조정
  [ ] 효과음 보강 (SFX 추가)
  [ ] 무도/안무 동작과 비트 싱크 최적화
  [ ] 악기 추가 또는 레이어 보강
  수정 횟수: 2회 포함 (이후 추가 작업은 별도 협의)

편곡 초과 범위 (→ 맞춤 제작으로 분류):
  [ ] 최초 요청과 다른 구조 변경
  [ ] 러닝타임 대폭 변경
  [ ] 새로운 구간 설계 추가
  [ ] 분위기/장르 방향 자체 변경
```

## 묶음 할인 구조

| 구매 | 가격 | 절감 | 심리 효과 |
|------|------|------|----------|
| 1곡 | 99,000원 | - | 기본 |
| 2곡 패키지 | 179,000원 | -19,000원 | "한 곡 더" 유도 |
| 3곡 패키지 | 249,000원 | -48,000원 | 오프닝+전투+클라이맥스 |
| 5곡 패키지 | 399,000원 | -96,000원 | 공연 전체 구성 |

**5곡 패키지 판매 포인트**: 공연 구성이 보통 5트랙 (오프닝/전개/클라이맥스/전투/엔딩)

---

# 17. 상품 구조 전략

## 전체 상품 구조

```
스토어
│
├── [대표 상품] 공연 음악 사용 라이선스
│   ├── 옵션: 1곡 라이선스 (99,000원 / 149,000원)
│   ├── 옵션: 2곡 패키지 (179,000원)
│   ├── 옵션: 3곡 패키지 (249,000원)
│   └── 옵션: 5곡 패키지 (399,000원)
│   구매 방법: 배송 메모에 YouTube 영상 URL 입력
│
├── [장르 패키지 상품] — 추가 매출 (미구현)
│   ├── Battle Pack (전투/전쟁 분위기)
│   ├── Korean Traditional Pack (태평소/북/전통)
│   ├── Dark Cinematic Pack (어두운 분위기)
│   └── Performance Pack (퍼포먼스용 리듬)
│
└── [개별 곡 상품] — 유입용 (현재 49개 운영 중)
    ├── 역할: YouTube → 특정 음악 검색 → 스토어 유입 (SEO)
    ├── Assassin Night, Advance, War Drums, ...
    └── 상세페이지에 대표 상품으로 유도 문구 삽입
        "여러 곡을 사용하는 공연의 경우
         '공연 음악 사용 라이선스 상품'을 이용하시면
         묶음 구매가 가능합니다."
```

**핵심 전략**: 개별 곡 = 입구 / 대표 라이선스 상품 = 결제

## 현재 스토어 상태

| 항목 | 현황 |
|------|------|
| 현재 완성된 상세페이지 | 전곡 라이선스 상세페이지 |
| 상세페이지 실제 위치 | `04_STORE/01_Naver_Page/02. 전곡 라이선스 상세페이지/새로운 상세페이지/` |
| 개별 곡 상품 수 | 49개 (유입용 SEO) |
| 플레이리스트 장르 분류 | 5개로 나누는 중 (진행 중) |
| 대표 상품 | 미구현 → P1 구현 예정 |
| 장르 패키지 상품 | 미구현 → P2 구현 예정 |

## 묶음 구매 배송메모 처리 (자동화 호환)

묶음 옵션도 현재 자동화 시스템으로 처리 가능:

```
[구매자 배송 메모 입력 예시 — 2곡 패키지]
https://youtube.com/watch?v=abc123xyz
https://youtube.com/watch?v=def456uvw

[자동화 처리]
smartstore_listener._extract_youtube_id() → 2개 URL 순차 추출
→ 음원 2개 각각 Drive 검색 → R2 업로드 → 이메일 발송
```

⚠️ **현재 구조 제한**: `issue_license_process()`는 단일 `track_id` 기준으로 처리
→ 묶음 구매 대응을 위해 복수 track_id 처리 로직 추가 필요 (P1)

---

# 18. 상세페이지 구성 계획

## HTML → PNG 변환 자동화 방법

**✅ 구현 완료** — `export.command` 더블클릭으로 실행

```
실제 파일 위치:
04_STORE/01_Naver_Page/02. 전곡 라이선스 상세페이지/새로운 상세페이지/
├── export.command   ← 더블클릭으로 실행 (bash → node export.js)
├── export.js
└── node_modules/
```

```bash
# export.command 내부 (자동 실행)
cd "$(dirname "$0")"
node export.js
```

실행 방법: `export.command` 파일 더블클릭 → 같은 폴더 기준으로 `node export.js` 자동 실행

## FAQ 섹션 (미구현 — 상세페이지 추가 필요)

### Q1. 라이선스 종류 차이

> **일회성 라이선스 (99,000원)**: 공연/행사 1회 사용권
> **영구 라이선스 (149,000원)**: 기간·횟수 제한 없이 평생 사용
>
> 모든 구매 시 공식 **[음원 사용 승인서]** 자동 발급

### Q2. 편집/편곡 진행 절차

> 1. 사전 상담: 안무 영상 또는 편집 필요 구간 정보 전달
> 2. 옵션 결제: 상담 내용에 맞는 옵션 결제
> 3. 작업 착수: 자료 수령 후 영업일 기준 2일 이내 1차 결과물 전달
> 4. 수정 및 완료: 2회 이내 수정 후 최종 고음질 음원 전달
>
> ※ 동작과 비트가 딱딱 맞는 '무도 최적화 편곡'을 권장

### Q3. 라이선스 승인서 발급 방법

> 결제 완료 후 배송 메모에 아래 입력:
> - YouTube 영상 URL
> - 라이선스를 받을 이메일 주소
>
> 결제 완료 후 1시간 이내 자동 발급 (24시간 운영)
> 스팸 메일함 확인 권장

### Q4. 맞춤 제작 가능 여부

> 네, 가능합니다. '맞춤 제작 (Bespoke)' 서비스로 팀 전용 테마곡 제작
> - 비용: 800,000원부터 (기획 범위에 따라 협의)
> - 독점 사용권 부여 + 기획 컨설팅 포함
> - 레퍼런스 곡이나 컨셉을 메시지로 전달해 주세요

---

# 19. 문의 자동화 (미구현)

**현재 상태**: ❌ 미구현 — 수동 응대 중

## 편곡 문의 답변 템플릿

```
안녕하세요.^^ 요청해주신 내용 모두 확인했습니다.

말씀해주신 작업은
구간 재구성, 타이밍 조정, 효과음 보강이 포함되는
무도/안무 최적화 편곡 작업에 해당합니다.
비용은 아래와 같습니다.

- 무도/안무 최적화 편곡: 250,000원
- 공연용 영구 라이선스: 149,000원
총 399,000원입니다.

작업 완료 후, 처음 요청 주신 방향 범위 내에서의
보완 수정은 추가 비용 없이 2회까지 가능합니다.

다만 아래 경우에는 추가 비용이 발생할 수 있습니다.
- 최초 요청과 다른 구조 변경
- 러닝타임 대폭 변경
- 새로운 구간 설계 추가
- 분위기/장르 방향 자체 변경

이 경우는 추가 작업으로 판단되어 별도 협의 후 진행됩니다.

작업 확정 시 2일 이내 1차 결과물 전달 가능합니다.
```

## 자동화 구현 목표 (미구현)

```
[트리거]
네이버 톡톡 문의 수신

[분류]
  키워드 감지:
    "편곡" / "구간" / "타이밍" → 편곡 답변 템플릿
    "편집" / "컷" / "길이" → 편집 답변 템플릿
    "맞춤" / "제작" / "전용" → 맞춤 제작 답변 템플릿
    "라이선스" / "승인서" → 발급 안내 답변 템플릿

[자동 발송]
  분류된 템플릿 → 네이버 톡톡 자동 답변

[미분류]
  → 수동 응대 플래그 + 운영자 알림
```

## 네이버 톡톡 '자주 묻는 질문' 설정 (미구현)

네이버 파트너센터 → 채널 관리 → 자주 묻는 질문에 아래 4개 등록 필요:

| 번호 | 질문 | 상태 |
|------|------|------|
| 1 | 라이선스 종류 차이가 무엇인가요? | ❌ 미등록 |
| 2 | 음원 편집/편곡 진행 절차가 궁금합니다. | ❌ 미등록 |
| 3 | 결제 후 라이선스 승인서는 어떻게 받나요? | ❌ 미등록 |
| 4 | 우리 팀만을 위한 곡 제작도 가능한가요? | ❌ 미등록 |

---

# 버전 이력

```
License Engine 버전:
  v3.0 (2026-03-16) — Playwright Worker 기반 스크래핑
  v4.0 (2026-03-17) — Naver Commerce API 직접 연동 (Playwright 완전 제거)
  v4.1 (2026-03-17) — 자동 발송처리 + 이메일 추출 로직 + API 파싱 버그 수정

NAVER_STORE_OS 문서 버전:
  v1.0 (2026-03-19) — 초안 작성
  v1.1 (2026-03-19) — Naver_walkthrough.md + 07_AUTOMATION Runtime Flow 통합
  v1.2 (2026-03-19) — 실제 구현 파일(smartstore_listener.py, issue_license.py,
                       main_web.py, db_manager.py, config.py) 분석 반영
                       라이선스 번호 형식, DB 스키마, 14단계 상세, 에러 코드 추가
  v1.3 (2026-03-19) — 가격 정책, 상품 구조 전략, 묶음 할인, 장르 패키지 계획,
                       FAQ 템플릿, 문의 자동화 구현 목표, 편집/편곡 범위 정의 추가
```

**다음 업데이트 기준**: P0 완료 후 (PARTIAL 알림 + 이메일 재시도 + processed_orders.json 영속성 해결)
