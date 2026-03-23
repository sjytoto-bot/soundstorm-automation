
---
# 🎵 SOUNDSTORM License Engine v4.1 — 운영 레퍼런스

이 문서는 **SOUNDSTORM 라이선스 자동 발급 시스템의 전체 구조와 운영 방법**을 정리한 상시 레퍼런스입니다.
시스템이 어떻게 돌아가는지 언제든 빠르게 파악할 수 있도록 작성되었습니다.

**마지막 업데이트**
2026-03-17 (자동 발송처리 추가 — 이메일 발송 후 스마트스토어 배송완료 처리)

---

# 📌 전체 자동화 흐름

```
[네이버 스마트스토어 주문 발생]
        ↓
구매자가 배송 메모에 YouTube 링크 + 이메일 주소 입력
        ↓
[Cloud Scheduler] — 5분마다 /check-orders 호출
        ↓
[Cloud Run — license-engine]
        ↓
Naver Commerce API 인증 (bcrypt + base64 서명)
        ↓
GET last-changed-statuses → 결제완료 주문 ID 목록 조회
        ↓
POST product-orders/query → 주문 상세 정보 조회
        ↓
shippingMemo / productOption에서 YouTube ID + 이메일 추출
        ↓
주문 상태 PAYED 확인 (취소 주문 방지)
        ↓
order_number 중복 체크
        ↓
Google Drive 음원 검색 (YouTube ID 기반)
        ↓
[R2 업로드 — soundstorm-license]
        ↓
Presigned URL 생성 (7일)
        ↓
라이선스 PDF 생성
        ↓
구매자 이메일 자동 발송
        ↓
[발송처리 API 호출 — deliveryMethod: NOTHING]
        ↓
스마트스토어 주문 상태 = 배송완료
```

---

# 🧠 시스템 아키텍처

```
SmartStore (주문 발생)
      ↓
Cloud Scheduler (5분, POST /check-orders)
      ↓
License Engine (Cloud Run)
      ↓
Naver Commerce API (주문 조회)
      ↓
Google Drive (음원 파일)
      ↓
Cloudflare R2 (다운로드 배포)
      ↓
PDF 생성 + SMTP 이메일 발송
      ↓
Naver Commerce API (발송처리)
```

---

# 🔑 핵심 인프라

|항목|값|
|---|---|
|GCP 프로젝트|soundstorm-automation|
|License Engine|Cloud Run|
|Cloud Scheduler|smartstore-check-orders|
|Scheduler Cron|*/5 * * * *|
|License Engine URL|https://license-engine-774503242418.asia-northeast3.run.app|
|Drive Storage|Google Drive|
|File Distribution|Cloudflare R2|
|Email|Gmail SMTP|
|Secrets|GCP Secret Manager|

---

# 📂 폴더 구조

## License Engine

```
license_engine/
├── core/
│   ├── drive_manager.py
│   ├── r2_manager.py
│   ├── mail_sender.py
│   ├── pdf_renderer.py
│   ├── issue_license.py
│   ├── db_manager.py
│   ├── number_generator.py
│   └── smartstore_listener.py    ← Naver Commerce API 주문 조회 + 발송처리
├── templates/
│   └── soundstorm_license_TEMPLATE.html
├── data/
│   └── tracks.json
├── scripts/
│   └── build_tracks_index.py
├── main_web.py
├── config.py
├── Dockerfile
└── requirements.txt
```

---

# 📂 Google Drive 음원 구조

|폴더|ID|
|---|---|
|MASTER_AUDIO_FOLDER|13PwE6LIkhQRWvxWTuV57Coh0RBDMVK3-|
|DRIVE_ROOT_FOLDER|12Ae8iVE7n8FYRgJtRWezaeRQLzwPJyfF|

---

# 🎧 음원 파일명 규칙 (매우 중요)

```
SS-{번호}_{YouTubeID}_{곡명}.{확장자}
```

예

```
SS-028_abc123xyz89_토벌.mp3
SS-028_abc123xyz89_토벌.wav
```

동일 YouTube ID로

```
wav
mp3
```

두 파일을 올리면 **자동으로 패키지 발송됩니다.**

---

# 🔐 Naver Commerce API 인증

## 인증 방식: bcrypt + base64 서명

```python
timestamp = str(int(time.time() * 1000))
message = f"{client_id}_{timestamp}"

hashed = bcrypt.hashpw(
    message.encode('utf-8'),
    client_secret.encode('utf-8')   # client_secret이 bcrypt salt 역할
)
sig = base64.b64encode(hashed).decode('utf-8')
```

## Token 요청

