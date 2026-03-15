"""
studio_csv_ingestor.py
YouTube Studio Reach 데이터 수집기 v1.0

목적:
    YouTube Reporting API 또는 수동 Studio CSV를 통해
    Impressions / CTR 데이터를 수집하여 _RawData_Master 시트를 업데이트한다.

모드:
    1) AUTO 모드 (기본): YouTube Reporting API로 channel_reach_a2 리포트 자동 다운로드
    2) MANUAL 모드: youtube_exports/studio_reach_report.csv 직접 파싱

사용법:
    python3 studio_csv_ingestor.py             # AUTO 모드
    python3 studio_csv_ingestor.py --manual    # MANUAL 모드 (CSV 파일 필요)
    python3 studio_csv_ingestor.py --dry-run   # 시트 쓰기 없이 로그만 출력

CSV 저장 경로:
    07_AUTOMATION_자동화/youtube_exports/studio_reach_report.csv

_RawData_Master 업데이트 규칙:
    - video_id 기준으로 기존 행 업데이트만 수행 (append 금지)
    - impressions, ctr 컬럼만 갱신 (보호 컬럼 불변)
    - CSV에 없는 영상은 skip (값 변경 없음)
    - impressions/ctr 값이 없는 경우 0으로 기본 처리
"""

import os
import sys
import csv
import io
import pickle
import base64
import argparse
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import gspread
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import urllib.request
import urllib.error

# ─── 경로 설정 ─────────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
AUTO_ROOT    = os.path.abspath(os.path.join(BASE_DIR, '..'))
EXPORTS_DIR  = os.path.join(AUTO_ROOT, 'youtube_exports')
CSV_FILENAME = 'studio_reach_report.csv'
CSV_PATH     = os.path.join(EXPORTS_DIR, CSV_FILENAME)

# ─── 설정 ──────────────────────────────────────────────────────────────────────
CHANNEL_ID     = 'UCAvSo9RLq0rCy64IH2nm91w'
SPREADSHEET_ID = '12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y'
TARGET_SHEET   = '_RawData_Master'

# YouTube Reporting API: Reach 지표 포함 리포트 타입
REACH_REPORT_TYPE = 'channel_reach_a2'

# ─── 듀얼 인증 모드 ─────────────────────────────────────────────────────────────
IS_CI = os.environ.get('CI') == 'true' or os.environ.get('GITHUB_ACTIONS') == 'true'

SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/youtubepartner-channel-audit',
]

if IS_CI:
    print("🔧 [CI Mode] GitHub Actions 환경 감지됨 — 환경변수 기반 인증")
    _ci_dir = Path('/tmp/soundstorm_creds')
    _ci_dir.mkdir(exist_ok=True)

    for env_key, filename in [
        ('SERVICE_ACCOUNT_B64', 'service_account.json'),
        ('CLIENT_SECRET_B64',   'client_secret.json'),
        ('GOOGLE_TOKEN_B64',    'token.pickle'),
    ]:
        b64_val = os.environ.get(env_key, '')
        if b64_val:
            target = _ci_dir / filename
            target.write_bytes(base64.b64decode(b64_val))
            print(f"  ✅ {filename} 복원 완료")

    CREDENTIALS_PATH = str(_ci_dir / 'service_account.json')
    TOKEN_PICKLE     = str(_ci_dir / 'token.pickle')
    CLIENT_SECRET    = str(_ci_dir / 'client_secret.json')
    SPREADSHEET_ID   = os.environ.get('GOOGLE_SHEETS_ID', SPREADSHEET_ID)
else:
    _creds_dir       = os.path.join(AUTO_ROOT, 'credentials')
    CREDENTIALS_PATH = os.path.join(_creds_dir, 'service_account.json')
    TOKEN_PICKLE     = os.path.join(_creds_dir, 'token.pickle')
    CLIENT_SECRET    = os.path.join(_creds_dir, 'client_secret.json')


