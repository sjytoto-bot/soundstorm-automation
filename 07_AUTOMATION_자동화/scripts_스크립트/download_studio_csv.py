"""
download_studio_csv.py
YouTube Studio Analytics CSV 자동 다운로드 스크립트 v4.0 (CDP 방식)

방식:
    이미 실행 중인 Chrome에 CDP로 연결하여 Analytics CSV를 다운로드한다.
    Chrome의 실제 세션(Keychain 쿠키 포함)을 그대로 사용하므로 인증 문제 없음.

사전 준비:
    1. Chrome을 remote debugging 모드로 실행:
       /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\
           --remote-debugging-port=9222
    2. wldyd032 계정으로 YouTube Studio에 로그인

사용법:
    python3 download_studio_csv.py

다운로드 결과:
    youtube_exports/studio_reach_report.csv
"""

import os
import sys
import shutil
import time
import zipfile
import glob as _glob
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ─── 경로 설정 ───────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent.parent
EXPORTS_DIR  = BASE_DIR / 'youtube_exports'
CSV_FILENAME = 'studio_reach_report.csv'
CSV_PATH     = str(EXPORTS_DIR / CSV_FILENAME)

import argparse

CHANNEL_ID   = 'UCAvSo9RLq0rCy64IH2nm91w'
CDP_URL      = 'http://localhost:9222'

def _build_analytics_url(time_period: str) -> str:
    return (
        f'https://studio.youtube.com/channel/{CHANNEL_ID}'
        '/analytics/tab-content/period-default/explore'
        '?entity_type=CHANNEL'
        f'&entity_id={CHANNEL_ID}'
        f'&time_period={time_period}'
        '&explore_type=TABLE_AND_CHART'
        '&metric=EXTERNAL_VIEWS'
        '&granularity=DAY'
        '&t_metrics=EXTERNAL_VIEWS'
        '&t_metrics=EXTERNAL_WATCH_TIME'
        '&t_metrics=SUBSCRIBERS_NET_CHANGE'
        '&t_metrics=TOTAL_ESTIMATED_EARNINGS'
        '&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS'
        '&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS_VTR'
        '&dimension=VIDEO'
        '&o_column=EXTERNAL_VIEWS'
        '&o_direction=ANALYTICS_ORDER_DIRECTION_DESC'
    )

# 기본 URL (4주) — 하위 호환성 유지
ANALYTICS_URL = _build_analytics_url('4_weeks')


def find_export_button(page):
    """Export 버튼을 찾아 클릭. 성공 시 True 반환."""
    for selector in EXPORT_SELECTORS:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=2000):
                btn.click()
                print(f"  Export 클릭: {selector}")
                return True
        except Exception:
            continue

    for name in ['Export', '내보내기']:
        try:
            btn = page.get_by_role('button', name=name).first
            if btn.is_visible(timeout=1000):
                btn.click()
                print(f"  Export 클릭 (role): '{name}'")
                return True
        except Exception:
            continue

    return False


