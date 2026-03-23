# YouTube 구매 링크 댓글 자동 등록 · 고정 시스템 설계 보고서

**작성일**: 2026-03-19
**프로젝트**: SOUNDSTORM YouTube Comment Bot
**대상**: 유튜브 신규 업로드 영상 → 네이버 스토어 구매 링크 댓글 자동 등록 + 고정

---

## 1. 목표

유튜브에 영상이 업로드될 때마다 다음을 **완전 자동화**:

1. 최신 업로드 영상 감지 (아직 구매 링크 댓글 없는 영상 필터링)
2. 네이버 스토어 구매 링크 댓글 등록
3. 댓글 고정 (Pin)
4. 중복 실행 방지

---

## 2. 전체 플로우

```
[실행 트리거]
  크론 / GitHub Actions (15분 간격)
        │
        ▼
[1] 내 채널 업로드 플레이리스트 조회
  → 최근 N개 영상 가져오기
        │
        ▼
[2] 영상별 기존 댓글 조회
  → 내 채널 ID의 댓글이 이미 있으면 스킵
        │
        ▼
[3] 댓글 등록 (commentThreads.insert)
  → 랜덤 댓글 풀에서 선택
        │
        ▼
[4] 댓글 고정
  → 방법 A: YouTube API comments.setModerationStatus (제한적)
  → 방법 B: Playwright 자동화 (권장)
        │
        ▼
[5] 처리 로그 기록
  → 07_AUTOMATION_자동화/03_RUNTIME/comment_bot_log.json
```

---

## 3. 준비물

### 3-1. Google Cloud 설정

| 항목 | 내용 |
|------|------|
| 프로젝트 | 기존 SOUNDSTORM GCP 프로젝트 활용 |
| API 활성화 | YouTube Data API v3 |
| 인증 방식 | OAuth 2.0 (내 채널 소유자 계정) |
| 권한 범위 | `https://www.googleapis.com/auth/youtube.force-ssl` |
| 인증 파일 | `client_secret.json` → `99_SYSTEM/` 보관 (git 제외) |

### 3-2. Python 의존성

```bash
pip install \
  google-api-python-client \
  google-auth-oauthlib \
  google-auth-httplib2 \
  playwright
playwright install chromium
```

`07_AUTOMATION_자동화/requirements.txt`에 추가:
```
google-api-python-client>=2.100.0
google-auth-oauthlib>=1.1.0
google-auth-httplib2>=0.2.0
playwright>=1.40.0
```

---

## 4. 파일 구조

```
07_AUTOMATION_자동화/
└── youtube_comment_bot/
    ├── main.py                  # 실행 진입점
    ├── auth.py                  # OAuth 인증 + 토큰 관리
    ├── channel_scanner.py       # 최신 영상 조회 + 댓글 필터링
    ├── comment_poster.py        # 댓글 등록 (YouTube Data API)
    ├── comment_pinner.py        # 댓글 고정 (Playwright)
    ├── comment_templates.py     # 댓글 템플릿 풀
    ├── state_manager.py         # 처리된 영상 ID 상태 관리
    └── config.py                # 설정값 (스토어 URL, 채널 ID 등)
```

---

## 5. 핵심 모듈 설계

### 5-1. `config.py`

```python
import os

CHANNEL_ID = os.environ.get("YT_CHANNEL_ID", "")          # 내 채널 ID
NAVER_STORE_URL = os.environ.get("NAVER_STORE_URL", "")    # 네이버 스토어 링크
CLIENT_SECRET_PATH = "99_SYSTEM/client_secret.json"        # OAuth 인증 파일
TOKEN_PATH = "07_AUTOMATION_자동화/03_RUNTIME/yt_token.json"
STATE_PATH = "07_AUTOMATION_자동화/03_RUNTIME/comment_bot_state.json"
LOG_PATH = "07_AUTOMATION_자동화/03_RUNTIME/comment_bot_log.json"
MAX_VIDEOS_TO_CHECK = 10                                    # 최근 몇 개 영상까지 체크
```

### 5-2. `auth.py` — OAuth 인증

```python
import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from config import CLIENT_SECRET_PATH, TOKEN_PATH

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]

def get_youtube_service():
    creds = None

    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())

    return build("youtube", "v3", credentials=creds)
```

> **최초 1회**: 브라우저 OAuth 인증 필요. 이후 토큰 자동 갱신.

### 5-3. `channel_scanner.py` — 영상 조회 + 필터링

```python
from config import CHANNEL_ID, MAX_VIDEOS_TO_CHECK

def get_recent_video_ids(youtube) -> list[str]:
    """업로드 플레이리스트에서 최근 영상 ID 목록 반환"""
    ch_res = youtube.channels().list(
        part="contentDetails", id=CHANNEL_ID
    ).execute()
    uploads_id = ch_res["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    pl_res = youtube.playlistItems().list(
        part="snippet",
        playlistId=uploads_id,
        maxResults=MAX_VIDEOS_TO_CHECK
    ).execute()

    return [item["snippet"]["resourceId"]["videoId"] for item in pl_res["items"]]


def has_my_comment(youtube, video_id: str, my_channel_id: str) -> bool:
    """내 채널이 이미 댓글을 달았으면 True"""
    try:
        res = youtube.commentThreads().list(
            part="snippet",
            videoId=video_id,
            maxResults=20
        ).execute()
        for item in res.get("items", []):
            author_id = item["snippet"]["topLevelComment"]["snippet"]["authorChannelId"]["value"]
            if author_id == my_channel_id:
                return True
    except Exception:
        pass
    return False
```