```
POST https://api.commerce.naver.com/external/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}
timestamp={timestamp}
client_secret_sign={sig}
grant_type=client_credentials
type=SELF
```

## 환경 변수

|변수|설명|
|---|---|
|NAVER_CLIENT_ID|네이버 커머스 API 앱 ID|
|NAVER_CLIENT_SECRET|bcrypt salt ($2a$04$... 형식)|
|NAVER_ACCOUNT_ID|셀러 계정 ID (ncp_1otl6a_01)|

> ⚠️ **주의**: client_id와 client_secret에서 `I`(대문자 아이)와 `l`(소문자 엘) 혼동 주의.
> 네이버 콘솔에서 직접 복사하여 사용할 것.

---

# 🔄 주문 처리 흐름

## 1️⃣ Scheduler 실행

Cloud Scheduler가 **5분마다 /check-orders 호출**

```
POST https://license-engine-774503242418.asia-northeast3.run.app/check-orders
```

---

## 2️⃣ Naver Commerce API 주문 조회

`SmartstoreListener.fetch_new_orders()`가 수행하는 작업:

**Step 1 — 결제완료 주문 ID 목록 조회**

```
GET /v1/pay-order/seller/product-orders/last-changed-statuses
  lastChangedFrom: 24시간 전 (KST)
  lastChangedTo: 현재 (KST)
  lastChangedType: PAYED
```

> ⚠️ **API 응답 구조 주의**: 응답 키는 `lastChangeStatuses` (Changed 아님, Change).
> `data.lastChangeStatuses[].productOrderId` 로 접근해야 합니다.

**Step 2 — 주문 상세 정보 조회**

```
POST /v1/pay-order/seller/product-orders/query
  { "productOrderIds": [...], "quantityClaimCompatibility": true }
```

추출 데이터

|필드|소스|
|---|---|
|product_order_id|productOrder.productOrderId|
|buyer_name|order.ordererName|
|buyer_email|shippingMemo 또는 productOption에서 이메일 패턴 추출 (API 미제공)|
|track_id|shippingMemo → productOption → sellerCustomCode1/2 → productName|
|track_title|productOrder.productName|
|license_type|permanent (고정)|
|product_order_status|productOrder.productOrderStatus|

**YouTube ID 탐색 순서**: `shippingMemo` → `productOption` → `sellerCustomCode1` → `sellerCustomCode2` → `productName`

**이메일 탐색 순서**: `order.buyerEmail` (API 미제공) → `shippingMemo` 이메일 패턴 → `productOption` 이메일 패턴

---

## 3️⃣ License Engine 처리

`main_web.py /check-orders`가 수행하는 작업

1️⃣ 주문 상태 PAYED 확인 (취소 주문 방지)
2️⃣ processed_orders.json 중복 체크
3️⃣ `issue_license_process()` 호출
4️⃣ 라이선스 발급 성공 시 `dispatch_order()` 호출

`issue_license_process()`가 수행하는 작업

1️⃣ order_number 중복 체크 (DB)
2️⃣ YouTube ID 기반 Drive 음원 검색
3️⃣ 라이선스 번호 생성
4️⃣ R2 업로드
5️⃣ Presigned URL 생성
6️⃣ PDF 생성
7️⃣ 이메일 발송

`dispatch_order()`가 수행하는 작업

8️⃣ Naver Commerce API 발송처리 → 스마트스토어 배송완료 상태 전환

---

# 📦 발송처리 API

디지털 상품 발송처리에 사용하는 API 및 payload

```
POST /v1/pay-order/seller/product-orders/dispatch
```

```json
{
  "dispatchProductOrders": [
    {
      "productOrderId": "{product_order_id}",
      "deliveryMethod": "NOTHING",
      "deliveryCompanyCode": "NOTHING",
      "trackingNumber": "DIGITAL",
      "dispatchDate": "{KST 현재시각}"
    }
  ]
}
```

> ⚠️ **주의사항**
> - `deliveryMethod: ETC` — API enum에 없음, 사용 불가
> - `dispatchDate` — NotNull 필수 필드, 누락 시 400 에러
> - 이미 발송처리된 주문에 재호출 시 API 에러 반환 (정상 동작)
> - 발송처리는 `issue_license_process()` 성공 시에만 실행 (이메일 발송 실패 시 스킵)

---

# ☁️ R2 파일 저장 구조

```
soundstorm-license
└── licenses/
    └── {license_number}/
        ├── file.wav
        └── file.mp3
```

Presigned URL

```
유효기간: 7일
```

---

# 📄 라이선스 PDF

생성 방식

```
WeasyPrint
+ Jinja2
```

포맷

```
A4 2페이지
```