def wait_for_analytics(page, timeout_sec: int = 60) -> bool:
    """Export 버튼이 나타날 때까지 대기. 재시도 버튼이 있으면 클릭."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        # Export 버튼 확인
        for sel in EXPORT_SELECTORS:
            try:
                if page.locator(sel).first.is_visible(timeout=500):
                    return True
            except Exception:
                pass

        try:
            if page.get_by_role('button', name='Export').first.is_visible(timeout=500):
                return True
        except Exception:
            pass
        try:
            if page.get_by_role('button', name='내보내기').first.is_visible(timeout=500):
                return True
        except Exception:
            pass

        # 재시도 버튼이 있으면 클릭
        for retry_text in ['재시도', 'Retry']:
            try:
                btn = page.get_by_role('button', name=retry_text).first
                if btn.is_visible(timeout=500):
                    print(f"  재시도 버튼 클릭: '{retry_text}'")
                    btn.click()
                    page.wait_for_timeout(4000)
            except Exception:
                pass

        time.sleep(2)

    return False


def main():
    parser = argparse.ArgumentParser(description="YouTube Studio CSV 다운로드")
    parser.add_argument(
        '--mode', choices=['default', 'recent'], default='default',
        help="recent: 7일 단축 윈도우 (신규 업로드 CTR 전용)"
    )
    args = parser.parse_args()

    if args.mode == 'recent':
        analytics_url = _build_analytics_url('7_days')
        csv_filename  = 'studio_reach_report_recent.csv'
    else:
        analytics_url = ANALYTICS_URL
        csv_filename  = CSV_FILENAME

    csv_path = str(EXPORTS_DIR / csv_filename)

    print("=" * 60)
    print(f"YouTube Studio Analytics CSV 다운로드 (CDP 방식) [{args.mode}]")
    print(f"  CDP: {CDP_URL}")
    print(f"  저장: {csv_path}")
    print("=" * 60)

    os.makedirs(EXPORTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        # ── 1. 이미 실행 중인 Chrome에 CDP 연결 ──────────────────────────
        print(f"\nChrome CDP 연결 중 ({CDP_URL})...")
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            print(f"\n❌ CDP 연결 실패: {e}")
            print()
            print("Chrome을 remote debugging 모드로 실행하세요:")
            print()
            print('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
            print('      --remote-debugging-port=9222')
            print()
            print("이후 wldyd032 계정으로 YouTube Studio에 로그인하고 재시도하세요.")
            sys.exit(1)

        print("  CDP 연결 성공")

        # ── 2. 기존 브라우저 컨텍스트 사용 ───────────────────────────────
        contexts = browser.contexts
        if not contexts:
            print("❌ 열린 브라우저 컨텍스트 없음")
            sys.exit(1)

        context = contexts[0]
        context.set_default_timeout(30000)

        # ── 3. Analytics 페이지로 이동 ────────────────────────────────────
        # 기존 탭 중 Studio 탭이 있으면 재사용, 없으면 새 탭
        pages = context.pages
        page = None
        for pg in pages:
            if 'studio.youtube.com' in pg.url:
                page = pg
                print(f"  기존 Studio 탭 재사용: {pg.url}")
                break

        if page is None:
            page = context.new_page()

        print(f"\nAnalytics 탭으로 이동...")
        try:
            page.goto(analytics_url, wait_until='domcontentloaded', timeout=30000)
        except PlaywrightTimeoutError:
            pass

        page.wait_for_timeout(6000)
        print(f"  현재 URL: {page.url}")

        # 로그인 확인
        if 'accounts.google.com' in page.url or 'signin' in page.url.lower():
            print("❌ 로그인이 필요합니다.")
            print("   Chrome에서 wldyd032 계정으로 YouTube Studio에 로그인 후 재시도하세요.")
            page.screenshot(path=str(EXPORTS_DIR / 'debug_screenshot.png'))
            sys.exit(1)

        # ── 4. Export 버튼 대기 (ytcp-icon-button 형태) ──────────────────
        print("\n'현재 화면 내보내기' 버튼 대기 중 (최대 60초)...")
        export_btn = None
        deadline = time.time() + 60
        while time.time() < deadline:
            # 재시도 버튼 먼저 클릭
            for retry_text in ['재시도', 'Retry']:
                try:
                    btn = page.get_by_role('button', name=retry_text).first
                    if btn.is_visible(timeout=500):
                        btn.click()
                        page.wait_for_timeout(3000)
                except Exception:
                    pass

            el = page.locator('[aria-label="현재 화면 내보내기"]').first
            try:
                if el.is_visible(timeout=1000):
                    export_btn = el
                    break
            except Exception:
                pass
            time.sleep(2)

        if not export_btn:
            print("❌ Export 버튼을 찾지 못했습니다.")
            sys.exit(1)

        print("  Export 버튼 감지됨")

        # ── 5. Export 메뉴 열기 → CSV 선택 ───────────────────────────────
        print("\nExport 메뉴 열기...")

        # CDP로 다운로드 경로 설정
        cdp = context.new_cdp_session(page)
        cdp.send("Page.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": str(EXPORTS_DIR)
        })

        # JS로 버튼 클릭 (pointer-events 우회)
        page.evaluate("document.querySelector('[aria-label=\"현재 화면 내보내기\"]').click()")
        page.wait_for_timeout(2000)

        # CSV 메뉴 아이템 클릭
        csv_menu_item = page.locator('tp-yt-paper-item[test-id="CSV"]').first
        if not csv_menu_item.is_visible(timeout=5000):
            print("❌ CSV 메뉴 아이템 없음")
            sys.exit(1)

        print("  CSV 옵션 클릭...")
        # 다운로드 전 기존 ZIP 제거 (덮어쓰기 감지 문제 방지)
        for old_zip in _glob.glob(str(EXPORTS_DIR / '*.zip')):
            os.remove(old_zip)

        # Chrome은 기본 Downloads 폴더 또는 EXPORTS_DIR에 저장 → 둘 다 감시
        DOWNLOADS_DIR = Path.home() / 'Downloads'
        scan_dirs = [EXPORTS_DIR, DOWNLOADS_DIR]
        before_zips = set()
        for d in scan_dirs:
            before_zips.update(_glob.glob(str(d / '*.zip')))

        csv_menu_item.click()

        # 새 ZIP이 나타날 때까지 대기 (최대 30초, 브라우저 열어둔 채로)
        print("  다운로드 완료 대기 중...")
        deadline = time.time() + 30
        new_zip = None
        while time.time() < deadline:
            for d in scan_dirs:
                after = set(_glob.glob(str(d / '*.zip')))
                done = [f for f in (after - before_zips)
                        if not f.endswith('.crdownload')]
                if done:
                    new_zip = done[0]
                    break
            if new_zip:
                break
            time.sleep(1)

        browser.close()

        if not new_zip:
            print("❌ 다운로드된 ZIP 파일 없음 (30초 타임아웃)")
            sys.exit(1)

        # Downloads 폴더에 있으면 EXPORTS_DIR로 이동
        new_zip_dest = str(EXPORTS_DIR / os.path.basename(new_zip))
        if os.path.abspath(new_zip) != os.path.abspath(new_zip_dest):
            shutil.move(new_zip, new_zip_dest)
            new_zip = new_zip_dest

        print(f"  다운로드 완료: {os.path.basename(new_zip)}")

        # ── 6. ZIP 처리 → 표 데이터.csv → studio_reach_report.csv ────────
        print(f"\nZIP 압축 해제: {os.path.basename(new_zip)}")
        latest_zip = new_zip

        with zipfile.ZipFile(latest_zip, 'r') as zf:
            members = zf.namelist()
            print(f"  ZIP 내용: {members}")
            zf.extractall(str(EXPORTS_DIR))

        # '표 데이터.csv' (video-level 데이터) 선택
        table_csv = str(EXPORTS_DIR / '표 데이터.csv')
        if not os.path.exists(table_csv):
            # 폴백: 가장 큰 CSV 사용
            csvs = sorted(
                _glob.glob(str(EXPORTS_DIR / '*.csv')),
                key=os.path.getsize, reverse=True
            )
            csvs = [c for c in csvs if 'studio_reach_report' not in c]
            if not csvs:
                print("❌ 추출된 CSV 없음")
                sys.exit(1)
            table_csv = csvs[0]

        shutil.copy(table_csv, csv_path)
        size_kb = os.path.getsize(csv_path) / 1024
        print(f"\n✅ CSV 저장 완료!")
        print(f"  저장 경로: {csv_path}")
        print(f"  파일 크기: {size_kb:.1f} KB")

        # ── 차트 데이터.csv (영상별 일별 조회수) 보존 ────────────────────────
        chart_csv_src = str(EXPORTS_DIR / '차트 데이터.csv')
        chart_csv_dst = str(EXPORTS_DIR / 'video_daily_views.csv')
        if os.path.exists(chart_csv_src):
            shutil.copy(chart_csv_src, chart_csv_dst)
            chart_kb = os.path.getsize(chart_csv_dst) / 1024
            print(f"  📊 일별 조회수 저장: video_daily_views.csv ({chart_kb:.1f} KB)")

    return csv_path


if __name__ == '__main__':
    main()
