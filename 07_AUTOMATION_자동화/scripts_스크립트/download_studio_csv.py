"""
download_studio_csv.py
YouTube Studio Analytics CSV 자동 다운로드 스크립트 v5.1 (CDP + UI automation)

방식:
    1. 4_weeks URL로 진입 (페이지 렌더링 안정성 보장)
    2. default 모드: 기간 드롭다운 → '전체' 선택 (= 게시 이후 / all-time)
    3. Export 버튼 활성화 확인 (데이터 로드 완료 기준)
    4. page.expect_download()로 ZIP 캡처 → CSV 추출

사전 준비:
    1. Chrome을 remote debugging 모드로 실행:
       /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\
           --remote-debugging-port=9222
    2. wldyd032 계정으로 YouTube Studio에 로그인

사용법:
    python3 download_studio_csv.py           # 365일 (default)
    python3 download_studio_csv.py --mode=recent  # 4주 (recent)

다운로드 결과:
    youtube_exports/studio_reach_report.csv
"""

import os
import sys
import shutil
import time
import zipfile
import glob as _glob
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ─── 경로 설정 ───────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent.parent
EXPORTS_DIR  = BASE_DIR / 'youtube_exports'
CSV_FILENAME = 'studio_reach_report.csv'
CSV_PATH     = str(EXPORTS_DIR / CSV_FILENAME)

CHANNEL_ID   = 'UCAvSo9RLq0rCy64IH2nm91w'
CDP_URL      = 'http://localhost:9222'

EXPORT_SELECTORS = [
    '[aria-label*="내보내기"]',
    '[aria-label*="Export"]',
    'ytcp-icon-button[aria-label*="내보내기"]',
    'ytcp-icon-button[aria-label*="Export"]',
]

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

# 진입 URL: 4_weeks — 렌더링이 안정적으로 동작하는 유일한 직접 URL
ENTRY_URL = _build_analytics_url('4_weeks')