# ─── OAuth 인증 (YouTube API) ──────────────────────────────────────────────────
def get_oauth_credentials():
    """token.pickle 에서 OAuth 자격증명을 로드한다."""
    creds = None
    if os.path.exists(TOKEN_PICKLE):
        with open(TOKEN_PICKLE, 'rb') as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if IS_CI:
                raise RuntimeError(
                    "❌ [CI] token.pickle 만료 — 로컬에서 갱신 후 GOOGLE_TOKEN_B64 재업로드 필요"
                )
            flow  = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PICKLE, 'wb') as f:
            pickle.dump(creds, f)

    return creds


# ─── YouTube Reporting API 다운로드 ───────────────────────────────────────────

def _ensure_reach_job(reporting):
    """
    channel_reach_a2 리포팅 Job이 없으면 신규 생성하고 job_id를 반환한다.
    이미 있으면 기존 job_id를 반환한다.
    """
    jobs_resp = reporting.jobs().list().execute()
    for job in jobs_resp.get('jobs', []):
        if job.get('reportTypeId') == REACH_REPORT_TYPE:
            print(f"  ✅ 기존 Reach Job 확인: {job['id']}")
            return job['id']

    # 신규 생성
    new_job = reporting.jobs().create(body={
        'reportTypeId': REACH_REPORT_TYPE,
        'name':         'soundstorm_reach_auto',
    }).execute()
    print(f"  🆕 Reach Job 신규 생성: {new_job['id']}")
    print("  ⚠️  첫 리포트는 내일 이후 생성됩니다.")
    return new_job['id']


def download_reach_report_auto(creds):
    """
    YouTube Reporting API로 최신 channel_reach_a2 CSV를 다운로드하여
    CSV_PATH 에 저장한다.

    반환: CSV 저장 경로 (str) 또는 None (리포트 미존재)
    """
    reporting = build('youtubereporting', 'v1', credentials=creds)
    job_id    = _ensure_reach_job(reporting)

    # 사용 가능한 리포트 목록 (최신 순 정렬)
    reports_resp = reporting.jobs().reports().list(jobId=job_id).execute()
    reports      = reports_resp.get('reports', [])

    if not reports:
        print("  ⚠️  아직 생성된 Reach 리포트 없음 (Job 생성 후 1일 대기 필요)")
        return None

    # createTime 기준 최신 리포트 선택
    latest = sorted(reports, key=lambda r: r.get('createTime', ''), reverse=True)[0]
    print(f"  📄 최신 리포트: {latest.get('startTime', '?')} ~ {latest.get('endTime', '?')}")
    print(f"     createTime: {latest.get('createTime', '?')}")

    # 다운로드
    download_url = latest['downloadUrl']
    import google.auth.transport.requests
    auth_session = google.auth.transport.requests.AuthorizedSession(creds)
    response     = auth_session.get(download_url)
    response.raise_for_status()

    os.makedirs(EXPORTS_DIR, exist_ok=True)
    with open(CSV_PATH, 'w', encoding='utf-8') as f:
        f.write(response.text)

    print(f"  💾 CSV 저장 완료: {CSV_PATH}")
    return CSV_PATH


# ─── CSV 파싱 ──────────────────────────────────────────────────────────────────

def _normalize_pct(value_str):
    """
    CTR 값을 0~1 범위 float 비율로 정규화한다.

    포맷별 처리:
      "5.2%"  → 0.052   (% 기호 포함)
      "5.2"   → 0.052   (YouTube Studio CSV: 컬럼명에 % 표시, 값은 숫자만)
      "0.052" → 0.052   (Reporting API: 이미 0~1 소수)

    판별 기준: 값 >= 1.0 이면 % 형식으로 간주 → /100
    (CTR이 100% 이상인 경우는 없으므로 안전)
    """
    v = str(value_str).strip().replace(',', '')
    if v.endswith('%'):
        try:
            return round(float(v[:-1]) / 100, 6)
        except ValueError:
            return 0.0
    try:
        n = float(v)
        # 1.0 이상이면 % 표기 숫자 (예: 6.28 = 6.28%) → /100
        return round(n / 100 if n >= 1.0 else n, 6)
    except ValueError:
        return 0.0