### 5-4. `comment_templates.py` — 댓글 템플릿 풀

```python
import random
from config import NAVER_STORE_URL

TEMPLATES = [
    f"""🎧 공연 · 유튜브 · 팟캐스트에 바로 쓸 수 있는 라이선스 음원입니다.

✅ 1회 공연 / 평생 사용 라이선스 선택 가능
✅ 즉시 다운로드 · 상업용 허가 포함
👉 구매 링크: {NAVER_STORE_URL}""",

    f"""🎼 이 음원 라이선스 구매하기

영상 BGM · 공연 · 방송 사용 가능한 정품 라이선스입니다.
👉 네이버 스토어: {NAVER_STORE_URL}""",

    f"""💿 SOUNDSTORM 라이선스 음원

이 음원을 상업적으로 사용하시려면 라이선스가 필요합니다.
1회 공연 / 무제한 플랜 모두 준비되어 있어요.
👉 {NAVER_STORE_URL}""",
]

def pick_comment() -> str:
    return random.choice(TEMPLATES)
```

### 5-5. `comment_poster.py` — 댓글 등록

```python
def post_comment(youtube, video_id: str, text: str) -> str:
    """댓글 등록 후 댓글 ID 반환"""
    res = youtube.commentThreads().insert(
        part="snippet",
        body={
            "snippet": {
                "videoId": video_id,
                "topLevelComment": {
                    "snippet": {"textOriginal": text}
                }
            }
        }
    ).execute()
    return res["id"]  # commentThread ID
```

### 5-6. `comment_pinner.py` — 댓글 고정 (Playwright)

YouTube Data API는 공식적으로 댓글 고정(Pin) 엔드포인트를 제공하지 않음.
**Playwright로 실제 브라우저 세션을 통해 고정** 처리.

```python
from playwright.sync_api import sync_playwright
import time

def pin_comment_via_browser(video_id: str, comment_id: str, cookies_path: str):
    """
    Playwright로 YouTube Studio → 댓글 고정 클릭 자동화
    cookies_path: 저장된 YouTube 로그인 쿠키 (JSON)
    """
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # 로그인 쿠키 로드
        context.add_cookies(_load_cookies(cookies_path))
        page = context.new_page()
        page.goto(video_url)
        page.wait_for_timeout(3000)

        # 내 댓글 찾기 (aria-label 또는 data 속성 활용)
        # 댓글 더보기 버튼 클릭 → 고정 메뉴 선택
        # ⚠ YouTube DOM 구조 변경 시 셀렉터 업데이트 필요
        try:
            page.locator("#comment-id-" + comment_id[:12]).first.hover()
            page.locator("[aria-label='더보기']").first.click()
            page.wait_for_timeout(500)
            page.get_by_text("고정").first.click()
            page.wait_for_timeout(1000)
            print(f"[PIN] 댓글 고정 완료: {comment_id}")
        except Exception as e:
            print(f"[PIN] 고정 실패 (수동 처리 필요): {e}")
        finally:
            browser.close()


def _load_cookies(path: str) -> list:
    import json
    with open(path) as f:
        return json.load(f)
```

> **쿠키 추출 방법**: Chrome 확장 프로그램 `Cookie-Editor` → Export JSON → 저장
> 저장 위치: `07_AUTOMATION_자동화/03_RUNTIME/yt_cookies.json` (git 제외)

### 5-7. `state_manager.py` — 처리 상태 관리 (중복 방지)

```python
import json, os
from config import STATE_PATH

def load_state() -> dict:
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"processed_video_ids": []}

def save_state(state: dict):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def is_processed(state: dict, video_id: str) -> bool:
    return video_id in state.get("processed_video_ids", [])

def mark_processed(state: dict, video_id: str):
    state.setdefault("processed_video_ids", []).append(video_id)
```

### 5-8. `main.py` — 실행 진입점