def _wait_for_export_button(page, timeout_sec: int = 60) -> bool:
    """Export 버튼이 나타날 때까지 폴링. 데이터 로드 완료의 실질적 기준."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if _find_export_button(page):
            return True
        time.sleep(2)
    return False


def _select_all_time(page) -> bool:
    """기간 드롭다운에서 '전체'(게시 이후)를 선택한다. 성공 시 True."""
    try:
        # 현재 기간 버튼 클릭 (텍스트 불문하고 date-range 버튼 클릭)
        period_btn = None
        for text in ["지난 28일", "지난 90일", "지난 365일", "지난 7일", "전체"]:
            try:
                el = page.get_by_text(text, exact=True).first
                if el.is_visible(timeout=2000):
                    period_btn = el
                    break
            except Exception:
                pass

        if not period_btn:
            print("  ⚠️ 기간 버튼 텍스트 미탐지 — ytcp-date-range-button 시도")
            period_btn = page.locator("ytcp-date-range-button").first

        period_btn.click()
        print("  기간 드롭다운 열림")

        # 드롭다운 메뉴에서 '전체' 항목 대기 (게시 이후 = channel-level all-time)
        option = page.get_by_text("전체", exact=True).first
        option.wait_for(state="visible", timeout=10000)
        option.click()
        print("  전체(게시 이후) 선택 완료")

        # Export 버튼 다시 나타날 때까지 대기 (데이터 재로드 완료 기준)
        ok = _wait_for_export_button(page, timeout_sec=90)
        print(f"  전체 데이터 로드: {'✅' if ok else '⚠️ 타임아웃'}")
        return True
    except Exception as e:
        print(f"  ⚠️ 전체 선택 실패: {e}")
        return False


def _find_export_button(page):
    for sel in EXPORT_SELECTORS:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=1000):
                return el
        except Exception:
            pass
    return None


def _run_export(page, mode: str) -> str:
    """
    1. 4_weeks 로드 → Export 버튼 대기 (데이터 로드 완료 기준)
    2. default: 기간 드롭다운 → '전체'(게시 이후) → Export 버튼 재대기
    3. Export 버튼 클릭 → expect_download()로 ZIP 캡처 → 경로 반환
    """
    # STEP 1: 4_weeks 진입
    print("STEP 1: Analytics 페이지 로드 (4_weeks)...")
    try:
        page.goto(ENTRY_URL, wait_until='domcontentloaded', timeout=30000)
    except PlaywrightTimeoutError:
        pass

    if 'accounts.google.com' in page.url or 'signin' in page.url.lower():
        print("❌ 로그인 필요 — Chrome에서 YouTube Studio에 로그인 후 재시도하세요.")
        page.screenshot(path=str(EXPORTS_DIR / 'debug_screenshot.png'))
        sys.exit(1)

    # 4_weeks 데이터 로드 완료 기준: Export 버튼 등장
    ok = _wait_for_export_button(page, timeout_sec=60)
    print(f"  4_weeks 데이터 로드: {'✅' if ok else '⚠️ 타임아웃 (계속 진행)'}")

    # STEP 2: default 모드 → 전체(게시 이후)로 전환
    if mode == 'default':
        print("STEP 2: 기간 드롭다운 → 전체(게시 이후) 선택...")
        _select_all_time(page)
    else:
        page.wait_for_timeout(3000)

    print(f"  현재 URL: {page.url}")

    # STEP 3: Export 버튼 활성화 대기
    print("STEP 3: Export 버튼 대기...")
    export_btn = None
    deadline = time.time() + 60
    while time.time() < deadline:
        export_btn = _find_export_button(page)
        if export_btn:
            print(f"  ✅ Export 버튼 발견")
            break
        time.sleep(2)

    if not export_btn:
        page.screenshot(path=str(EXPORTS_DIR / 'debug_export_btn.png'))
        print("❌ Export 버튼 없음")
        sys.exit(1)

    # STEP 4: 다운로드 캡처 (expect_download — CDP 모드 안정 방식)
    print("STEP 4: 다운로드 시작...")
    new_zip = None
    try:
        with page.expect_download(timeout=60000) as dl_info:
            # Export 버튼 클릭
            export_btn.click()
            page.wait_for_timeout(1500)

            # CSV 메뉴 선택
            csv_item = page.locator('tp-yt-paper-item[test-id="CSV"]').first
            if csv_item.is_visible(timeout=5000):
                csv_item.click()
                print("  CSV 옵션 클릭")
            else:
                # 폴백: 텍스트로 찾기
                for txt in ['쉼표로 구분된 값(.csv)', 'CSV']:
                    try:
                        page.get_by_text(txt, exact=False).first.click()
                        print(f"  CSV 옵션 클릭 (텍스트: '{txt}')")
                        break
                    except Exception:
                        pass

        # STEP 5: 다운로드 완료 — save_as로 EXPORTS_DIR에 저장
        download = dl_info.value
        dest = str(EXPORTS_DIR / os.path.basename(download.suggested_filename))
        download.save_as(dest)
        new_zip = dest

    except Exception as e:
        print(f"❌ 다운로드 실패: {e}")
        sys.exit(1)

    if not new_zip or not os.path.exists(new_zip) or os.path.getsize(new_zip) == 0:
        print("❌ 다운로드 실패 (파일 없음 또는 크기 0)")
        sys.exit(1)

    print(f"  ✅ 다운로드 완료: {os.path.basename(new_zip)} ({os.path.getsize(new_zip)//1024} KB)")
    return new_zip


def main():
    parser = argparse.ArgumentParser(description="YouTube Studio CSV 다운로드")
    parser.add_argument(
        '--mode', choices=['default', 'recent'], default='default',
        help="default: 365일 전체 | recent: 4주 단축 윈도우"
    )
    args = parser.parse_args()
    csv_filename = CSV_FILENAME if args.mode == 'default' else 'studio_reach_report_recent.csv'
    csv_path = str(EXPORTS_DIR / csv_filename)

    print("=" * 60)
    print(f"YouTube Studio Analytics CSV 다운로드 v5.1 [{args.mode}]")
    print(f"  CDP: {CDP_URL}")
    print(f"  저장: {csv_path}")
    print("=" * 60)

    os.makedirs(EXPORTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        print(f"\nChrome CDP 연결 중 ({CDP_URL})...")
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            print(f"\n❌ CDP 연결 실패: {e}")
            print()
            print('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
            print('      --remote-debugging-port=9222')
            print()
            print("이후 wldyd032 계정으로 YouTube Studio에 로그인하고 재시도하세요.")
            sys.exit(1)

        print("  CDP 연결 성공")
        contexts = browser.contexts
        if not contexts:
            print("❌ 열린 브라우저 컨텍스트 없음")
            sys.exit(1)

        context = contexts[0]
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 900})

        # retry 3회
        new_zip = None
        for attempt in range(1, 4):
            print(f"\n━━━ 시도 {attempt}/3 ━━━")
            try:
                new_zip = _run_export(page, args.mode)
                break
            except SystemExit:
                raise
            except Exception as e:
                print(f"  ⚠️ 예외: {e}")
                if attempt < 3:
                    print("  페이지 재로드 후 재시도...")
                    page.close()
                    page = context.new_page()
                    page.set_viewport_size({"width": 1280, "height": 900})
                else:
                    print("❌ 3회 모두 실패")
                    sys.exit(1)

        browser.close()

        # Downloads 폴더에 있으면 EXPORTS_DIR로 이동
        new_zip_dest = str(EXPORTS_DIR / os.path.basename(new_zip))
        if os.path.abspath(new_zip) != os.path.abspath(new_zip_dest):
            shutil.move(new_zip, new_zip_dest)
            new_zip = new_zip_dest

        # ZIP 압축 해제 → CSV 추출
        print(f"\nZIP 압축 해제: {os.path.basename(new_zip)}")
        with zipfile.ZipFile(new_zip, 'r') as zf:
            members = zf.namelist()
            print(f"  ZIP 내용: {members}")
            zf.extractall(str(EXPORTS_DIR))

        table_csv = str(EXPORTS_DIR / '표 데이터.csv')
        if not os.path.exists(table_csv):
            csvs = sorted(
                [c for c in _glob.glob(str(EXPORTS_DIR / '*.csv'))
                 if 'studio_reach_report' not in c],
                key=os.path.getsize, reverse=True
            )
            if not csvs:
                print("❌ 추출된 CSV 없음")
                sys.exit(1)
            table_csv = csvs[0]

        shutil.copy(table_csv, csv_path)
        size_kb = os.path.getsize(csv_path) / 1024

        # 완료 검증: 파일 존재 + 크기 > 0
        assert os.path.exists(csv_path), "CSV 파일 없음"
        assert size_kb > 0, "CSV 파일 크기 0"

        print(f"\n✅ CSV 저장 완료!")
        print(f"  저장 경로: {csv_path}")
        print(f"  파일 크기: {size_kb:.1f} KB")

        chart_csv_src = str(EXPORTS_DIR / '차트 데이터.csv')
        chart_csv_dst = str(EXPORTS_DIR / 'video_daily_views.csv')
        if os.path.exists(chart_csv_src):
            shutil.copy(chart_csv_src, chart_csv_dst)
            print(f"  일별 조회수 저장: video_daily_views.csv ({os.path.getsize(chart_csv_dst)//1024:.0f} KB)")

    return csv_path


if __name__ == '__main__':
    main()