def parse_csv_to_reach_map(csv_path):
    """
    CSV 파일을 읽어 {video_id: {'impressions': int, 'ctr': float}} 형태로 반환한다.

    지원 포맷:
      A) YouTube Studio 내보내기 CSV
         컬럼: Video ID | Impressions | Impressions click-through rate
      B) YouTube Reporting API channel_reach_a2 CSV
         컬럼: video_id | impressions | impression_click_through_rate
         (video_id + date + dimension 기준 복수 행 → video_id 기준 합산)
    """
    reach_map = {}  # {video_id: {'impressions': int, 'ctr_sum': float, 'ctr_count': int}}

    with open(csv_path, encoding='utf-8-sig') as f:
        # BOM 제거 후 헤더 기반 자동 포맷 감지
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        print(f"  📋 CSV 헤더: {headers}")

        # 컬럼 이름 매핑 (Studio 포맷 / Reporting API 포맷)
        col_video_id    = None
        col_impressions = None
        col_ctr         = None

        for h in headers:
            h_lower = h.strip().lower()
            if h_lower in ('video id', 'video_id', '콘텐츠', 'content'):
                col_video_id = h
            elif h_lower in ('impressions', '노출수'):
                col_impressions = h
            elif h_lower in ('impressions click-through rate',
                             'impression_click_through_rate',
                             'impressions_ctr',
                             '노출 클릭률 (%)',
                             '노출 클릭률(%)'):
                col_ctr = h

        if not col_video_id:
            raise ValueError(f"❌ CSV에서 video_id 컬럼을 찾을 수 없습니다. 헤더: {headers}")
        if not col_impressions:
            raise ValueError(f"❌ CSV에서 impressions 컬럼을 찾을 수 없습니다. 헤더: {headers}")

        print(f"  🔍 매핑 — video_id: '{col_video_id}' | impressions: '{col_impressions}' | ctr: '{col_ctr}'")

        for row in reader:
            vid = str(row.get(col_video_id, '')).strip()
            if not vid or vid.lower() == 'video id':
                continue  # 빈 행 / 중간 헤더 행 스킵

            imp_raw = str(row.get(col_impressions, '0')).strip().replace(',', '')
            try:
                imp = int(float(imp_raw)) if imp_raw else 0
            except ValueError:
                imp = 0

            ctr = 0.0
            if col_ctr:
                ctr = _normalize_pct(row.get(col_ctr, '0'))

            # Reporting API CSV는 video_id + date 기준 복수 행 → 합산
            if vid in reach_map:
                reach_map[vid]['impressions'] += imp
                reach_map[vid]['ctr_sum']     += ctr
                reach_map[vid]['ctr_count']   += 1
            else:
                reach_map[vid] = {
                    'impressions': imp,
                    'ctr_sum':     ctr,
                    'ctr_count':   1,
                }

    # CTR 평균 계산 (Reporting API 복수 행 합산 후)
    result = {}
    for vid, data in reach_map.items():
        count = data['ctr_count']
        result[vid] = {
            'impressions': data['impressions'],
            'ctr':         round(data['ctr_sum'] / count, 6) if count > 0 else 0.0,
        }

    print(f"  📊 파싱 결과: {len(result)}개 영상의 Reach 데이터 추출")
    return result


# ─── _RawData_Master 업데이트 ──────────────────────────────────────────────────

