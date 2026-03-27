"""
download_recent_video_studio.py
최근 업로드 영상 "게시 이후" 통계 → _RawData_Master 직접 업데이트 v1.0

흐름:
    1. _RawData_Master → upload_date DESC → 최근 video_id 조회
    2. Studio 영상 분석 페이지 (time_period=since_publish) CDP 진입
    3. Export 버튼 → page.expect_download() → ZIP 저장
    4. CSV 파싱: 일별/월별 시계열 집계 또는 단일행 직접 사용
    5. _RawData_Master 해당 행 impressions/ctr 직접 업데이트 (cell-by-cell)

사전 준비:
    - CDP Chrome 실행 (sync_studio_csv.sh에서 관리)
    - 07_AUTOMATION_자동화/credentials/service_account.json 존재
"""

import os
import sys
import csv
import json
import base64
import time
import zipfile
import glob as _glob
from pathlib import Path
from datetime import datetime, timezone

import gspread
from google.oauth2.service_account import Credentials as SACredentials
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from recent_video_pipeline import (
    make_metric_result,
    normalize_metric_result,
    select_recent_video_candidate,
    write_metric_result,
)

# ── 경로 설정 ─────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.parent
EXPORTS_DIR   = BASE_DIR / 'youtube_exports'
CREDENTIALS_DIR = BASE_DIR / 'credentials'

CHANNEL_ID    = 'UCAvSo9RLq0rCy64IH2nm91w'
CDP_URL       = 'http://127.0.0.1:9222'

IS_CI = os.environ.get('CI') == 'true' or os.environ.get('GITHUB_ACTIONS') == 'true'
if IS_CI:
    _ci_dir = Path('/tmp/soundstorm_creds')
    _ci_dir.mkdir(exist_ok=True)
    for env_key, fname in [('SERVICE_ACCOUNT_B64', 'service_account.json')]:
        b64 = os.environ.get(env_key, '')
        if b64:
            (_ci_dir / fname).write_bytes(base64.b64decode(b64))
    CREDENTIALS_PATH = str(_ci_dir / 'service_account.json')
    SPREADSHEET_ID   = os.environ.get('GOOGLE_SHEETS_ID', '12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y')
else:
    CREDENTIALS_PATH = str(CREDENTIALS_DIR / 'service_account.json')
    SPREADSHEET_ID   = '12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y'

TARGET_SHEET = '_RawData_Master'

EXPORT_SELECTORS = [
    '[aria-label*="내보내기"]',
    '[aria-label*="Export"]',
    'ytcp-icon-button[aria-label*="내보내기"]',
    'ytcp-icon-button[aria-label*="Export"]',
    '[aria-label*="다운로드"]',
    'ytcp-icon-button[aria-label*="다운로드"]',
    '[title*="다운로드"]',
]

# ── Google Sheets 연결 ────────────────────────────────────────────────────────

def _get_gspread_client():
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
    ]
    if not os.path.exists(CREDENTIALS_PATH):
        raise RuntimeError(
            f"Service Account 파일 없음: {CREDENTIALS_PATH}\n"
            "  → 07_AUTOMATION_자동화/credentials/service_account.json 확인"
        )
    creds = SACredentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes)
    return gspread.authorize(creds)


def _get_latest_video_id(gc) -> tuple[str, str, str | None]:
    """_RawData_Master에서 최근 보강 대상 video_id 반환."""
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet(TARGET_SHEET)
    records = ws.get_all_records()
    selection = select_recent_video_candidate(records, max_age_hours=72)
    if selection.get("status") != "ok" or not selection.get("video_id"):
        raise RuntimeError(selection.get("reason") or "_RawData_Master에 최근 보강 대상 없음")
    latest_id = selection["video_id"]
    latest_date = str(selection.get("video_published_at") or "")[:10]
    print(f"  최근 video_id: {latest_id}  (업로드: {latest_date})")
    print(f"  선택 근거: {selection.get('reason')}")
    return latest_id, latest_date, selection.get("video_published_at")


