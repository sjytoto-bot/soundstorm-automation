"""
YouTube Studio 세션 익스포트 스크립트

사용법:
  1. python3 export_youtube_studio_session.py
  2. 브라우저가 열리면 Google 로그인 후 YouTube Studio 진입
  3. 세션 저장 후 Worker에 업로드
"""

import asyncio
from pathlib import Path

import requests
from playwright.async_api import async_playwright

STUDIO_URL = "https://studio.youtube.com/"
SESSION_OUTPUT = Path(__file__).parent / "youtube_studio_session.json"
WORKER_URL = "https://playwright-worker-774503242418.asia-northeast3.run.app/seed-youtube-session"


async def main():
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
        await page.goto(STUDIO_URL, wait_until="domcontentloaded")
        print("브라우저가 열렸습니다. YouTube Studio 로그인 후 Studio 메인 화면까지 진입해주세요.")
        input("완료 후 Enter를 누르세요...")
        await context.storage_state(path=str(SESSION_OUTPUT))
        await browser.close()

    with open(SESSION_OUTPUT, "rb") as f:
        resp = requests.post(
            WORKER_URL,
            data=f,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    print(resp.status_code, resp.text)


if __name__ == "__main__":
    asyncio.run(main())