def update_rawdata_master(reach_map, dry_run=False):
    """
    _RawData_Master 시트의 impressions / ctr 컬럼을 video_id 기준으로 업데이트한다.

    규칙:
      - 기존 행 업데이트만 수행 (append 금지)
      - impressions, ctr 컬럼만 갱신
      - CSV에 없는 video_id 행은 변경하지 않음
      - 셀 단위 업데이트로 서식 보존
    """
    scopes_sheet = ['https://www.googleapis.com/auth/spreadsheets']
    creds_sheet  = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes_sheet)
    gc           = gspread.authorize(creds_sheet)
    ss           = gc.open_by_key(SPREADSHEET_ID)

    try:
        ws = ss.worksheet(TARGET_SHEET)
    except gspread.exceptions.WorksheetNotFound:
        print(f"❌ 시트 없음: {TARGET_SHEET}")
        print("   api_data_shuttler.py 를 먼저 실행하여 시트를 생성하세요.")
        return 0

    all_values = ws.get_all_values()
    if not all_values:
        print("❌ _RawData_Master 가 비어있습니다.")
        return 0

    headers = [h.strip() for h in all_values[0]]
    print(f"  📋 시트 헤더: {headers[:10]}...")

    # 필요 컬럼 인덱스 확인
    try:
        idx_video_id    = headers.index('video_id')
    except ValueError:
        print("❌ 'video_id' 컬럼을 찾을 수 없습니다.")
        return 0

    # impressions / ctr 컬럼 없으면 자동 추가
    if 'impressions' not in headers:
        print("  🆕 'impressions' 컬럼 없음 → 추가")
        if not dry_run:
            ws.update_cell(1, len(headers) + 1, 'impressions')
        headers.append('impressions')

    if 'ctr' not in headers:
        print("  🆕 'ctr' 컬럼 없음 → 추가")
        if not dry_run:
            ws.update_cell(1, len(headers) + 1, 'ctr')
        headers.append('ctr')

    idx_impressions = headers.index('impressions')
    idx_ctr         = headers.index('ctr')

    # 업데이트할 셀 목록 수집 (batch 처리용)
    cell_updates = []  # [(row_1indexed, col_1indexed, value), ...]
    matched   = 0
    skipped   = 0

    for row_idx, row in enumerate(all_values[1:], start=2):  # 헤더 제외, 1-indexed
        if len(row) <= idx_video_id:
            continue
        vid = str(row[idx_video_id]).strip()
        if not vid:
            continue

        if vid not in reach_map:
            skipped += 1
            continue

        data = reach_map[vid]
        cell_updates.append((row_idx, idx_impressions + 1, data['impressions']))
        cell_updates.append((row_idx, idx_ctr + 1, data['ctr']))
        matched += 1

    print(f"\n  ✅ 매칭: {matched}개 영상 | 스킵: {skipped}개 영상 (CSV에 없음)")

    if dry_run:
        print("  ⚠️  [Dry-run] 시트 쓰기 건너뜀")
        if cell_updates:
            print(f"  샘플 업데이트 (최대 5건):")
            for r, c, v in cell_updates[:10:2]:
                col_name = headers[c - 1]
                print(f"    Row {r} / Col {c} ({col_name}) = {v}")
        return matched

    if not cell_updates:
        print("  ⚠️  업데이트할 데이터 없음")
        return 0

    # gspread batch_update (API 호출 최소화)
    update_data = [
        {
            'range': gspread.utils.rowcol_to_a1(r, c),
            'values': [[v]],
        }
        for r, c, v in cell_updates
    ]

    ws.batch_update(update_data, value_input_option='USER_ENTERED')
    print(f"  📤 _RawData_Master 업데이트 완료 ({matched}개 영상 / {len(cell_updates)}셀 갱신)")

    # ── 검증: 쓰기 후 첫 5행 읽어서 출력 ─────────────────────────────────────
    print("  🔍 [검증] _RawData_Master 쓰기 확인 (첫 5행):")
    verify_range = f"{gspread.utils.rowcol_to_a1(1, idx_impressions + 1)}:" \
                   f"{gspread.utils.rowcol_to_a1(6, idx_ctr + 1)}"
    print(f"       읽기 범위: _RawData_Master!{verify_range}")
    verify_rows = ws.get(verify_range)
    # 헤더 행 제외 (row 1 → index 0)
    header_row  = verify_rows[0] if verify_rows else []
    print(f"       헤더: {header_row}")
    for i, vrow in enumerate(verify_rows[1:6], start=2):
        imp_val = vrow[0] if len(vrow) > 0 else "—"
        ctr_val = vrow[1] if len(vrow) > 1 else "—"
        # video_id 함께 출력 (가독성)
        vid_in_row = ""
        if len(all_values) > i - 1:
            vid_in_row = all_values[i - 1][idx_video_id] if len(all_values[i - 1]) > idx_video_id else ""
        print(f"       Row {i} video_id={vid_in_row} impressions={imp_val} ctr={ctr_val}")

    return matched