```python
import json
from datetime import datetime, timezone
from auth import get_youtube_service
from channel_scanner import get_recent_video_ids, has_my_comment
from comment_poster import post_comment
from comment_pinner import pin_comment_via_browser
from comment_templates import pick_comment
from state_manager import load_state, save_state, is_processed, mark_processed
from config import CHANNEL_ID, LOG_PATH, STATE_PATH

COOKIES_PATH = "07_AUTOMATION_자동화/03_RUNTIME/yt_cookies.json"

def run():
    youtube = get_youtube_service()
    state = load_state()
    log_entries = []

    video_ids = get_recent_video_ids(youtube)
    print(f"[SCAN] 최근 영상 {len(video_ids)}개 확인")

    for video_id in video_ids:
        if is_processed(state, video_id):
            print(f"[SKIP] 이미 처리됨: {video_id}")
            continue

        if has_my_comment(youtube, video_id, CHANNEL_ID):
            print(f"[SKIP] 댓글 존재: {video_id}")
            mark_processed(state, video_id)
            continue

        comment_text = pick_comment()
        comment_id = post_comment(youtube, video_id, comment_text)
        print(f"[POST] 댓글 등록 완료: {video_id} → {comment_id}")

        pin_comment_via_browser(video_id, comment_id, COOKIES_PATH)

        mark_processed(state, video_id)
        log_entries.append({
            "video_id": video_id,
            "comment_id": comment_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    save_state(state)
    _append_log(log_entries)
    print("[DONE] 실행 완료")


def _append_log(entries: list):
    import os
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    existing = []
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            existing = json.load(f)
    with open(LOG_PATH, "w") as f:
        json.dump(existing + entries, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    run()
```

---

## 6. 자동 실행 설정

### 방법 A: Mac 로컬 크론 (현재 환경)

```bash
crontab -e
```

```cron
# 매 15분마다 실행
*/15 * * * * /usr/bin/python3 /path/to/07_AUTOMATION_자동화/youtube_comment_bot/main.py >> /path/to/03_RUNTIME/cron.log 2>&1
```

### 방법 B: GitHub Actions (서버 불필요, 권장)

`.github/workflows/youtube_comment_bot.yml`:

```yaml
name: YouTube Comment Bot

on:
  schedule:
    - cron: "*/15 * * * *"   # 15분마다
  workflow_dispatch:           # 수동 실행 버튼

jobs:
  run-bot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Python 설정
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: 의존성 설치
        run: |
          pip install google-api-python-client google-auth-oauthlib google-auth-httplib2 playwright
          playwright install chromium

      - name: OAuth 토큰 복원
        run: |
          echo '${{ secrets.YT_TOKEN_JSON }}' > 07_AUTOMATION_자동화/03_RUNTIME/yt_token.json
          echo '${{ secrets.YT_COOKIES_JSON }}' > 07_AUTOMATION_자동화/03_RUNTIME/yt_cookies.json
          echo '${{ secrets.CLIENT_SECRET_JSON }}' > 99_SYSTEM/client_secret.json

      - name: 봇 실행
        env:
          YT_CHANNEL_ID: ${{ secrets.YT_CHANNEL_ID }}
          NAVER_STORE_URL: ${{ secrets.NAVER_STORE_URL }}
        run: python 07_AUTOMATION_자동화/youtube_comment_bot/main.py
```

> **GitHub Secrets 등록 필요**:
> `YT_TOKEN_JSON`, `YT_COOKIES_JSON`, `CLIENT_SECRET_JSON`, `YT_CHANNEL_ID`, `NAVER_STORE_URL`

---

## 7. 환경 변수 / .env 설계

`07_AUTOMATION_자동화/youtube_comment_bot/.env`:

```env
YT_CHANNEL_ID=UCxxxxxxxxxxxxxxxxxxxxxxxx
NAVER_STORE_URL=https://smartstore.naver.com/soundstorm/products/...
```

---

## 8. 리스크 및 대응

| 리스크 | 내용 | 대응 방법 |
|--------|------|-----------|
| API 할당량 초과 | YouTube Data API는 일일 10,000 unit 제한 | 체크 빈도 15분 유지, 최근 10개만 조회 |
| 댓글 고정 실패 | YouTube DOM 구조 변경으로 셀렉터 깨짐 | 실패 시 로그 기록 → 수동 고정 알림 |
| 쿠키 만료 | Playwright 로그인 세션 만료 | 월 1회 쿠키 재추출 루틴 설정 |
| 계정 차단 위험 | 반복 자동화로 구글 계정 정지 가능성 | 15분 간격 유지, User-Agent 정상 브라우저 사용 |
| 중복 댓글 | 같은 영상에 여러 번 실행 | state_manager로 처리된 video_id 관리 |

---

## 9. 구현 우선순위 (단계별)

| 단계 | 작업 | 비고 |
|------|------|------|
| **Phase 1** | OAuth 인증 + 최신 영상 조회 테스트 | API 키 활성화 선행 |
| **Phase 2** | 댓글 등록 자동화 + state 관리 | 핵심 기능 |
| **Phase 3** | Playwright 댓글 고정 | 쿠키 준비 필요 |
| **Phase 4** | 크론 또는 GitHub Actions 연결 | 완전 자동화 |
| **Phase 5** | soundstorm-panel UI에서 실행 현황 모니터링 | 대시보드 연동 |

---

## 10. 관련 파일 참조

- `07_AUTOMATION_자동화/core/path_config.py` — 경로 설정
- `07_AUTOMATION_자동화/requirements.txt` — 의존성 추가 필요
- `07_AUTOMATION_자동화/03_RUNTIME/` — 런타임 상태/로그 저장 위치
- `99_SYSTEM/` — `client_secret.json` 보관 (git 제외)

---

*문서 버전: v1.0 | 작성: Claude Code + SOUNDSTORM OS*