# ── Studio URL 빌더 ───────────────────────────────────────────────────────────

def _build_video_url(video_id: str) -> str:
    """영상 분석 개요 탭 URL (게시 이후) — 도달범위 탭보다 안정적으로 로드됨"""
    return (
        f'https://studio.youtube.com/video/{video_id}'
        '/analytics/tab-overview/period-default'
        '?time_period=since_publish'
    )


# ── Playwright 헬퍼 ───────────────────────────────────────────────────────────

def _find_export_button(page):
    for sel in EXPORT_SELECTORS:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=1000):
                return el
        except Exception:
            pass
    return None


def _wait_for_export_button(page, timeout_sec: int = 90) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if _find_export_button(page):
            return True
        time.sleep(2)
    return False


# ── CSV 파싱 & 집계 ───────────────────────────────────────────────────────────

def _parse_csv(csv_path: str) -> dict:
    """
    CSV에서 impressions / ctr 추출.
    형식 A (단일행): 콘텐츠 열 있음 → 첫 데이터 행 직접 사용
    형식 B (시계열): 날짜/월 열 있음 → 집계
    """
    with open(csv_path, encoding='utf-8-sig') as f:
        content = f.read()

    reader = csv.DictReader(content.splitlines())
    headers = reader.fieldnames or []

    # 헤더 정규화 (공백 제거)
    def _norm(h):
        return str(h).strip()

    def _find_col(keywords):
        for h in headers:
            for kw in keywords:
                if kw in _norm(h):
                    return _norm(h)
        return None

    imp_col  = _find_col(['노출수'])
    ctr_col  = _find_col(['클릭률', 'CTR'])
    view_col = _find_col(['조회수'])

    if not imp_col:
        # 영어 컬럼명 폴백
        imp_col  = _find_col(['Impressions', 'impressions'])
        ctr_col  = _find_col(['Click-through', 'CTR', 'ctr'])
        view_col = _find_col(['Views', 'views'])

    if not imp_col:
        print(f"  ⚠️ impressions 컬럼 미탐지. 헤더: {headers}")
        return {'impressions': 0, 'ctr': 0.0, 'views': 0}

    total_imp   = 0
    total_clicks = 0  # impression-weighted CTR 계산용
    total_views  = 0

    for row in reader:
        # 합계 행 스킵
        first = str(list(row.values())[0]).strip() if row else ''
        if any(x in first for x in ['합계', '총계', 'Total']):
            continue

        try:
            imp = int(str(row.get(imp_col, 0)).replace(',', '').strip() or '0')
        except ValueError:
            imp = 0

        try:
            raw_ctr = str(row.get(ctr_col, '0')).replace('%', '').replace(',', '.').strip()
            ctr_val = float(raw_ctr or '0')
            # YouTube Studio는 퍼센트 수치로 표시 (예: 6.3 → 0.063 변환)
            if ctr_val > 1:
                ctr_val = ctr_val / 100.0
        except ValueError:
            ctr_val = 0.0

        try:
            views = int(str(row.get(view_col, 0)).replace(',', '').strip() or '0') if view_col else 0
        except ValueError:
            views = 0

        total_imp    += imp
        total_clicks += imp * ctr_val
        total_views  += views

    ctr = (total_clicks / total_imp) if total_imp > 0 else 0.0
    return {
        'impressions': total_imp,
        'ctr':         round(ctr, 6),
        'views':       total_views,
    }


# ── Sheets 업데이트 ───────────────────────────────────────────────────────────

def _write_recent_metrics(gc, result: dict):
    summary = write_metric_result(gc, SPREADSHEET_ID, TARGET_SHEET, result)
    if summary["wrote"]:
        print(
            f"  ✅ {result['video_id']}: impressions={result['impressions']:,}  "
            f"ctr={result['ctr']:.4f}  ({result['source']} / {result['captured_at']})"
        )
    else:
        print(f"  ℹ️ write 스킵: {summary['reason']}")