# ─── Thumbnail_Analysis CTR 동기화 ────────────────────────────────────────────

def sync_thumbnail_analysis_ctr(reach_map, dry_run=False):
    """
    _RawData_Master에 기록된 impressions / ctr 값을 Thumbnail_Analysis 시트에 동기화한다.

    동작:
      - video_id 기준으로 Thumbnail_Analysis 행과 reach_map 매칭
      - impressions / ctr 컬럼이 없으면 자동 추가
      - 값을 직접 쓴다 (style_engine이 ws.clear() 로 수식을 지우므로 value 방식 사용)
      - Thumbnail_Analysis 시트가 없으면 스킵 (style_engine 미실행 상태)

    Args:
        reach_map: {video_id: {'impressions': int, 'ctr': float}} — update_rawdata_master 와 동일 구조
        dry_run:   True 이면 시트 쓰기 없이 로그만 출력
    """
    THUMB_SHEET = 'Thumbnail_Analysis'

    scopes_sheet = ['https://www.googleapis.com/auth/spreadsheets']
    creds_sheet  = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes_sheet)
    gc           = gspread.authorize(creds_sheet)
    ss           = gc.open_by_key(SPREADSHEET_ID)

    try:
        ws = ss.worksheet(THUMB_SHEET)
    except gspread.exceptions.WorksheetNotFound:
        print(f"  ℹ️  {THUMB_SHEET} 시트 없음 — style_engine 실행 후 자동 생성됩니다. 스킵.")
        return 0

    all_values = ws.get_all_values()
    if not all_values:
        print(f"  ℹ️  {THUMB_SHEET} 비어있음 — 스킵.")
        return 0

    headers = [h.strip() for h in all_values[0]]
    print(f"  📋 {THUMB_SHEET} 헤더: {headers}")

    # video_id 컬럼 필수
    if 'video_id' not in headers:
        print(f"  ❌ {THUMB_SHEET}에 video_id 컬럼 없음 — 스킵.")
        return 0

    idx_video_id = headers.index('video_id')

    # impressions / ctr 컬럼 없으면 자동 추가 (시트 크기 먼저 확장)
    new_cols_needed = sum([
        1 for col in ('impressions', 'ctr') if col not in headers
    ])
    if new_cols_needed > 0 and not dry_run:
        required_cols = len(headers) + new_cols_needed
        if ws.col_count < required_cols:
            ws.resize(rows=ws.row_count, cols=required_cols)
            print(f"  📐 시트 크기 확장: cols → {required_cols}")

    if 'impressions' not in headers:
        print(f"  🆕 '{THUMB_SHEET}'에 'impressions' 컬럼 추가")
        if not dry_run:
            ws.update_cell(1, len(headers) + 1, 'impressions')
        headers.append('impressions')

    if 'ctr' not in headers:
        print(f"  🆕 '{THUMB_SHEET}'에 'ctr' 컬럼 추가")
        if not dry_run:
            ws.update_cell(1, len(headers) + 1, 'ctr')
        headers.append('ctr')

    idx_impressions = headers.index('impressions')
    idx_ctr         = headers.index('ctr')

    cell_updates = []
    matched  = 0
    skipped  = 0

    for row_idx, row in enumerate(all_values[1:], start=2):
        if len(row) <= idx_video_id:
            continue
        vid = str(row[idx_video_id]).strip()
        if not vid:
            continue

        if vid not in reach_map:
            skipped += 1
            continue

        data = reach_map[vid]
        cell_updates.append((row_idx, idx_impressions + 1, data['impressions']))
        cell_updates.append((row_idx, idx_ctr         + 1, data['ctr']))
        matched += 1

    print(f"\n  ✅ {THUMB_SHEET} 매칭: {matched}개 | 스킵: {skipped}개")

    if dry_run:
        print(f"  ⚠️  [Dry-run] {THUMB_SHEET} 쓰기 건너뜀")
        return matched

    if not cell_updates:
        print(f"  ⚠️  {THUMB_SHEET} 업데이트할 데이터 없음")
        return 0

    update_data = [
        {
            'range':  gspread.utils.rowcol_to_a1(r, c),
            'values': [[v]],
        }
        for r, c, v in cell_updates
    ]
    ws.batch_update(update_data, value_input_option='USER_ENTERED')
    print(f"  📤 {THUMB_SHEET} 업데이트 완료 ({matched}개 영상 / {len(cell_updates)}셀 갱신)")
    return matched


