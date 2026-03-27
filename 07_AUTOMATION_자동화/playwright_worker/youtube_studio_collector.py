from __future__ import annotations

import os

from playwright.async_api import async_playwright

from recent_video_pipeline import make_metric_result


def _build_video_url(video_id: str, mode: str) -> str:
    period = "since_publish" if mode == "since_publish" else "default"
    return (
        f"https://studio.youtube.com/video/{video_id}"
        f"/analytics/tab-overview/period-default?time_period={period}"
    )


async def collect_recent_video_stats(
    *,
    video_id: str,
    mode: str = "since_publish",
    published_at: str | None = None,
    session_path: str,
    timeout_sec: int = 90,
) -> dict:
    if not os.path.exists(session_path):
        return make_metric_result(
            status="auth_expired",
            video_id=video_id,
            source="worker",
            metric_window=mode,
            video_published_at=published_at,
            observed_in_studio=False,
            reason="YouTube Studio session file not found",
        )

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            storage_state=session_path,
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
        try:
            await page.goto(_build_video_url(video_id, mode), wait_until="domcontentloaded", timeout=min(timeout_sec, 30) * 1000)
        except Exception:
            pass

        if "accounts.google.com" in page.url or "signin" in page.url.lower():
            await browser.close()
            return make_metric_result(
                status="auth_expired",
                video_id=video_id,
                source="worker",
                metric_window=mode,
                video_published_at=published_at,
                observed_in_studio=False,
                reason="Worker session redirected to Google login",
            )

        try:
            await page.wait_for_timeout(8000)
            reach_tab = page.get_by_text("도달범위", exact=True).first
            await reach_tab.wait_for(state="visible", timeout=15000)
            await reach_tab.click()
            await page.wait_for_timeout(8000)
        except Exception as e:
            await browser.close()
            return make_metric_result(
                status="studio_layout_changed",
                video_id=video_id,
                source="worker",
                metric_window=mode,
                video_published_at=published_at,
                observed_in_studio=False,
                reason=f"Reach tab not found: {e}",
            )

        retry_btns = await page.get_by_text("재시도").all()
        for btn in retry_btns:
            try:
                if await btn.is_visible():
                    await btn.click()
            except Exception:
                pass
        await page.wait_for_timeout(3000)

        dom_stats = await page.evaluate("""() => {
            function parseKorNum(s) {
                s = s.trim();
                if (s.includes('천')) return Math.round(parseFloat(s.replace('천', '')) * 1000);
                if (s.includes('만')) return Math.round(parseFloat(s.replace('만', '')) * 10000);
                return parseInt(s.replace(/,/g, ''), 10) || 0;
            }
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            const texts = [];
            let node;
            while ((node = walker.nextNode())) {
                const t = node.textContent.trim();
                if (t) texts.push(t);
            }
            let impressions = 0;
            let ctr = 0.0;
            for (let i = 0; i < texts.length; i++) {
                const t = texts[i];
                const ctx = texts.slice(Math.max(0, i-4), i+4).join(' ');
                if (impressions === 0 && /^[0-9]+\\.?[0-9]*[천만]?$/.test(t) && t !== '0') {
                    if (ctx.includes('노출수') || ctx.includes('Impression')) {
                        const n = parseKorNum(t);
                        if (n >= 100) impressions = n;
                    }
                }
                if (ctr === 0.0) {
                    const m = t.match(/^([0-9]+\\.?[0-9]*)%$/);
                    if (m) {
                        const val = parseFloat(m[1]);
                        if (val > 0 && val <= 100 && (ctx.includes('클릭') || ctx.includes('CTR'))) {
                            ctr = val / 100.0;
                        }
                    }
                }
            }
            return { impressions, ctr };
        }""")

        await browser.close()

    impressions = dom_stats.get("impressions", 0) or 0
    ctr = dom_stats.get("ctr", 0.0) or 0.0
    if impressions > 0:
        return make_metric_result(
            status="ok",
            video_id=video_id,
            source="worker",
            metric_window=mode,
            video_published_at=published_at,
            observed_in_studio=True,
            impressions=impressions,
            ctr=round(ctr, 6),
            reason="Metrics read from Studio DOM in worker",
        )
    return make_metric_result(
        status="metric_not_ready",
        video_id=video_id,
        source="worker",
        metric_window=mode,
        video_published_at=published_at,
        observed_in_studio=False,
        reason="CTR or impressions card not visible yet",
    )