def collect_recent_video_stats(video_id: str, *, video_published_at: str | None = None, timeout_sec: int = 90) -> dict:
    url = _build_video_url(video_id)
    collector_result = make_metric_result(
        status="partial",
        video_id=video_id,
        source="local_cdp",
        metric_window="since_publish",
        video_published_at=video_published_at,
        observed_in_studio=False,
        reason="collector started",
    )

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            return make_metric_result(
                status="partial",
                video_id=video_id,
                source="local_cdp",
                metric_window="since_publish",
                video_published_at=video_published_at,
                observed_in_studio=False,
                reason=f"CDP unavailable: {e}",
            )

        contexts = browser.contexts
        if not contexts:
            browser.close()
            return make_metric_result(
                status="auth_expired",
                video_id=video_id,
                source="local_cdp",
                metric_window="since_publish",
                video_published_at=video_published_at,
                observed_in_studio=False,
                reason="No active browser context available",
            )

        context = contexts[0]
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 900})

        try:
            page.goto(url, wait_until='domcontentloaded', timeout=min(timeout_sec, 30) * 1000)
        except PlaywrightTimeoutError:
            pass

        if 'accounts.google.com' in page.url or 'signin' in page.url.lower():
            page.screenshot(path=str(EXPORTS_DIR / 'debug_recent_video.png'))
            browser.close()
            return make_metric_result(
                status="auth_expired",
                video_id=video_id,
                source="local_cdp",
                metric_window="since_publish",
                video_published_at=video_published_at,
                observed_in_studio=False,
                reason="Studio login required",
            )

        print("[3] 개요 탭 로드 대기 (최대 30초)...")
        page.wait_for_timeout(8000)

        print("[3-B] 도달범위 탭 클릭...")
        try:
            reach_tab = page.get_by_text("도달범위", exact=True).first
            reach_tab.wait_for(state="visible", timeout=15000)
            reach_tab.click()
            page.wait_for_timeout(8000)
            print("  ✅ 도달범위 탭 이동")
        except Exception as e:
            print(f"  ⚠️ 도달범위 탭 클릭 실패: {e}")
            collector_result = make_metric_result(
                status="studio_layout_changed",
                video_id=video_id,
                source="local_cdp",
                metric_window="since_publish",
                video_published_at=video_published_at,
                observed_in_studio=False,
                reason=f"Reach tab not found: {e}",
            )

        retry_btns = page.get_by_text("재시도").all()
        if retry_btns:
            print(f"  재시도 버튼 {len(retry_btns)}개 클릭 중...")
            for btn in retry_btns:
                try:
                    if btn.is_visible():
                        btn.click()
                except Exception:
                    pass
            page.wait_for_timeout(5000)

        print("[4-A] DOM에서 노출수/CTR 직접 추출...")
        dom_stats = page.evaluate("""() => {
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

        print(f"  DOM 추출: impressions={dom_stats.get('impressions', 0):,}  ctr={dom_stats.get('ctr', 0):.4f}")

        zip_path = None
        if dom_stats.get('impressions', 0) == 0:
            print("[4-B] DOM 추출 실패 → Export 버튼 CSV 다운로드 시도...")
            export_btn = _find_export_button(page)
            if export_btn:
                try:
                    with page.expect_download(timeout=60000) as dl_info:
                        export_btn.click()
                        page.wait_for_timeout(1500)
                        csv_item = page.locator('tp-yt-paper-item[test-id=\"CSV\"]').first
                        if csv_item.is_visible(timeout=5000):
                            csv_item.click()
                        else:
                            for txt in ['쉼표로 구분된 값(.csv)', 'CSV']:
                                try:
                                    page.get_by_text(txt, exact=False).first.click()
                                    break
                                except Exception:
                                    pass
                    download = dl_info.value
                    zip_path = str(EXPORTS_DIR / os.path.basename(download.suggested_filename))
                    download.save_as(zip_path)
                    print(f"  ✅ ZIP 저장: {os.path.basename(zip_path)}")
                except Exception as e:
                    print(f"  ⚠️ CSV 다운로드도 실패: {e}")
            else:
                page.screenshot(path=str(EXPORTS_DIR / 'debug_recent_video.png'))
                print("  ⚠️ Export 버튼 없음 (스크린샷 저장됨)")
        browser.close()

    if dom_stats.get('impressions', 0) > 0:
        return make_metric_result(
            status="ok",
            video_id=video_id,
            source="local_cdp",
            metric_window="since_publish",
            video_published_at=video_published_at,
            observed_in_studio=True,
            impressions=dom_stats['impressions'],
            ctr=round(dom_stats['ctr'], 6),
            reason="Metrics read from Studio DOM",
        )
    if collector_result.get("status") == "studio_layout_changed":
        return collector_result
    if zip_path and os.path.exists(zip_path):
        print(f"\n[5] ZIP 압축 해제: {os.path.basename(zip_path)}")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            print(f"  내용: {zf.namelist()}")
            zf.extractall(str(EXPORTS_DIR))
        table_csv = str(EXPORTS_DIR / '표 데이터.csv')
        if not os.path.exists(table_csv):
            candidates = sorted(
                [c for c in _glob.glob(str(EXPORTS_DIR / '*.csv')) if 'studio_reach_report' not in c],
                key=os.path.getsize,
                reverse=True,
            )
            if candidates:
                table_csv = candidates[0]
        print(f"  CSV 파싱: {os.path.basename(table_csv)}")
        stats = _parse_csv(table_csv)
        print(f"  impressions={stats['impressions']:,}  ctr={stats['ctr']:.4f}")
        if stats['impressions'] > 0:
            return make_metric_result(
                status="ok",
                video_id=video_id,
                source="official_csv",
                metric_window="since_publish",
                video_published_at=video_published_at,
                observed_in_studio=True,
                impressions=stats["impressions"],
                ctr=stats["ctr"],
                reason="Metrics read from exported Studio CSV",
            )
        return make_metric_result(
            status="metric_not_ready",
            video_id=video_id,
            source="official_csv",
            metric_window="since_publish",
            video_published_at=video_published_at,
            observed_in_studio=False,
            impressions=stats["impressions"],
            ctr=stats["ctr"],
            reason="CSV exported but metrics not populated yet",
        )
    return make_metric_result(
        status="metric_not_ready",
        video_id=video_id,
        source="local_cdp",
        metric_window="since_publish",
        video_published_at=video_published_at,
        observed_in_studio=False,
        reason="CTR or impressions card not visible yet",
    )


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(EXPORTS_DIR, exist_ok=True)

    print("=" * 60)
    print("최근 영상 '게시 이후' 통계 직접 갱신 v1.1")
    print("=" * 60)

    print("\n[1] _RawData_Master → 최근 보강 대상 조회...")
    gc = _get_gspread_client()
    video_id, upload_date, published_at = _get_latest_video_id(gc)

    print(f"\n[2] Studio 영상 분석 진입 (게시 이후)...")
    print(f"    video_id : {video_id}  |  upload_date : {upload_date}")

    result = normalize_metric_result(
        collect_recent_video_stats(video_id, video_published_at=published_at),
        default_video_id=video_id,
        default_source="local_cdp",
    )
    print(f"\n[5] 수집 결과: status={result['status']} | source={result['source']} | reason={result['reason']}")
    if result.get("impressions") is not None:
        print(f"  impressions={result['impressions']}  ctr={result['ctr']}")

    if result["status"] not in {"ok", "partial"} or not result.get("impressions"):
        print("  ⚠️ 수집 결과가 쓰기 조건을 만족하지 않음 — Sheets 업데이트 스킵.")
        sys.exit(0)

    print(f"\n[7] _RawData_Master 직접 업데이트...")
    _write_recent_metrics(gc, result)

    print(f"\n✅ 완료")


if __name__ == '__main__':
    main()