# ─── 지표 재계산 트리거 ───────────────────────────────────────────────────────

def trigger_recalculate_metrics():
    """
    _RawData_Master 업데이트 후 analytics_snapshot_engine.py 를 실행하여
    _Analytics_Snapshot 시트를 최신 상태로 갱신한다.
    """
    engine_path = os.path.join(AUTO_ROOT, 'engine', 'analytics_snapshot_engine.py')
    if not os.path.exists(engine_path):
        print(f"⚠️  recalculate_metrics 스킵: {engine_path} 없음")
        return

    print("\n🔄 recalculate_metrics() 트리거 중...")
    result = subprocess.run(
        [sys.executable, engine_path],
        capture_output=True,
        text=True,
        cwd=AUTO_ROOT,
    )
    if result.returncode == 0:
        print("  ✅ _Analytics_Snapshot 갱신 완료")
    else:
        print(f"  ⚠️  analytics_snapshot_engine 종료 코드: {result.returncode}")
        if result.stderr:
            print(f"  STDERR: {result.stderr[:500]}")


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main(manual_mode=False, dry_run=False):
    print("=" * 60)
    print("📡 YouTube Studio Reach 수집기 v1.0 시작")
    print(f"   모드    : {'MANUAL (CSV 직접 파싱)' if manual_mode else 'AUTO (Reporting API)'}")
    print(f"   Dry-run : {dry_run}")
    print("=" * 60)

    csv_path = None

    if manual_mode:
        # ── MANUAL 모드: 기존 CSV 파일 사용 ──────────────────────────────────
        if not os.path.exists(CSV_PATH):
            print(f"⚠️  Studio CSV not found, skipping ingestion: {CSV_PATH}")
            sys.exit(0)
        print(f"📂 CSV 파일 로드: {CSV_PATH}")
        csv_path = CSV_PATH

    else:
        # ── AUTO 모드: Reporting API 다운로드 ────────────────────────────────
        if not os.path.exists(CLIENT_SECRET if not IS_CI else '/tmp/soundstorm_creds/client_secret.json'):
            print("⚠️  client_secret.json 없음 → MANUAL 모드로 전환")
            manual_mode = True
            if not os.path.exists(CSV_PATH):
                print(f"❌ CSV 파일도 없음: {CSV_PATH}")
                sys.exit(1)
            csv_path = CSV_PATH
        else:
            try:
                print("\n🔐 OAuth 인증 중...")
                creds    = get_oauth_credentials()
                print("  ✅ OAuth 인증 성공")
                print("\n📥 Reporting API에서 Reach 리포트 다운로드 중...")
                csv_path = download_reach_report_auto(creds)
            except Exception as e:
                err_str = str(e)
                if '404' in err_str:
                    print(f"⚠️  Reporting API 미지원 채널 (404) — MANUAL 모드로 자동 전환")
                    print("   ※ YouTube Reporting API는 파트너/인증 채널 전용입니다.")
                    print(f"   ※ 이후 실행은 --manual 플래그 사용을 권장합니다.")
                else:
                    print(f"⚠️  Reporting API 실패: {e}")
                if os.path.exists(CSV_PATH):
                    print(f"  ↩️  기존 CSV 파일로 폴백: {CSV_PATH}")
                    csv_path = CSV_PATH
                else:
                    print(f"❌ 폴백 CSV도 없습니다: {CSV_PATH}")
                    print("   YouTube Studio에서 CSV를 내보내고 위 경로에 저장하세요.")
                    sys.exit(1)

    if not csv_path:
        print("⚠️  리포트 없음 — 오늘 실행 건너뜀 (내일 재시도)")
        sys.exit(0)

    # ── CSV 파싱 ──────────────────────────────────────────────────────────────
    print(f"\n📊 CSV 파싱 중: {csv_path}")
    try:
        reach_map = parse_csv_to_reach_map(csv_path)
    except Exception as e:
        print(f"❌ CSV 파싱 실패: {e}")
        sys.exit(1)

    if not reach_map:
        print("⚠️  파싱 결과 없음 — CSV에 유효한 데이터가 없습니다.")
        sys.exit(0)

    # ── _RawData_Master 업데이트 ──────────────────────────────────────────────
    print(f"\n📝 _RawData_Master 업데이트 중...")
    updated = update_rawdata_master(reach_map, dry_run=dry_run)

    # ── Thumbnail_Analysis CTR 동기화 ─────────────────────────────────────────
    print(f"\n🖼️  Thumbnail_Analysis CTR 동기화 중...")
    try:
        sync_thumbnail_analysis_ctr(reach_map, dry_run=dry_run)
    except Exception as e:
        print(f"  ⚠️  Thumbnail_Analysis 동기화 실패 (비치명적): {e}")

    # ── Channel CTR KPI 시트 생성 ────────────────────────────────────────────
    if updated > 0 and not dry_run:
        print("\n📊 Channel_CTR_KPI 생성 중...")
        try:
            sys.path.insert(0, AUTO_ROOT)
            from analytics.channel_ctr_engine import build_channel_ctr_kpi
            scopes_sheet = ['https://www.googleapis.com/auth/spreadsheets']
            creds_sheet  = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes_sheet)
            gc           = gspread.authorize(creds_sheet)
            ss           = gc.open_by_key(SPREADSHEET_ID)
            build_channel_ctr_kpi(ss)
        except Exception as e:
            print(f"  ⚠️  Channel_CTR_KPI 생성 실패 (비치명적): {e}")

    # ── 지표 재계산 ───────────────────────────────────────────────────────────
    if updated > 0 and not dry_run:
        trigger_recalculate_metrics()

    print("\n" + "=" * 60)
    print(f"✅ Reach 수집 완료 — {updated}개 영상 업데이트")
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"   실행 시각: {ts}")
    print("=" * 60)


# ─── CLI 진입점 ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='YouTube Studio Reach 데이터 수집기'
    )
    parser.add_argument(
        '--manual',
        action='store_true',
        help=f'수동 CSV 파싱 모드 (파일: {CSV_PATH})',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='시트에 쓰지 않고 로그만 출력',
    )
    args = parser.parse_args()
    main(manual_mode=args.manual, dry_run=args.dry_run)
