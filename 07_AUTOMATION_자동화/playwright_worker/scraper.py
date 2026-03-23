import asyncio
import re
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import gcs_store

logger = logging.getLogger(__name__)

SELLER_CENTER_URL = "https://sell.smartstore.naver.com/"
LOGIN_URL = "https://nid.naver.com/nidlogin.login"
PAYMENT_DONE_TEXT = "결제완료"

YOUTUBE_PATTERNS = [
    r"(?:youtu\.be/)([0-9A-Za-z_-]{11})",
    r"(?:v=)([0-9A-Za-z_-]{11})",
    r"\b([0-9A-Za-z_-]{11})\b",
]

TABLE_ROW_SELECTORS = [
    "table tbody tr",
    "[class*='orderList'] tbody tr",
    "[class*='OrderList'] tbody tr",
    "[class*='order-list'] tbody tr",
    "[class*='tableBody'] tr",
    "tbody tr",
]


def _extract_youtube_id(text: str) -> Optional[str]:
    if not text:
        return None
    for pattern in YOUTUBE_PATTERNS:
        m = re.search(pattern, text)
        if m:
            return m.group(1)
    return None


class NaverSellerScraper:
    def __init__(self, naver_id: str, naver_pw: str, session_path: str = "/tmp/naver_session.json"):
        self.naver_id = naver_id
        self.naver_pw = naver_pw
        self.session_path = session_path

    async def scrape_new_orders(self) -> List[Dict]:
        # GCS에서 세션 복원 시도 (콜드스타트 대비)
        # os.path.exists 대신 load_session 반환값을 사용 —
        # download_to_filename이 NotFound 전에 빈 파일을 만드는 버그 방어
        has_session = os.path.exists(self.session_path)
        if not has_session:
            has_session = gcs_store.load_session(self.session_path)

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--window-size=1280,900",
                ]
            )
            context_kwargs = {
                "user_agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "viewport": {"width": 1280, "height": 900},
                "locale": "ko-KR",
                "timezone_id": "Asia/Seoul",
            }
            if has_session:
                context_kwargs["storage_state"] = self.session_path

            context = await browser.new_context(**context_kwargs)

            # navigator.webdriver 프로퍼티 제거 (봇 탐지 우회)
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            page = await context.new_page()

            try:
                await page.goto(SELLER_CENTER_URL, wait_until="domcontentloaded", timeout=30000)

                # Angular 앱 완전 로드 대기
                await self._wait_for_angular(page)

                if "nid.naver.com" in page.url or not await self._is_authenticated(page):
                    logger.info("미인증 상태 감지 — 로그인 시도")
                    await self._login(page, context)
                    await self._wait_for_angular(page)
                else:
                    logger.info("기존 세션 유효 — 재사용")

                orders = await self._scrape_orders(page)

                # 세션을 /tmp + GCS 모두 저장
                await context.storage_state(path=self.session_path)
                gcs_store.save_session(self.session_path)
                logger.info(f"세션 저장 완료 (local + GCS)")
                return orders

            finally:
                await browser.close()

    # ------------------------------------------------------------------
    # 로그인
    # ------------------------------------------------------------------
    async def _login(self, page, context=None) -> None:
        login_target = f"{LOGIN_URL}?url=https%3A%2F%2Fsell.smartstore.naver.com%2F"
        await page.goto(login_target, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(1000)

        # ID/PW 입력 — 사람처럼 한 글자씩 입력
        await page.fill("input#id", "")
        await page.type("input#id", self.naver_id, delay=60)
        await asyncio.sleep(0.4)
        await page.fill("input#pw", "")
        await page.type("input#pw", self.naver_pw, delay=60)
        await asyncio.sleep(0.4)

        # 로그인 버튼 셀렉터 (우선순위 순)
        btn_selectors = [
            "#log\\.login",
            "button[id='log.login']",
            "button.btn_login",
            "input.btn_login",
            "button:has-text('로그인')",
        ]
        clicked = False
        for sel in btn_selectors:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible(timeout=2000):
                    await btn.click()
                    logger.info(f"로그인 버튼 클릭: {sel}")
                    clicked = True
                    break
            except Exception:
                continue

        if not clicked:
            logger.warning("로그인 버튼을 찾지 못함 — Enter 키 시도")
            await page.keyboard.press("Enter")

        try:
            await page.wait_for_url("**/sell.smartstore.naver.com/**", timeout=25000)
            logger.info("로그인 성공")
        except PlaywrightTimeoutError:
            logger.warning(f"로그인 후 URL: {page.url}")
            # 실패 시 스크린샷을 GCS에 업로드해 원인 파악
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            ss_path = f"/tmp/login_fail_{ts}.png"
            try:
                await page.screenshot(path=ss_path, full_page=True)
                gcs_store.upload_screenshot(ss_path, name=f"login_fail_{ts}.png")
            except Exception as e:
                logger.warning(f"스크린샷 업로드 실패: {e}")
            await page.wait_for_timeout(5000)

    async def _is_authenticated(self, page) -> bool:
        """
        인증된 셀러 대시보드 상태인지 확인합니다.
        비인증 시 '로그인하기' 버튼이 표시됩니다.
        """
        try:
            btn = page.locator("button:has-text('로그인하기'), a:has-text('로그인하기'), .btn-login")
            if await btn.is_visible(timeout=2000):
                logger.info("'로그인하기' 버튼 감지 — 비인증 상태")
                return False
        except Exception:
            pass
        return True

    # ------------------------------------------------------------------
    # AngularJS 완전 로드 대기
    # ------------------------------------------------------------------
    async def _wait_for_angular(self, page, timeout: int = 30000) -> None:
        """
        AngularJS 셀러센터 앱이 부트스트랩을 마칠 때까지 대기합니다.
        #__initial_loading 이 hidden 상태가 되면 초기 로드 완료.
        wait_for_function 대신 wait_for_selector(state="hidden") 사용
        — Naver CSP의 unsafe-eval 차단 우회.
        """
        try:
            await page.wait_for_selector(
                "#__initial_loading",
                state="hidden",
                timeout=timeout
            )
            logger.info("Angular 앱 로드 완료")
        except PlaywrightTimeoutError:
            logger.warning("Angular 로드 대기 타임아웃 — 강제 진행")

        # 라우팅 안정화를 위한 추가 대기
        await page.wait_for_timeout(1000)

    # ------------------------------------------------------------------
    # 주문조회 페이지 이동 (메뉴 클릭 우선)
    # ------------------------------------------------------------------
    async def _scrape_orders(self, page) -> List[Dict]:
        success = await self._navigate_via_menu(page)
        if not success:
            logger.warning("메뉴 탐색 실패")
            await self._log_dom_snapshot(page)
            return []

        order_ids = await self._collect_payment_done_order_ids(page)
        logger.info(f"결제완료 주문 {len(order_ids)}개 발견")

        results = []
        for order_id in order_ids:
            try:
                detail = await self._fetch_order_detail(page, order_id)
                if detail:
                    results.append(detail)
            except Exception as e:
                logger.warning(f"주문 {order_id} 상세 파싱 실패: {e}")

        return results

    async def _navigate_via_menu(self, page) -> bool:
        """
        셀러센터 사이드바에서 주문관리 → 주문조회 순서로 클릭합니다.
        테이블이 나타나면 True 반환.
        """
        # 1단계: 주문관리 메뉴 클릭 (펼치기)
        for sel in ["a:has-text('주문관리')", "span:has-text('주문관리')", "li:has-text('주문관리')"]:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=4000):
                    await el.click()
                    logger.info(f"'주문관리' 클릭 성공: {sel}")
                    await page.wait_for_timeout(800)
                    break
            except Exception:
                continue

        # 2단계: 주문조회 서브메뉴 클릭
        for sel in ["a:has-text('주문조회')", "span:has-text('주문조회')", "li:has-text('주문조회') > a"]:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=4000):
                    await el.click()
                    logger.info(f"'주문조회' 클릭 성공: {sel}")

                    # 테이블이 나타날 때까지 대기
                    appeared = await self._wait_for_table(page, timeout=20000)
                    current_url = page.url
                    logger.info(f"주문조회 이동 후 URL: {current_url} | 테이블 출현: {appeared}")
                    return appeared
            except Exception:
                continue

        # 메뉴 클릭 실패 — URL을 직접 시도
        logger.info("메뉴 클릭 실패, URL 직접 이동 시도")
        for url in [
            f"{SELLER_CENTER_URL}#/naverpay/order-inquiry",
            f"{SELLER_CENTER_URL}#/naverpay/orders",
        ]:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await self._wait_for_angular(page, timeout=20000)
            appeared = await self._wait_for_table(page, timeout=15000)
            logger.info(f"URL {url} | 테이블 출현: {appeared}")
            if appeared:
                return True

        return False

    async def _wait_for_table(self, page, timeout: int = 15000) -> bool:
        """테이블 tbody tr 이 실제로 나타날 때까지 대기합니다."""
        for sel in TABLE_ROW_SELECTORS:
            try:
                await page.wait_for_selector(sel, state="visible", timeout=timeout)
                count = await page.locator(sel).count()
                if count > 0:
                    logger.info(f"테이블 출현 확인 — 셀렉터: {sel}, 행 수: {count}")
                    return True
            except PlaywrightTimeoutError:
                continue
            except Exception:
                continue
        return False

    async def _log_dom_snapshot(self, page) -> None:
        try:
            html = await page.evaluate("document.body.innerHTML")
            logger.info(f"[DOM SNAPSHOT] {html[:3000]}")
        except Exception as e:
            logger.warning(f"DOM 스냅샷 실패: {e}")

    # ------------------------------------------------------------------
    # 결제완료 주문 ID 수집
    # ------------------------------------------------------------------
    async def _collect_payment_done_order_ids(self, page) -> List[str]:
        for sel in TABLE_ROW_SELECTORS:
            rows = page.locator(sel)
            count = await rows.count()
            if count == 0:
                continue

            logger.info(f"테이블 파싱 — 셀렉터: {sel}, 행 수: {count}")
            ids = []

            for i in range(count):
                row = rows.nth(i)
                try:
                    text = (await row.inner_text()).strip()
                except Exception:
                    continue

                if PAYMENT_DONE_TEXT not in text:
                    continue

                m = re.search(r'\b(\d{14,20})\b', text)
                if m:
                    ids.append(m.group(1))
                    logger.info(f"결제완료 주문 발견: {m.group(1)}")

            if ids:
                return list(dict.fromkeys(ids))

        logger.warning("결제완료 주문을 찾지 못함")
        return []

    # ------------------------------------------------------------------
    # 주문 상세 파싱
    # ------------------------------------------------------------------
    async def _fetch_order_detail(self, page, order_id: str) -> Optional[Dict]:
        detail_url = f"{SELLER_CENTER_URL}#/naverpay/orders/{order_id}"
        await page.goto(detail_url, wait_until="domcontentloaded", timeout=20000)
        await self._wait_for_angular(page, timeout=15000)

        buyer_name = await self._find_text(page, [
            "dt:has-text('구매자명') + dd",
            "th:has-text('구매자명') + td",
            "[class*='buyerName']",
            "[class*='buyer-name']",
        ])

        buyer_email = await self._find_text(page, [
            "dt:has-text('이메일') + dd",
            "th:has-text('이메일') + td",
            "[class*='buyerEmail']",
            "[class*='buyer-email']",
        ])

        if not buyer_email:
            body_text = await page.inner_text("body")
            m = re.search(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', body_text)
            if m:
                buyer_email = m.group(0)

        memo = await self._find_text(page, [
            "dt:has-text('주문 메모') + dd",
            "dt:has-text('메시지') + dd",
            "dt:has-text('요청사항') + dd",
            "th:has-text('주문 메모') + td",
            "th:has-text('배송 메모') + td",
            "[class*='orderMemo']",
            "[class*='buyerMessage']",
            "[class*='deliveryMessage']",
        ])

        product_name = await self._find_text(page, [
            "[class*='productName']",
            "dt:has-text('상품명') + dd",
            "th:has-text('상품명') + td",
        ])

        youtube_id = _extract_youtube_id(memo)
        if not youtube_id:
            logger.warning(f"주문 {order_id}: YouTube ID 없음 (메모: {str(memo)[:60]})")
            return None

        if not buyer_email:
            logger.warning(f"주문 {order_id}: 구매자 이메일 없음")
            return None

        return {
            "order_number": order_id,
            "buyer_name": buyer_name or "Unknown",
            "buyer_email": buyer_email,
            "track_id": youtube_id,
            "track_title": product_name or "Unknown Track",
            "license_type": "permanent",
            "raw_memo": memo or "",
        }

    @staticmethod
    async def _find_text(page, selectors: List[str]) -> Optional[str]:
        for sel in selectors:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=1500):
                    text = (await el.inner_text()).strip()
                    if text:
                        return text
            except Exception:
                continue
        return None
