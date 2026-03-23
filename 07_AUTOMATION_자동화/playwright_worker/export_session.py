"""
Naver SmartStore 로컬 세션 익스포트 스크립트

사용법:
  1. python3 export_session.py
  2. 브라우저가 열리면 Naver 로그인 (2FA 포함)
  3. SmartStore 대시보드 로딩 완료 확인
  4. Enter 키 입력 → session.json 저장
  5. 아래 명령으로 Worker에 업로드:
     curl -X POST https://playwright-worker-774503242418.asia-northeast3.run.app/seed-session \
       -H "Content-Type: application/json" \
       -d @session.json
"""

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SELLER_CENTER_URL = "https://sell.smartstore.naver.com/"
SESSION_OUTPUT = Path(__file__).parent / "session.json"
WORKER_URL = "https://playwright-worker-774503242418.asia-northeast3.run.app/seed-session"


async def main():
    print("=" * 60)
    print("Naver SmartStore 세션 익스포트")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        page = await context.new_page()

        # Naver 로그인 페이지에서 시작 — 로그인 후 SmartStore로 리디렉션 감지
        login_url = "https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fsell.smartstore.naver.com%2F"
        await page.goto(login_url, wait_until="domcontentloaded")

        print("\n브라우저가 열렸습니다 (Naver 로그인 페이지).")
        print("1. ID/PW 입력 후 로그인 버튼 클릭")
        print("2. 핸드폰으로 Naver 2FA 승인을 완료해주세요.")
        print("3. SmartStore 대시보드 진입 시 자동으로 세션이 저장됩니다.")
        print("(최대 3분 대기)")

        # 로그인 완료 자동 감지 —
        # 로그인 페이지에서 시작했으므로 SmartStore URL로 바뀌면 진짜 로그인 완료
        try:
            await page.wait_for_url(
                "**/sell.smartstore.naver.com/**",
                timeout=180000  # 3분
            )
            # Angular 앱이 완전히 로드될 때까지 추가 대기
            await page.wait_for_timeout(3000)
            print(f"\n로그인 감지됨: {page.url}")
        except Exception:
            print(f"\n타임아웃 또는 URL 미변경: {page.url}")
            print("현재 상태로 세션을 저장합니다.")

        # 페이지 안정화 대기
        await page.wait_for_timeout(2000)

        # 세션 저장
        await context.storage_state(path=str(SESSION_OUTPUT))
        size = SESSION_OUTPUT.stat().st_size
        print(f"세션 저장 완료: {SESSION_OUTPUT} ({size} bytes)")

        if size < 100:
            print("경고: 세션 파일이 너무 작습니다. 로그인이 완료되지 않았을 수 있습니다.")
            await browser.close()
            sys.exit(1)

        await browser.close()

    # Worker에 자동 업로드
    print("\nWorker에 세션 업로드 중...")
    import requests
    with open(SESSION_OUTPUT, "rb") as f:
        resp = requests.post(
            WORKER_URL,
            data=f,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    print(f"업로드 응답: {resp.status_code} {resp.text}")

    print("\n완료! 이제 /run 을 호출하면 로그인 없이 스크래핑이 작동합니다.")


if __name__ == "__main__":
    asyncio.run(main())