포함 정보

```
License Number
Buyer Name
Track Title
License Type
QR Code
```

---

# ✉️ 이메일 발송

SMTP

```
smtp.gmail.com
port 587
```

메일 내용

```
라이선스 PDF
WAV 다운로드 링크
MP3 다운로드 링크
```

---

# 🛡️ 중복 방지 시스템

현재 시스템은 **3단계 중복 보호 구조**입니다.

### 1️⃣ 주문 상태 체크

발송처리 전 `productOrderStatus == PAYED` 확인

취소 요청 중인 주문에 발송처리 실행되는 것을 방지

---

### 2️⃣ License Engine 파일 체크

```
data/processed_orders.json
```

이미 처리된 주문 필터링 (Cloud Run 인스턴스 내 로컬 파일)

---

### 3️⃣ License Engine DB

```
order_exists(order_number)
```

중복 발급 차단 (SQLite)

---

# ⚙️ 인덱스 동기화

새 음원을 Drive에 업로드하면

```
tracks.json
```

을 갱신해야 합니다.

---

## 즉시 동기화

```
https://license-engine-774503242418.asia-northeast3.run.app/rebuild-index
```

---

## 자동 동기화

Cloud Scheduler

```
sync-tracks-index
```

1시간마다 실행

---

# 🧪 테스트 명령어

## check-orders 수동 실행

```bash
curl -X POST https://license-engine-774503242418.asia-northeast3.run.app/check-orders
```

---

## Scheduler 강제 실행

```bash
gcloud scheduler jobs run smartstore-check-orders --location=asia-northeast3
```

---

## License Engine 로그

```bash
gcloud logging read \
'resource.type="cloud_run_revision" AND resource.labels.service_name="license-engine"' \
--limit=20 --format="table(timestamp, textPayload)"
```

---

## 라이선스 직접 발급 (테스트)

```bash
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

# ⚠️ 운영 시 주의사항

### 파일명 규칙

반드시

```
SS-번호_YouTubeID_곡명.확장자
```

형식 사용

---

### Drive 파일 누락

YouTube ID가 매칭되지 않으면

```
라이선스 발급 실패
```

`/rebuild-index` 호출로 tracks.json 갱신 후 재시도

---

### 구매자 배송 메모 안내 (필수)

구매자가 배송 메모에 **YouTube URL과 이메일 주소를 함께** 입력해야 합니다.
상품 페이지에 아래 안내 문구 삽입 권장:

```
배송 메모에 아래 두 가지를 입력해 주세요.
1. 사용할 YouTube 영상 URL
2. 라이선스를 받을 이메일 주소
예: https://www.youtube.com/watch?v=XXXXXXXXXXX / my@email.com
```

> ⚠️ **이메일 미입력 시**: Naver Commerce API는 구매자 이메일을 제공하지 않습니다.
> 배송 메모에 이메일이 없으면 이메일 발송이 실패하고 라이선스가 전달되지 않습니다.

---

### Naver API 자격증명 관리

- client_id, client_secret 변경 시 Cloud Run 환경 변수 즉시 업데이트 필요
- `I`(대문자 아이) vs `l`(소문자 엘) 혼동은 400 "client_id 항목이 유효하지 않습니다" 오류 발생
- 반드시 네이버 콘솔 화면에서 복사하여 사용

---

# 🚀 향후 업그레이드 계획

다음 단계에서 고려할 개선 사항

1️⃣ License Engine Webhook 구조 (Push 기반 주문 수신)
2️⃣ Worker Health Check Endpoint
3️⃣ 관리자 대시보드 (발급 현황 조회)
4️⃣ processed_orders.json → Cloud Storage 영구 저장 (인스턴스 재시작 시 초기화 방지)

---

# 📊 시스템 상태 요약

|항목|상태|
|---|---|
|Naver Commerce API|정상|
|Cloud Scheduler|정상|
|License Engine|정상|
|Drive 매칭|정상|
|R2 배포|정상|
|PDF 생성|정상|
|이메일 발송|정상|
|발송처리 (스마트스토어)|정상|

---

# 시스템 버전

```
SOUNDSTORM License Engine v4.1
```

아키텍처

```
Naver Commerce API + Cloud Scheduler 기반 자동 발급 + 발송처리 시스템
```

변경 이력

```
v3.0 (2026-03-16) — Playwright Worker 기반 스크래핑 아키텍처
v4.0 (2026-03-17) — Naver Commerce API 직접 연동 (Playwright 제거)
v4.1 (2026-03-17) — 자동 발송처리 추가 + 이메일 추출 로직 + API 파싱 버그 수정
```

---
