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

# ── 경로 설정 ─────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.parent
EXPORTS_DIR   = BASE_DIR / 'youtube_exports'
CREDENTIALS_DIR = BASE_DIR / 'credentials'

CHANNEL_ID    = 'UCAvSo9RLq0rCy64IH2nm91w'
CDP_URL       = 'http://localhost:9222'

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


def _get_latest_video_id(gc) -> tuple[str, str]:
    """_RawData_Master에서 upload_date DESC 기준 최근 video_id 반환 (video_id, upload_date)"""
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet(TARGET_SHEET)
    records = ws.get_all_records()

    dated = [
        (str(r.get('upload_date', '')).strip(), str(r.get('video_id', '')).strip())
        for r in records
    ]
    # 11자리 YouTube video_id + 날짜 있는 행만
    dated = [(d, v) for d, v in dated if d and len(v) == 11]
    if not dated:
        raise RuntimeError("_RawData_Master에 유효한 video_id/upload_date 데이터 없음")

    dated.sort(reverse=True)
    latest_date, latest_id = dated[0]
    print(f"  최근 video_id: {latest_id}  (업로드: {latest_date})")
    return latest_id, latest_date


# ── Studio URL 빌더 ───────────────────────────────────────────────────────────

def _build_video_url(video_id: str) -> str:
    """영상 분석 페이지 URL (게시 이후 기본값)"""
    return (
        f'https://studio.youtube.com/video/{video_id}'
        '/analytics/tab-content/period-default/explore'
        '?entity_type=VIDEO'
        f'&entity_id={video_id}'
        '&time_period=since_publish'
        '&explore_type=TABLE_AND_CHART'
        '&metric=VIDEO_THUMBNAIL_IMPRESSIONS'
        '&granularity=MONTH'
        '&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS'
        '&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS_VTR'
        '&t_metrics=EXTERNAL_VIEWS'
        '&t_metrics=EXTERNAL_WATCH_TIME'
        '&dimension=MONTH'
        '&o_column=VIDEO_THUMBNAIL_IMPRESSIONS'
        '&o_direction=ANALYTICS_ORDER_DIRECTION_DESC'
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

def _update_master(gc, video_id: str, stats: dict):
    """_RawData_Master 해당 video_id 행 impressions/ctr 업데이트 (cell-by-cell)"""
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet(TARGET_SHEET)

    headers = ws.row_values(1)

    def _col(name):
        try:
            return headers.index(name) + 1
        except ValueError:
            return None

    vid_col = _col('video_id')
    imp_col = _col('impressions')
    ctr_col = _col('ctr')
    src_col = _col('ctr_source')
    upd_col = _col('ctr_updated_at')

    if not all([vid_col, imp_col, ctr_col]):
        raise RuntimeError(f"필수 컬럼 없음 (video_id/impressions/ctr). headers: {headers[:10]}")

    col_vals = ws.col_values(vid_col)
    try:
        row_idx = col_vals.index(video_id) + 1
    except ValueError:
        raise RuntimeError(f"video_id '{video_id}' not found in {TARGET_SHEET}")

    now_utc = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    ws.update_cell(row_idx, imp_col, stats['impressions'])
    ws.update_cell(row_idx, ctr_col, stats['ctr'])
    if src_col:
        ws.update_cell(row_idx, src_col, 'studio_since_publish')
    if upd_col:
        ws.update_cell(row_idx, upd_col, now_utc)

    print(f"  ✅ {video_id}: impressions={stats['impressions']:,}  ctr={stats['ctr']:.4f}  (갱신: {now_utc})")


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(EXPORTS_DIR, exist_ok=True)

    print("=" * 60)
    print("최근 영상 '게시 이후' 통계 직접 갱신 v1.0")
    print("=" * 60)

    # 1. 최근 video_id 조회
    print("\n[1] _RawData_Master → 최근 video_id 조회...")
    gc = _get_gspread_client()
    video_id, upload_date = _get_latest_video_id(gc)

    url = _build_video_url(video_id)
    print(f"\n[2] Studio 영상 분석 진입 (게시 이후)...")
    print(f"    video_id : {video_id}  |  upload_date : {upload_date}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            print(f"❌ CDP 연결 실패: {e}")
            print("  → sync_studio_csv.sh가 Chrome을 먼저 시작해야 합니다.")
            sys.exit(1)

        contexts = browser.contexts
        if not contexts:
            print("❌ 열린 브라우저 컨텍스트 없음")
            sys.exit(1)

        context = contexts[0]
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 900})

        # 영상 분석 페이지 직접 진입 (video-level은 since_publish URL 정상 렌더링)
        try:
            page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except PlaywrightTimeoutError:
            pass

        if 'accounts.google.com' in page.url or 'signin' in page.url.lower():
            print("❌ 로그인 필요 — CDP Chrome에서 YouTube Studio 로그인 확인")
            page.screenshot(path=str(EXPORTS_DIR / 'debug_recent_video.png'))
            sys.exit(1)

        print("[3] Export 버튼 대기 (최대 90초)...")
        ok = _wait_for_export_button(page, timeout_sec=90)
        if not ok:
            page.screenshot(path=str(EXPORTS_DIR / 'debug_recent_video.png'))
            print("❌ Export 버튼 없음 (스크린샷 저장됨)")
            browser.close()
            sys.exit(1)

        export_btn = _find_export_button(page)

        print("[4] 다운로드 시작...")
        zip_path = None
        try:
            with page.expect_download(timeout=60000) as dl_info:
                export_btn.click()
                page.wait_for_timeout(1500)

                csv_item = page.locator('tp-yt-paper-item[test-id="CSV"]').first
                if csv_item.is_visible(timeout=5000):
                    csv_item.click()
                    print("  CSV 옵션 클릭")
                else:
                    for txt in ['쉼표로 구분된 값(.csv)', 'CSV']:
                        try:
                            page.get_by_text(txt, exact=False).first.click()
                            print(f"  CSV 옵션 클릭 (텍스트: '{txt}')")
                            break
                        except Exception:
                            pass

            download = dl_info.value
            zip_path = str(EXPORTS_DIR / os.path.basename(download.suggested_filename))
            download.save_as(zip_path)
            print(f"  ✅ ZIP 저장: {os.path.basename(zip_path)} ({os.path.getsize(zip_path)//1024} KB)")

        except Exception as e:
            print(f"❌ 다운로드 실패: {e}")
            browser.close()
            sys.exit(1)

        browser.close()

    # 5. ZIP 압축 해제
    print(f"\n[5] ZIP 압축 해제...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        members = zf.namelist()
        print(f"  내용: {members}")
        zf.extractall(str(EXPORTS_DIR))

    table_csv = str(EXPORTS_DIR / '표 데이터.csv')
    if not os.path.exists(table_csv):
        candidates = sorted(
            [c for c in _glob.glob(str(EXPORTS_DIR / '*.csv'))
             if 'studio_reach_report' not in c],
            key=os.path.getsize, reverse=True
        )
        if not candidates:
            print("❌ 추출된 CSV 없음")
            sys.exit(1)
        table_csv = candidates[0]
        print(f"  폴백 CSV: {os.path.basename(table_csv)}")

    # 6. CSV 파싱 + 집계
    print(f"\n[6] CSV 파싱: {os.path.basename(table_csv)}")
    stats = _parse_csv(table_csv)
    print(f"  impressions={stats['impressions']:,}  ctr={stats['ctr']:.4f}  views={stats['views']:,}")

    if stats['impressions'] == 0:
        print("  ⚠️ impressions=0 — 데이터 없음 또는 파싱 오류. Sheets 업데이트 스킵.")
        sys.exit(0)

    # 7. _RawData_Master 직접 업데이트
    print(f"\n[7] _RawData_Master 직접 업데이트...")
    _update_master(gc, video_id, stats)

    print(f"\n✅ 완료")


if __name__ == '__main__':
    main()
