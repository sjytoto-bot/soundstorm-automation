import os
import time
import pickle
import json
import urllib.request
import pandas as pd
import isodate # [v10.2] 성능 최적화 (루프 밖으로 이동)
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import gspread
from google.oauth2.service_account import Credentials

from pathlib import Path

# ========== 설정 ==========
# [v15.2] 경로 의존성 제거 - 파일 위치 기준 동적 계산
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
print("🚀 SOUNDSTORM automation starting")
print(f"📁 Script/Base directory: {BASE_DIR}")
print(f"🤖 GitHub Actions mode: {bool(os.environ.get('SERVICE_ACCOUNT_B64'))}")

CHANNEL_ID = 'UCAvSo9RLq0rCy64IH2nm91w'
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"

# [v15.0] 듀얼 인증 모드: 로컬(파일) / CI(환경변수 base64)
import base64

IS_CI = os.environ.get('CI') == 'true' or os.environ.get('GITHUB_ACTIONS') == 'true'

if IS_CI:
    print("🔧 [CI Mode] GitHub Actions 환경 감지됨 — 환경변수 기반 인증")
    # 환경변수에서 base64 디코딩 → /tmp에 임시 파일 생성
    _ci_dir = Path('/tmp/soundstorm_creds')
    _ci_dir.mkdir(exist_ok=True)

    for env_key, filename in [
        ('SERVICE_ACCOUNT_B64', 'service_account.json'),
        ('CLIENT_SECRET_B64', 'client_secret.json'),
        ('GOOGLE_TOKEN_B64', 'token.pickle'),
    ]:
        b64_val = os.environ.get(env_key, '')
        if b64_val:
            target = _ci_dir / filename
            target.write_bytes(base64.b64decode(b64_val))
            print(f"  ✅ {filename} 복원 완료")

    CREDENTIALS_PATH = str(_ci_dir / 'service_account.json')
    TOKEN_PICKLE = str(_ci_dir / 'token.pickle')
    CLIENT_SECRET = str(_ci_dir / 'client_secret.json')
    SPREADSHEET_ID = os.environ.get('GOOGLE_SHEETS_ID', SPREADSHEET_ID)
else:
    # 로컬 모드: 기존 환경 의존을 버리고 스크립트 기준 명시적 상대경로 사용
    # BASE_DIR은 .../07_AUTOMATION_자동화/scripts_스크립트
    AUTO_CREDENTIALS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "credentials"))
    CREDENTIALS_PATH = os.path.join(AUTO_CREDENTIALS_DIR, "service_account.json")
    TOKEN_PICKLE = os.path.join(AUTO_CREDENTIALS_DIR, "token.pickle")
    CLIENT_SECRET = os.path.join(AUTO_CREDENTIALS_DIR, "client_secret.json")

    # 파일 존재 여부 사전 검증 (로컬 전용)
    for file_path, desc in [
        (CREDENTIALS_PATH, "Service Account JSON (Google Sheets)"),
        (CLIENT_SECRET, "Client Secret JSON (YouTube API)")
    ]:
        if not os.path.exists(file_path):
            raise Exception(f"❌ 필수 인증 파일을 찾을 수 없습니다: {desc}\n  -> 경로: {file_path}")

# [v14.3] 권한 스코프 확장 (Analytics + Monetary Revenue)
SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'
]

def _purge_full_period(ws, columns, keep_days=90, threshold=3000):
    """[v16.3] _RawData_FullPeriod 90일 Rolling Purge

    - 전체 행 수가 threshold(3000) 미만이면 스킵 (API 호출 절약)
    - fetched_at 기준으로 keep_days(90일) 이전 행 삭제
    - 헤더 행은 항상 보존
    """
    all_rows = ws.get_all_values()
    total = len(all_rows)  # 헤더 포함

    if total < threshold:
        print(f"  ℹ️  [FullPeriod Purge] {total - 1}행 — {threshold}행 미만, 스킵")
        return

    header = all_rows[0]
    try:
        idx_fetched = header.index('fetched_at')
    except ValueError:
        print("  ⚠️  [FullPeriod Purge] fetched_at 컬럼 없음 — 스킵")
        return

    cutoff = (datetime.now(timezone.utc) + timedelta(hours=9) - timedelta(days=keep_days))
    kept = []
    removed = 0
    for row in all_rows[1:]:
        val = row[idx_fetched] if len(row) > idx_fetched else ''
        try:
            row_dt = datetime.strptime(val[:19], '%Y-%m-%d %H:%M:%S')
            if row_dt >= cutoff:
                kept.append(row)
            else:
                removed += 1
        except (ValueError, TypeError):
            kept.append(row)  # 파싱 불가 행은 보존

    if removed == 0:
        print(f"  ℹ️  [FullPeriod Purge] 삭제 대상 없음 ({total - 1}행 모두 {keep_days}일 이내)")
        return

    ws.clear()
    ws.update([header] + kept, value_input_option='USER_ENTERED')
    print(f"  🗑️  [FullPeriod Purge] {removed}행 삭제 | {len(kept)}행 보존 ({keep_days}일 이내)")


def _replace_sheet_values_without_clear(ws, values, value_input_option='USER_ENTERED'):
    """기존 값을 비우지 않고 시트 전체 값을 안전 교체한다.

    순서:
    1. 필요한 크기만큼 시트를 확장
    2. 새 값을 A1부터 덮어씀
    3. 이전 데이터보다 작아진 영역만 후처리로 비움

    clear() 선행 호출을 피해서, 쓰기 중 예외가 나도 기존 데이터가 통째로
    사라지지 않도록 보호한다.
    """
    if not values or not values[0]:
        raise ValueError("values must contain at least one row and one column")

    target_rows = len(values)
    target_cols = max(len(row) for row in values)
    current_rows = ws.row_count
    current_cols = ws.col_count

    if current_rows < target_rows or current_cols < target_cols:
        ws.resize(rows=max(current_rows, target_rows), cols=max(current_cols, target_cols))

    end_a1 = gspread.utils.rowcol_to_a1(target_rows, target_cols)
    ws.update(f"A1:{end_a1}", values, value_input_option=value_input_option)

    stale_ranges = []
    if current_rows > target_rows:
        stale_ranges.append(
            f"A{target_rows + 1}:{gspread.utils.rowcol_to_a1(current_rows, max(current_cols, target_cols))}"
        )
    if current_cols > target_cols:
        stale_ranges.append(
            f"{gspread.utils.rowcol_to_a1(1, target_cols + 1)}:{gspread.utils.rowcol_to_a1(target_rows, current_cols)}"
        )

    if stale_ranges:
        ws.batch_clear(stale_ranges)
        print(f"  [SheetSafeWrite] 잔여 영역 정리: {', '.join(stale_ranges)}")


def get_usdkrw_rate():
    """[v14.3] USD/KRW 환율 자동 조회 (Open API + 폴백)"""
    import ssl
    import certifi
    FALLBACK_RATE = 1450.0
    try:
        url = 'https://open.er-api.com/v6/latest/USD'
        ctx = ssl.create_default_context(cafile=certifi.where())
        req = urllib.request.Request(url, headers={'User-Agent': 'SOUNDSTORM/1.0'})
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            data = json.loads(resp.read().decode())
            rate = float(data['rates']['KRW'])
            print(f"  💱 실시간 환율: 1 USD = {rate:,.2f} KRW")
            return rate
    except Exception as e:
        print(f"  ⚠️ 환율 조회 실패, 폴백 적용: {FALLBACK_RATE:,.0f} KRW ({e})")
        return FALLBACK_RATE

def _refresh_creds_with_retry(creds, max_retries: int = 3) -> None:
    """[v16.2] OAuth2 토큰 갱신 — 네트워크 오류 시 재시도 (최대 3회, 지수 백오프)"""
    import google.auth.exceptions
    for attempt in range(1, max_retries + 1):
        try:
            creds.refresh(Request())
            print(f"  ✅ OAuth 토큰 갱신 완료 (시도 {attempt}/{max_retries})")
            return
        except google.auth.exceptions.TransportError as e:
            wait = 15 * attempt  # 15s, 30s, 45s
            if attempt < max_retries:
                print(f"  ⚠️ 네트워크 오류 (시도 {attempt}/{max_retries}), {wait}초 후 재시도: {e}")
                time.sleep(wait)
            else:
                raise RuntimeError(
                    f"❌ OAuth 토큰 갱신 {max_retries}회 모두 실패 (TransportError)\n"
                    f"   원인: {e}\n"
                    f"   → DNS 해석 실패 또는 인터넷 연결 불안정. 잠시 후 재실행하세요."
                ) from e
        except Exception as e:
            raise RuntimeError(
                f"❌ OAuth 토큰 갱신 실패 (비네트워크 오류)\n"
                f"   원인: {e}\n"
                f"   → refresh_token이 완전히 만료됐거나 권한 취소됨.\n"
                f"   → 로컬에서 python api_data_shuttler.py 실행 후 export_secrets.py --push 실행하세요."
            ) from e


def _export_refreshed_token_for_ci() -> None:
    """[v16.2] CI 환경에서 갱신된 token.pickle을 마커 + b64 파일로 저장
    → 워크플로우가 GOOGLE_TOKEN_B64 Secret을 자동 업데이트할 수 있도록 신호 전달"""
    marker_dir = Path('/tmp/soundstorm_creds')
    marker_dir.mkdir(exist_ok=True)
    (marker_dir / 'token_was_refreshed').touch()

    # 갱신된 token.pickle을 base64 파일로도 저장 (gh secret set용)
    token_path = marker_dir / 'token.pickle'
    if token_path.exists():
        import base64 as _b64
        b64_val = _b64.b64encode(token_path.read_bytes()).decode()
        (marker_dir / 'token_refreshed.b64').write_text(b64_val)
        print("  📌 갱신된 토큰 마커 생성 → 워크플로우가 GOOGLE_TOKEN_B64 자동 업데이트 예정")


def get_authenticated_service():
    creds = None
    if os.path.exists(TOKEN_PICKLE):
        with open(TOKEN_PICKLE, 'rb') as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # [v16.2] 네트워크 오류에 강한 재시도 갱신
            _refresh_creds_with_retry(creds)
            # CI 환경에서 갱신 성공 → 워크플로우용 마커 생성
            if IS_CI:
                _export_refreshed_token_for_ci()
        else:
            if IS_CI:
                raise RuntimeError(
                    "❌ [CI] token.pickle이 완전히 만료 (refresh_token 없음)\n"
                    "   → 로컬에서 다음 순서로 갱신하세요:\n"
                    "      1) python api_data_shuttler.py  (브라우저 로그인)\n"
                    "      2) python export_secrets.py --push  (Secret 자동 업데이트)"
                )
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=0)
        # 토큰 저장 (CI에서는 /tmp에 저장)
        with open(TOKEN_PICKLE, 'wb') as token:
            pickle.dump(creds, token)

    return build('youtube', 'v3', credentials=creds), build('youtubeAnalytics', 'v2', credentials=creds)

def execute_query_with_retry(request, label="Query"):
    for retry in range(3):
        try:
            return request.execute()
        except Exception as e:
            # Exponential backoff: 0, 2, 4 seconds
            wait_time = 2 * retry
            print(f"  [Analytics] Retry attempt {retry+1} for {label} after error: {e}")
            if wait_time > 0:
                time.sleep(wait_time)
    return None

def get_authenticated_channel_info(youtube):
    """OAuth 토큰이 실제 어떤 채널에 귀속되어 있는지 확인한다.

    Analytics API 집계는 `channel==mine` 기준으로 동작하므로, 잘못된 계정 토큰이면
    Analytics_* 시트를 0으로 덮어쓸 수 있다. Data API는 explicit CHANNEL_ID를 사용해도
    Analytics는 그렇지 않기 때문에, 집계 전에 mine 채널을 검증해야 한다.
    """
    try:
        resp = youtube.channels().list(part='id,snippet', mine=True, maxResults=1).execute()
        items = resp.get('items', [])
        if not items:
            return None
        item = items[0]
        return {
            "id": item.get('id'),
            "title": item.get('snippet', {}).get('title', ''),
        }
    except Exception as e:
        print(f"  ⚠️ [Auth Guard] mine 채널 조회 실패: {e}")
        return None

def ensure_expected_analytics_owner(youtube):
    mine = get_authenticated_channel_info(youtube)
    if not mine:
        raise RuntimeError(
            "❌ [Auth Guard] OAuth 토큰의 mine 채널을 확인할 수 없습니다.\n"
            "   Analytics 집계를 안전하게 진행할 수 없어 중단합니다."
        )

    mine_id = mine.get("id")
    mine_title = mine.get("title") or "unknown"
    print(f"  🔐 [Auth Guard] mine 채널 확인: {mine_title} ({mine_id})")

    if mine_id != CHANNEL_ID:
        raise RuntimeError(
            "❌ [Auth Guard] 잘못된 YouTube OAuth 계정입니다.\n"
            f"   expected CHANNEL_ID={CHANNEL_ID}\n"
            f"   actual mine={mine_id} ({mine_title})\n"
            "   Analytics_* / Channel_KPI / Snapshot을 0으로 덮어쓰는 사고를 막기 위해 중단합니다."
        )

def summary_has_meaningful_data(sum_row):
    return any([
        int(sum_row.get('views', 0) or 0) > 0,
        int(sum_row.get('likes', 0) or 0) > 0,
        int(sum_row.get('watch_time_min', 0) or 0) > 0,
        int(sum_row.get('avg_duration_sec', 0) or 0) > 0,
        int(sum_row.get('subscriber_change', 0) or 0) > 0,
    ])

def fetch_demographics(analytics, end_dt):
    # FORCE DATE RANGE: 365 days window for stable demographics
    start_date = (end_dt - relativedelta(days=365)).strftime('%Y-%m-%d')
    end_date = end_dt.strftime('%Y-%m-%d')
    print(f"  📅 [Analytics] Demographic Date Guard: {start_date} ~ {end_date}")
    
    rows = []
    
    # AGE
    req_age = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='viewerPercentage',
        dimensions='ageGroup'
    )
    age_resp = execute_query_with_retry(req_age, "Age")
    age_rows = age_resp.get('rows', []) if age_resp else []
    
    if not age_rows:
        print("  [Analytics] Age rows collected: 0 (privacy threshold)")
        rows.append({'metric_type': 'age', 'dim_1': 'unknown', 'dim_2': 'ageGroup', 'value': 0})
    else:
        print(f"  [Analytics] Age rows collected: {len(age_rows)}")
        for r in age_rows:
            rows.append({'metric_type': 'age', 'dim_1': r[0], 'dim_2': 'ageGroup', 'value': r[1]})

    # GENDER
    req_gender = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='viewerPercentage',
        dimensions='gender'
    )
    gender_resp = execute_query_with_retry(req_gender, "Gender")
    gender_rows = gender_resp.get('rows', []) if gender_resp else []
    
    if not gender_rows:
        print("  [Analytics] Gender rows collected: 0 (privacy threshold)")
        rows.append({'metric_type': 'gender', 'dim_1': 'unknown', 'dim_2': 'gender', 'value': 0})
    else:
        print(f"  [Analytics] Gender rows collected: {len(gender_rows)}")
        for r in gender_rows:
            rows.append({'metric_type': 'gender', 'dim_1': r[0], 'dim_2': 'gender', 'value': r[1]})
            
    return rows

def fetch_traffic_sources(analytics, end_dt):
    start_date = (end_dt - relativedelta(days=365)).strftime('%Y-%m-%d')
    end_date = end_dt.strftime('%Y-%m-%d')
    print(f"  📅 [Analytics] Traffic Date Guard: {start_date} ~ {end_date}")
    
    req = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='views',
        dimensions='insightTrafficSourceType',
        sort='-views'
    )
    resp = execute_query_with_retry(req, "TrafficSource")
    rows = resp.get('rows', []) if resp else []
    
    if not rows:
        print("  [Analytics] Traffic rows: 0 (privacy threshold)")
        return [{'metric_type': 'traffic', 'dim_1': 'unknown', 'dim_2': '', 'value': 0}]
    
    print(f"  [Analytics] Traffic rows: {len(rows)}")
    return [{'metric_type': 'traffic', 'dim_1': r[0], 'dim_2': '', 'value': r[1]} for r in rows]

def fetch_video_traffic_sources_batch(analytics, video_ids: list, end_dt) -> list:
    """최근 30일 이내 업로드 영상별 트래픽 소스 비율 수집 (영상당 API 쿼리 1회)"""
    rows = []
    end_date   = end_dt.strftime('%Y-%m-%d')
    start_date = (end_dt - timedelta(days=30)).strftime('%Y-%m-%d')
    fetched_at = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M:%S')

    print(f"  📅 [VideoTraffic] 기간: {start_date} ~ {end_date} / 대상 영상: {len(video_ids)}개")
    for vid in video_ids:
        try:
            req = analytics.reports().query(
                ids='channel==mine',
                startDate=start_date,
                endDate=end_date,
                metrics='views',
                dimensions='insightTrafficSourceType',
                filters=f'video=={vid}',
                sort='-views'
            )
            resp = execute_query_with_retry(req, f"VideoTraffic:{vid}")
            if not resp or not resp.get('rows'):
                continue
            api_rows = resp['rows']
            total = sum(float(r[1]) for r in api_rows)
            if total == 0:
                continue
            for r in api_rows:
                rows.append({
                    'video_id':       vid,
                    'traffic_source': r[0],
                    'views':          int(float(r[1])),
                    'ratio':          round(float(r[1]) / total, 4),
                    'fetched_at':     fetched_at,
                })
            print(f"  ✅ VideoTraffic:{vid} — {len(api_rows)}개 소스")
        except Exception as e:
            print(f"  [VideoTraffic Skip] {vid}: {e}")
    return rows


def fetch_countries(analytics, end_dt):
    start_date = (end_dt - relativedelta(days=365)).strftime('%Y-%m-%d')
    end_date = end_dt.strftime('%Y-%m-%d')
    print(f"  📅 [Analytics] Country Date Guard: {start_date} ~ {end_date}")
    
    req = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='views',
        dimensions='country',
        sort='-views'
    )
    resp = execute_query_with_retry(req, "Country")
    rows = resp.get('rows', []) if resp else []
    
    if not rows:
        print("  [Analytics] Country rows: 0 (privacy threshold)")
        return [{'metric_type': 'country', 'dim_1': 'unknown', 'dim_2': '', 'value': 0}]
    
    print(f"  [Analytics] Country rows: {len(rows)}")
    
    # Top 20 + other aggregation
    top_20 = rows[:20]
    others = rows[20:]
    
    result_rows = []
    for r in top_20:
        result_rows.append({'metric_type': 'country', 'dim_1': r[0], 'dim_2': '', 'value': r[1]})
        
    if others:
        other_sum = sum(r[1] for r in others)
        result_rows.append({'metric_type': 'country', 'dim_1': 'other', 'dim_2': '', 'value': other_sum})
        
    return result_rows

def fetch_devices(analytics, end_dt):
    start_date = (end_dt - relativedelta(days=365)).strftime('%Y-%m-%d')
    end_date = end_dt.strftime('%Y-%m-%d')
    print(f"  📅 [Analytics] Device Date Guard: {start_date} ~ {end_date}")
    
    req = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='views',
        dimensions='deviceType',
        sort='-views'
    )
    resp = execute_query_with_retry(req, "DeviceType")
    rows = resp.get('rows', []) if resp else []
    
    if not rows:
        print("  [Analytics] Device rows: 0 (privacy threshold)")
        return [{'metric_type': 'device', 'dim_1': 'unknown device', 'dim_2': '', 'value': 0}]
    
    print(f"  [Analytics] Device rows: {len(rows)}")
    return [{'metric_type': 'device', 'dim_1': r[0].lower(), 'dim_2': '', 'value': r[1]} for r in rows]

def fetch_video_ctr_map(analytics, end_dt):
    # [v16.1 ALERT] Reach metrics (Impressions/CTR) are currently restricted in YT Analytics API v2
    # for individual channels (channel==mine). Skipping to avoid quota waste and 400 errors.
    # print("  📅 [Analytics] Video CTR Batch Query SKIPPED (API Access Restriction)")
    return {}

# ================================================================
# [Final Layer Sync v2] _RawData_Master → SS_음원마스터_최종
# Apps Script syncMasterV10() 100% 동일 구현
#   - video_id 기준 매칭 + 신규 행 APPEND
#   - 보호 컬럼 (곡명, 상품ID, 음원파일, 영상파일) 절대 쓰기 금지
#   - 셀 단위 batch_update (clear/setValues 금지)
#   - 계산: retention / diffDays / dailyWatch / valueScore — Apps Script 동일
#   - 등급: retentionGrade (0.45/0.3) / assetGrade (5/2) — Apps Script 동일
#   - 포맷: formatDuration(runtime_sec) → "2:09" / "1:02:33"
#   - URL 생성: https://www.youtube.com/watch?v={video_id}
#   - 정렬: 게시일 기준 내림차순 (Apps Script sort와 동일)
#   - C1 타임스탬프: data_fetched_at | 상태: SUCCESS/FAIL
# ================================================================

def _format_duration(total_sec):
    """Apps Script formatDuration() 완전 동일: 2:09 / 1:02:33"""
    try:
        total_sec = int(float(total_sec))
    except (TypeError, ValueError):
        return "0:00"
    if total_sec <= 0:
        return "0:00"
    h = total_sec // 3600
    m = (total_sec % 3600) // 60
    s = total_sec % 60
    if h > 0:
        return f"{h}:{m:02}:{s:02}"
    return f"{m}:{s:02}"


def sync_final_layer(ss, master_rows):
    """
    _RawData_Master(source) → SS_음원마스터_최종(final) 단방향 동기화.
    Apps Script syncMasterV10() 결과와 100% 동일하게 동작한다.
    """
    FINAL_SHEET = 'SS_음원마스터_최종'

    # ── 보호 컬럼 (절대 쓰기 금지 — Apps Script MANUAL_PROTECTED 동일) ───────────
    PROTECTED = {'곡명', '상품ID', '음원파일', '영상파일'}

    # ── Raw 컬럼 → Final 헤더 별칭 매핑 ─────────────────────────────────────────
    # Apps Script updates{} 객체의 모든 항목 포함
    SYNC_ALIASES = {
        # 지표 (직접 복사)
        'views':                ['views', '조회수'],
        'likes':                ['likes', '좋아요'],
        'comments':             ['comments', '댓글'],
        'shares':               ['shares', '공유수'],
        'subscribers_gained':   ['subscribers_gained', '구독자유입', '구독자증가'],
        'total_watch_time_min': ['total_watch_time_min', '총시청시간(분)', '시청시간(분)'],
        'avg_watch_time_sec':   ['avg_watch_time_sec', '평균시청시간(초)'],
        'runtime_sec':          ['runtime_sec', '러닝타임(초)'],
        'impressions':          ['impressions', '노출수'],
        'ctr':                  ['ctr', 'CTR', '클릭률', 'CTR(%)'],
        'upload_date':          ['upload_date', '게시일', '업로드일'],
        # 메타 (직접 복사)
        'youtube_title':        ['youtube_title', '유튜브_제목'],
        '썸네일URL':            ['썸네일URL', '썸네일url'],
    }

    # ── 계산·조합 컬럼 → Final 헤더 별칭 매핑 ───────────────────────────────────
    DERIVED_ALIASES = {
        # 기존 파생 지표
        '좋아요율':           ['좋아요율'],
        '일평균시청시간(분)': ['일평균시청시간(분)', '일평균시청시간'],
        '시청유지밀도':       ['시청유지밀도'],
        '시간보정유지가치':   ['시간보정유지가치'],
        # Apps Script 추가 항목
        '업로드경과일수':     ['업로드경과일수'],
        '시청유지등급':       ['시청유지등급'],
        '자산등급':           ['자산등급'],
        # 포맷·조합 컬럼
        '러닝타임':           ['러닝타임'],
        '유튜브URL':          ['유튜브URL'],
    }

    print(f"\n🔗 [FinalLayerSync v2] '{FINAL_SHEET}' 동기화 시작 (Apps Script 동일 모드)...")

    try:
        ws_final = ss.worksheet(FINAL_SHEET)
    except gspread.exceptions.WorksheetNotFound:
        print(f"  ⚠️  '{FINAL_SHEET}' 시트 없음 — 스킵")
        return 0

    # ── Step 1: Final 시트 전체 읽기 ────────────────────────────────────────────
    all_values = ws_final.get_all_values()
    if not all_values:
        print(f"  ⚠️  '{FINAL_SHEET}' 비어있음 — 스킵")
        return 0

    # ── Step 2: 헤더 행 자동 감지 ───────────────────────────────────────────────
    header_row_idx = None
    for i, row in enumerate(all_values[:3]):
        if any(str(c).strip().lower() in ('video_id', 'videoid', '영상id') for c in row):
            header_row_idx = i
            break

    if header_row_idx is None:
        raise Exception(
            f"CRITICAL: video_id column not found in '{FINAL_SHEET}' "
            f"(탐색 범위 1~3행 — 헤더 이동 또는 셀 병합 확인)"
        )

    headers    = [h.strip() for h in all_values[header_row_idx]]
    data_start = header_row_idx + 1  # 0-indexed 데이터 첫 행

    vid_col_idx = next(
        (i for i, h in enumerate(headers) if h.lower() in ('video_id', 'videoid', '영상id')),
        None
    )
    if vid_col_idx is None:
        raise Exception(
            f"CRITICAL: video_id column not found in '{FINAL_SHEET}' headers "
            f"(헤더 행 {header_row_idx + 1}행 발견됐으나 video_id 컬럼 없음)"
        )

    print(f"  🔑 video_id 컬럼: {vid_col_idx + 1}번 열 "
          f"({gspread.utils.rowcol_to_a1(1, vid_col_idx + 1)[:-1]}열)")

    # ── Step 3: 헤더 ↔ 컬럼 인덱스 맵 구축 ─────────────────────────────────────
    header_col_map = {h: (idx + 1) for idx, h in enumerate(headers)}

    # raw → final 1-indexed 매핑 (보호 컬럼 이중 차단)
    raw_to_col = {}
    for raw_col, aliases in SYNC_ALIASES.items():
        for alias in aliases:
            if alias in header_col_map and alias not in PROTECTED:
                raw_to_col[raw_col] = header_col_map[alias]
                break

    # 파생 → final 1-indexed 매핑
    derived_col = {}
    for name, aliases in DERIVED_ALIASES.items():
        for alias in aliases:
            if alias in header_col_map and alias not in PROTECTED:
                derived_col[name] = header_col_map[alias]
                break

    print(f"  📋 헤더 위치: {header_row_idx + 1}행 | 데이터 시작: {data_start + 1}행")
    print(f"  🔗 동기화 컬럼: {len(raw_to_col)}개 raw + {len(derived_col)}개 파생·조합")

    # UNMAPPED 로그
    unmapped = [k for k in {**SYNC_ALIASES, **DERIVED_ALIASES} if k not in {**raw_to_col, **derived_col}]
    if unmapped:
        print(f"  ⚠️  Unmapped columns: {unmapped}")

    # ── Risk 3: 파생 지표 수식 기반 여부 감지 ────────────────────────────────────
    formula_based_derived = set()
    if len(all_values) > data_start:
        first_data_row = all_values[data_start]
        for name, col_1idx in derived_col.items():
            col_0idx = col_1idx - 1
            if col_0idx < len(first_data_row):
                cell_val = str(first_data_row[col_0idx]).strip()
                if cell_val.startswith('='):
                    formula_based_derived.add(name)
                    print(f"  ⚠️  [수식감지] '{name}' 수식 기반 → 코드 쓰기 스킵")

    # ── _RawData_Master lookup ───────────────────────────────────────────────────
    master_lookup = {
        str(r.get('video_id', '')).strip(): r
        for r in master_rows
        if str(r.get('video_id', '')).strip()
    }

    # ── 공통 계산 함수 (Apps Script 완전 동일) ───────────────────────────────────
    def compute_metrics(raw):
        """Apps Script syncMasterV10() 계산 블록과 동일한 로직"""
        views         = int(float(raw.get('views', 0) or 0))
        likes         = int(float(raw.get('likes', 0) or 0))
        total_watch   = float(raw.get('total_watch_time_min', 0) or 0)
        avg_watch_sec = float(raw.get('avg_watch_time_sec', 0) or 0)
        runtime_sec   = float(raw.get('runtime_sec', 0) or 0)
        upload_date   = raw.get('upload_date', '')

        # diffDays = Math.max(1, Math.floor((today - uDate) / ms_per_day))
        days_since = 1
        if upload_date:
            try:
                upload_dt  = datetime.strptime(str(upload_date)[:10], '%Y-%m-%d')
                days_since = max(1, (datetime.today() - upload_dt).days)
            except Exception:
                pass

        # retention = avgSec / runtimeSec
        retention = (avg_watch_sec / runtime_sec) if runtime_sec > 0 else 0

        # dailyWatch = watchMin / diffDays
        daily_watch = total_watch / days_since

        # valueScore = retention * dailyWatch
        value_score = retention * daily_watch
        if not (value_score == value_score):  # isFinite 체크
            value_score = 0

        # 좋아요율
        like_rate = (likes / views) if views > 0 else 0

        # 등급 계산 — Apps Script ASSET_GRADE {HIGH:5, MID:2}
        retention_grade = '높음' if retention >= 0.45 else ('중간' if retention >= 0.3 else '낮음')
        asset_grade     = '높음' if value_score >= 5   else ('중간' if value_score >= 2 else '낮음')

        return {
            'views':            views,
            'likes':            likes,
            'total_watch':      total_watch,
            'avg_watch_sec':    avg_watch_sec,
            'runtime_sec':      runtime_sec,
            'upload_date':      upload_date,
            'days_since':       days_since,
            'retention':        retention,
            'daily_watch':      daily_watch,
            'value_score':      value_score,
            'like_rate':        like_rate,
            'retention_grade':  retention_grade,
            'asset_grade':      asset_grade,
        }

    # ── Step 4: UPDATE — 기존 행 순회 ───────────────────────────────────────────
    cell_updates   = []
    matched        = 0
    skipped        = 0
    final_ids_seen = set()

    for row_0idx, row in enumerate(all_values[data_start:], start=data_start):
        sheet_row = row_0idx + 1

        if len(row) <= vid_col_idx:
            continue
        vid = str(row[vid_col_idx]).strip()
        if not vid:
            continue

        final_ids_seen.add(vid)
        raw = master_lookup.get(vid)
        if not raw:
            skipped += 1
            continue

        matched += 1
        m = compute_metrics(raw)

        def _upd(col_1idx, val):
            cell_updates.append({
                'range':  gspread.utils.rowcol_to_a1(sheet_row, col_1idx),
                'values': [[val]],
            })

        # Raw 컬럼 직접 복사
        for raw_col, final_col in raw_to_col.items():
            _upd(final_col, raw.get(raw_col, ''))

        # 파생·조합 컬럼 (수식 기반 제외)
        def _d(name, val):
            if name in derived_col and name not in formula_based_derived:
                _upd(derived_col[name], val)

        _d('좋아요율',           round(m['like_rate'], 4))
        _d('일평균시청시간(분)', round(m['daily_watch'], 3))
        _d('시청유지밀도',       m['retention'])
        _d('시간보정유지가치',   m['value_score'])
        _d('업로드경과일수',     m['days_since'])
        _d('시청유지등급',       m['retention_grade'])
        _d('자산등급',           m['asset_grade'])
        _d('러닝타임',           _format_duration(m['runtime_sec']))
        _d('유튜브URL',          f"https://www.youtube.com/watch?v={vid}")

    print(f"  ✅ 매칭: {matched}개 | 스킵: {skipped}개 (Final 전용 행)")

    if not cell_updates:
        print(f"  ℹ️  업데이트할 셀 없음 (video_id 매칭 0건)")
        return 0

    # ── Step 5: C1 타임스탬프 ───────────────────────────────────────────────────
    latest_fetched_at = ''
    for r in master_rows:
        t = str(r.get('data_fetched_at', '') or '')
        if t and (not latest_fetched_at or t > latest_fetched_at):
            latest_fetched_at = t

    sync_ran_at = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M') + ' KST'
    c1_value    = f'데이터수집: {latest_fetched_at or "미확인"} | 동기화: {sync_ran_at} | 상태: SUCCESS'
    cell_updates.insert(0, {'range': 'C1', 'values': [[c1_value]]})
    print(f"  ⏱  C1: {c1_value}")

    # ── Step 6: batch_update ─────────────────────────────────────────────────────
    ws_final.batch_update(cell_updates, value_input_option='USER_ENTERED')
    print(f"  📤 UPDATE 완료 — {matched}개 영상 / {len(cell_updates)}셀 갱신")

    # ── Step 7: APPEND — Raw에 있고 Final에 없는 신규 영상 ──────────────────────
    missing_ids = [v for v in master_lookup if v not in final_ids_seen]
    appended = 0

    for vid in sorted(missing_ids):
        raw     = master_lookup[vid]
        m       = compute_metrics(raw)
        new_row = [''] * len(headers)

        # video_id
        new_row[vid_col_idx] = vid

        # Raw 직접 복사
        for raw_col, final_col in raw_to_col.items():
            new_row[final_col - 1] = raw.get(raw_col, '')

        # 파생·조합 (수식 기반 제외)
        def _a(name, val):
            if name in derived_col and name not in formula_based_derived:
                new_row[derived_col[name] - 1] = val

        _a('좋아요율',           round(m['like_rate'], 4))
        _a('일평균시청시간(분)', round(m['daily_watch'], 3))
        _a('시청유지밀도',       m['retention'])
        _a('시간보정유지가치',   m['value_score'])
        _a('업로드경과일수',     m['days_since'])
        _a('시청유지등급',       m['retention_grade'])
        _a('자산등급',           m['asset_grade'])
        _a('러닝타임',           _format_duration(m['runtime_sec']))
        _a('유튜브URL',          f"https://www.youtube.com/watch?v={vid}")

        ws_final.append_row(new_row, value_input_option='USER_ENTERED')
        print(f"  ➕ [APPEND] {vid} | {raw.get('track_name', vid)} | 업로드: {m['upload_date']}")
        appended += 1

    if appended:
        print(f"  ✅ {appended}개 신규 행 추가 완료")
    else:
        print(f"  ℹ️  신규 추가 영상 없음")

    # ── Step 8: 정렬 — 게시일 기준 내림차순 (Apps Script sort 동일) ──────────────
    date_col = header_col_map.get('게시일')
    if date_col:
        final_row_count = ws_final.row_count
        # 실제 데이터 마지막 행 재계산 (APPEND 후 갱신)
        actual_last = ws_final.get_all_values()
        data_rows   = [r for r in actual_last[data_start:] if any(c.strip() for c in r)]
        sort_count  = len(data_rows)
        if sort_count > 1:
            sort_range = ws_final.range(
                data_start + 1, 1,
                data_start + sort_count, len(headers)
            )
            # gspread sort: column 1-indexed, ascending=False
            ws_final.sort(
                (date_col, 'des'),
                range=f"{gspread.utils.rowcol_to_a1(data_start + 1, 1)}:"
                      f"{gspread.utils.rowcol_to_a1(data_start + sort_count, len(headers))}"
            )
            print(f"  📊 정렬 완료 — 게시일 내림차순 ({sort_count}행)")

    return matched + appended


def main():
    print("🚀 API-First 셔틀 v10.0 가동 시작...")
    
    # 1. API 인증
    youtube, analytics = get_authenticated_service()
    print("✅ YouTube API 연결 성공")
    ensure_expected_analytics_owner(youtube)

    # 2-0. [v14.1] 채널 개요 통계 수집 (Channel KPI 용)
    print("📊 채널 KPI 수집 중...")
    channel_stats_resp = youtube.channels().list(part='statistics,snippet', id=CHANNEL_ID).execute()
    ch_stats = channel_stats_resp['items'][0]['statistics']
    channel_subscribers = int(ch_stats.get('subscriberCount', 0))
    channel_total_views = int(ch_stats.get('viewCount', 0))
    channel_video_count = int(ch_stats.get('videoCount', 0))
    print(f"  ✅ 구독자: {channel_subscribers:,} | 영상 수: {channel_video_count}")

    # 2. 영상 목록 수집 (Data API)
    print("📡 영상 목록 수집 중...", end='', flush=True)
    request = youtube.channels().list(part='contentDetails', id=CHANNEL_ID)
    uploads_id = request.execute()['items'][0]['contentDetails']['relatedPlaylists']['uploads']
    
    videos = []
    next_token = None
    while True:
        pl_req = youtube.playlistItems().list(
            part='contentDetails', playlistId=uploads_id, maxResults=50, pageToken=next_token
        )
        pl_resp = pl_req.execute()
        videos.extend([item['contentDetails']['videoId'] for item in pl_resp['items']])
        next_token = pl_resp.get('nextPageToken')
        if not next_token: break
    print(f" -> {len(videos)}개 영상 발견")

    # 3. 상세 데이터 + 심화 통계 병합 (Hybrid API Queries)
    print("📊 상세 데이터 분석 중...")
    master_rows = []

    # [v16.1] CTR/Impression 실시간 매핑 데이터 사전 확보
    try:
        # Reach 데이터는 최소 3일 지연 필요
        end_dt_ctr = datetime.today() - timedelta(days=3)
        video_ctr_lookup = fetch_video_ctr_map(analytics, end_dt_ctr)
    except Exception as e:
        print(f"⚠️ CTR 맵 구축 실패: {e}")
        video_ctr_lookup = {}
    
    # 50개씩 배치 처리 (Data API 제한)
    for i in range(0, len(videos), 50):
        batch = videos[i:i+50]
        v_resp = youtube.videos().list(part='snippet,statistics,contentDetails', id=','.join(batch)).execute()
        
        for item in v_resp['items']:
            vid = item['id']
            stats = item['statistics']
            snippet = item['snippet']
            content = item['contentDetails']
            published_at = snippet['publishedAt']
            
            # [v10.0] Analytics API 호출 (심화 데이터)
            # 주의: Analytics는 하루 할당량이 적으므로, 배치 처리 불가능 시 영상별 호출 최소화 필요
            # 여기서는 편의상 최신 영상 10개만 실시간 쿼리하고 나머지는 0 처리하거나 캐싱 고려 가능
            # (사용자 요청에 따라 전체 전송 시도하되 예외 처리)
            
            analytics_data = {}
            try:
                # [v14.0 Date Guard] endDate = 어제 (월경계 시 -2일)
                end_dt_vid = datetime.today() - timedelta(days=1)
                if datetime.today().day <= 2:
                    end_dt_vid = datetime.today() - timedelta(days=2)
                
                start_date_obj = max(
                    datetime.strptime(published_at[:10], '%Y-%m-%d'),
                    end_dt_vid - timedelta(days=365)
                )
                if start_date_obj >= end_dt_vid:
                    start_date_obj = end_dt_vid - timedelta(days=30)
                
                end_date = end_dt_vid.strftime('%Y-%m-%d')
                start_date = start_date_obj.strftime('%Y-%m-%d')
                
                rep_req = analytics.reports().query(
                    ids='channel==mine',
                    startDate=start_date,
                    endDate=end_date,
                    metrics='averageViewDuration,subscribersGained,estimatedMinutesWatched,shares',
                    dimensions='video',
                    filters=f'video=={vid}'
                )
                rep = execute_query_with_retry(rep_req, f"VideoDetail:{vid}")
                
                if rep and 'rows' in rep and rep['rows']:
                    # [v10.3] 컬럼 헤더 기반 고속 매핑 (Dict Lookup)
                    headers = [h['name'] for h in rep.get('columnHeaders', [])]
                    hmap = {name: i for i, name in enumerate(headers)}
                    row = rep['rows'][0]

                    analytics_data = {
                        'avg_sec': row[hmap['averageViewDuration']] if 'averageViewDuration' in hmap else 0,
                        'subs': row[hmap['subscribersGained']] if 'subscribersGained' in hmap else 0,
                        'watch_min': row[hmap['estimatedMinutesWatched']] if 'estimatedMinutesWatched' in hmap else 0,
                        'shares': row[hmap['shares']] if 'shares' in hmap else 0
                    }
            except Exception as e:
                print(f"[Analytics Skip] {vid}: {e}")

            # [v16.1] CTR 매핑 (사건 구축된 맵 활용)
            ctr_metrics = video_ctr_lookup.get(vid, {'impressions': 0, 'ctr': 0})


            # 러닝타임 파싱 (PT1M30S -> sec)
            duration = isodate.parse_duration(content['duration']).total_seconds()
            
            # [v10.0] 제목 정규화 (최소한의 공백 제거)
            clean_title = snippet['title'].strip()

            # [v15.3] 썸네일 URL 추출 로직 (Fallback 포함)
            thumbs = snippet.get('thumbnails', {})
            thumbnail_url = (
                thumbs.get('maxres', {}).get('url') or
                thumbs.get('high', {}).get('url') or
                thumbs.get('medium', {}).get('url') or
                thumbs.get('default', {}).get('url') or
                ''
            )
            if not thumbnail_url:
                print(f"  ⚠ 썸네일 누락: {vid}")

            master_rows.append({
                'product_id': "", # [v12.8] 상품ID는 절대 자동 생성 금지 (Manual Shield 적용)
                'video_id': vid,
                'track_name': clean_title,
                'views': int(stats.get('viewCount', 0)),
                'likes': int(stats.get('likeCount', 0)),
                'comments': int(stats.get('commentCount', 0)),
                'upload_date': published_at[:10],
                'runtime_sec': duration,
                'avg_watch_time_sec': analytics_data.get('avg_sec', 0),
                'total_watch_time_min': analytics_data.get('watch_min', 0),
                'subscribers_gained': analytics_data.get('subs', 0),
                'shares': analytics_data.get('shares', 0),
                'impressions': ctr_metrics['impressions'],
                'ctr': ctr_metrics['ctr'],
                'youtube_title': snippet['title'],
                'data_fetched_at': (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M:%S'),
                '썸네일URL': thumbnail_url
            })
            print(f".", end='', flush=True)

    print(f"\n✅ 기본 데이터 가공 완료 ({len(master_rows)}행)")
    
    # ---------------------------------------------------------
    # [v10.1] 심화 데이터 (Demographics & Traffic) 추가
    # ---------------------------------------------------------
    print("🧬 심화 데이터(인구통계/유입경로) 수집 중...")
    
    # Analytics Client 수동 초기화
    full_period_rows = []
    
    # [v14.0 Date Guard] 심화 데이터 공용 날짜 계산 (월경계 방어 포함)
    end_dt = datetime.today() - timedelta(days=1)
    if datetime.today().day <= 2:
        print("[INFO] Month boundary detected — forcing endDate to -2 days")
        end_dt = datetime.today() - timedelta(days=2)
    
    start_dt = end_dt - relativedelta(months=3)
    if start_dt >= end_dt:
        start_dt = end_dt - timedelta(days=30)
    
    end_date = end_dt.strftime('%Y-%m-%d')
    start_date_90 = start_dt.strftime('%Y-%m-%d')
    print(f"📅 Analytics Date Guard: {start_date_90} ~ {end_date}")

    # 1. 인구통계 (성별/나이)
    try:
        demo_rows = fetch_demographics(analytics, end_dt)
        full_period_rows.extend(demo_rows)
    except Exception as e:
        print(f"⚠️ 인구통계 수집 중 예상치 못한 오류: {e}")

    # 2. 유입경로 (Traffic Source - General)
    try:
        traffic_rows = fetch_traffic_sources(analytics, end_dt)
        full_period_rows.extend(traffic_rows)
            
        # 2-1. YouTube 검색어 상세 수집 (YT_SEARCH Detail)
        try:
            search_req = analytics.reports().query(
                ids='channel==mine', startDate=start_date_90, endDate=end_date,
                metrics='views', 
                dimensions='insightTrafficSourceDetail',
                filters='insightTrafficSourceType==YT_SEARCH', sort='-views', maxResults=15
            )
            search_resp = execute_query_with_retry(search_req, "KeywordDetail")
            for row in (search_resp.get('rows', []) if search_resp else []):
                full_period_rows.append({'metric_type': 'KEYWORD', 'dim_1': row[0], 'dim_2': 'search', 'value': row[1]})
        except Exception as e:
            print(f"⚠️ 검색어 상세 수집 건너뜀: {e}")

        # 2-2. 외부 유입 상세 수집 (EXTERNAL Detail)
        # [v10.1 NOTE] EXT_URL + insightTrafficSourceDetail 조합은 YT Analytics API v2에서
        # 지원되지 않아 항상 400 에러 반환 → 쿼리 건너뜀
        try:
            ext_detail_resp = None  # EXT_URL 조합 미지원 — 스킵
            print("  [SKIP] EXT_URL + insightTrafficSourceDetail 조합 미지원 (API 400)")
            ext_detail_resp = None
            
            # Python 레벨에서 도메인 필터링 및 정렬 (Post-processing)
            raw_ext_rows = ext_detail_resp.get('rows', []) if ext_detail_resp else []
            processed_ext = []
            
            for row in raw_ext_rows:
                source = str(row[0]) if row[0] else ""
                views = int(row[1]) if len(row) > 1 else 0
                
                # 도메인 형태(.)를 포함한 항목만 유의미한 외부 유입으로 간주 (Studio 방식 재현)
                if "." in source:
                    processed_ext.append({
                        'metric_type': 'EXTERNAL_DETAIL',
                        'dim_1': source,
                        'dim_2': 'external',
                        'value': views
                    })
            
            # 조회수 기준 내림차순 정렬 후 상위 15개만 최종 반영
            processed_ext.sort(key=lambda x: x['value'], reverse=True)
            full_period_rows.extend(processed_ext[:15])

        except Exception as e:
            print(f"⚠️ 외부 유입 상세 수집 건너뜀: {e}")

    except Exception as e:
        print(f"⚠️ 유입경로 수집 중 오류: {e}")

    # 3. 국가 (Country)
    try:
        country_rows = fetch_countries(analytics, end_dt)
        full_period_rows.extend(country_rows)
    except Exception as e:
        print(f"⚠️ 국가 수집 중 오류: {e}")

    # 4. 기기 데이터 수집 (Device)
    try:
        device_rows = fetch_devices(analytics, end_dt)
        full_period_rows.extend(device_rows)
    except Exception as e:
        print(f"⚠️ 기기 구성 수집 중 오류: {e}")

    # 4. [v13.2] EXTERNAL_DETAIL 전략 데이터 수집 (Type별 필터 루프 - API 공식 스펙 준수)
    # insightTrafficSourceDetail은 반드시 insightTrafficSourceType 필터와 함께 사용해야 함
    # YT_SEARCH는 이미 블록 2-1에서 KEYWORD로 수집하므로 제외
    # [v10.2 NOTE] PLAYLIST, NOTIFICATION은 insightTrafficSourceDetail 조합 미지원 → 400 에러
    DETAIL_SOURCE_TYPES = ['RELATED_VIDEO', 'SUBSCRIBER', 'YT_CHANNEL']
    
    for src_type in DETAIL_SOURCE_TYPES:
        try:
            detail_req = analytics.reports().query(
                ids='channel==mine',
                startDate=start_date_90,
                endDate=end_date,
                metrics='views',
                dimensions='insightTrafficSourceDetail',
                filters=f'insightTrafficSourceType=={src_type}',
                sort='-views',
                maxResults=25
            )
            detail_resp = execute_query_with_retry(detail_req, f"Detail_{src_type}")
            detail_rows = detail_resp.get('rows', []) if detail_resp else []
            if not detail_rows:
                print(f"  [WARN] No rows returned for {src_type} | {start_date_90} ~ {end_date}")
            for row in detail_rows:
                detail_value = str(row[0]) if row[0] else ""
                views_val    = int(row[1]) if len(row) > 1 else 0
                if detail_value:
                    full_period_rows.append({
                        'metric_type': 'EXTERNAL_DETAIL',
                        'dim_1':  detail_value,
                        'dim_2':  src_type,
                        'value':  views_val
                    })
            if detail_rows:
                print(f"  ✅ {src_type}: {len(detail_rows)}건 수집")
        except Exception as e:
            print(f"  ⚠️ {src_type} 상세 수집 건너뜀: {e}")
    
    print(f"📊 EXTERNAL_DETAIL 수집 루프 완료")

    # 4. 구글 시트 전송 (gspread 500 일시적 오류 재시도 포함)
    scopes_sheet = ['https://www.googleapis.com/auth/spreadsheets']
    creds_sheet = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes_sheet)
    gc = gspread.authorize(creds_sheet)

    ss = None
    for _attempt in range(4):
        try:
            ss = gc.open_by_key(SPREADSHEET_ID)
            break
        except Exception as _e:
            if _attempt < 3:
                wait = 2 ** _attempt  # 1, 2, 4초
                print(f"  ⚠️ [Sheets] open_by_key 실패 (시도 {_attempt+1}/4), {wait}초 후 재시도: {_e}")
                time.sleep(wait)
            else:
                raise
    if ss is None:
        raise RuntimeError("Google Sheets 연결 4회 실패 — 종료")
    
    # [v10.3] 컬럼 순서 및 기본값 정의 (Type Safety & Schema Enforcement)
    COLUMN_DEFAULTS = {
        'product_id': '',
        'track_name': '',
        'album_name': '',        # API 미제공 (기본값 처리)
        'video_id': '',
        'views': 0,
        'likes': 0,
        'comments': 0,
        'shares': 0,
        'upload_date': '',
        'runtime_sec': 0,
        'avg_watch_time_sec': 0,
        'total_watch_time_min': 0,
        'subscribers_gained': 0,
        'impressions': 0,
        'ctr': 0,
        'youtube_title': '',
        'data_fetched_at': ''
    }
    
    MASTER_COLUMNS = list(COLUMN_DEFAULTS.keys())

    # Update _RawData_Master
    df_master = pd.DataFrame(master_rows)

    # [v15.3] 옵션 A (권장): 헤더 기반 write 로직으로 변경 (기존 시트 헤더 존중)
    try:
        ws_master = ss.worksheet('_RawData_Master')
        existing_headers = ws_master.row_values(1)
        if not existing_headers:
            existing_headers = list(COLUMN_DEFAULTS.keys()) + ['썸네일URL']
    except gspread.exceptions.WorksheetNotFound:
        ws_master = ss.add_worksheet('_RawData_Master', 1000, 30)
        existing_headers = list(COLUMN_DEFAULTS.keys()) + ['썸네일URL']

    # [v15.4] impressions / ctr 보존: overwrite 전 기존 시트 값 읽기
    # fetch_video_ctr_map() 은 API 제한으로 항상 {} 반환 → master_rows 의
    # impressions/ctr 가 항상 0 으로 채워진다.
    # clear() + update() 전에 기존 시트 값을 읽어 df_master 에 직접 복원한다.
    #
    # [v15.5 Write Guard] get_all_records() 실패 시 clear() 자체를 건너뜀.
    # 읽기 실패 상태에서 clear() 하면 기존 데이터 전체 손실 → 데이터 보호 우선.
    _REACH_COLS = ('impressions', 'ctr')
    existing_reach_map = {}  # {video_id: {'impressions': val, 'ctr': val}}
    _reach_load_ok = True
    try:
        existing_rows = ws_master.get_all_records()
        for row in existing_rows:
            vid = str(row.get('video_id', '')).strip()
            if vid:
                existing_reach_map[vid] = {
                    'impressions': row.get('impressions', 0),
                    'ctr':         row.get('ctr', 0),
                }
        print(f"  [Master] 기존 reach 값 로드: {len(existing_reach_map)}개 video_id")
    except Exception as _e:
        print(f"  CRITICAL [Master] reach 값 로드 실패 — write guard 발동, clear() 건너뜀: {_e}")
        _reach_load_ok = False

    if not _reach_load_ok:
        # 기존 데이터 보호: 읽기 실패 상태에서 전체 재기록 금지
        print("  [Master] write guard: _RawData_Master 업데이트 중단 (기존 데이터 보존)")
    else:
        # impressions / ctr: df_master 에 이미 0 으로 존재하므로 컬럼 부재 체크 없이 직접 복원
        if existing_reach_map:
            for col in _REACH_COLS:
                df_master[col] = df_master['video_id'].apply(
                    lambda vid, c=col: existing_reach_map.get(str(vid).strip(), {}).get(c, 0)
                )
            print(f"  [Master] impressions/ctr 기존 시트 값으로 복원 ({len(existing_reach_map)}개)")

        # 1) 기본값 적용 (impressions / ctr 는 위에서 이미 처리됨)
        for col, default in COLUMN_DEFAULTS.items():
            if col not in df_master.columns:
                df_master[col] = default

        # 2) 시트의 기존 헤더 중 df_master에 없는 컬럼이 있다면 빈 값으로 추가하여 구조 보존
        for col in existing_headers:
            if col not in df_master.columns:
                df_master[col] = ""

        # 3) df_master에만 존재하는 새 컬럼이 있다면 existing_headers에 추가
        for col in df_master.columns:
            if col not in existing_headers:
                existing_headers.append(col)

        # 4) 실제 기록될 데이터프레임을 시트 헤더 순서와 정확하게 정렬
        df_master = df_master.reindex(columns=existing_headers).fillna("")

        print(f"[Master] 시트 Write 직전 데이터 행 수: {len(df_master)}행")
        _replace_sheet_values_without_clear(
            ws_master,
            [df_master.columns.tolist()] + df_master.values.tolist(),
            value_input_option='USER_ENTERED'
        )
        print(f"[Master] 업데이트 완료 (총 {len(df_master)}행)")
    
    # Update _RawData_FullPeriod (Append-Only 구조)
    if full_period_rows:
        # [v13.0] run_id / 날짜 메타 컬럼을 각 행에 추가 (추적 가능성 확보)
        import uuid
        _now_kst = datetime.now(timezone.utc) + timedelta(hours=9)
        run_id = _now_kst.strftime('%Y%m%d_%H%M%S') + '_' + str(uuid.uuid4())[:8]
        fetched_at = _now_kst.strftime('%Y-%m-%d %H:%M:%S')
        
        for r in full_period_rows:
            r['run_id']     = run_id
            r['start_date'] = start_date_90
            r['end_date']   = end_date
            r['fetched_at'] = fetched_at
        
        # [v13.0] 명시적 컬럼 순서 - 요청 스키마 확정 (fetched_at 맨 끝)
        FULL_PERIOD_COLUMNS = [
            'run_id', 'start_date', 'end_date',
            'metric_type', 'dim_1', 'dim_2', 'value',
            'fetched_at'
        ]
        
        df_full = pd.DataFrame(full_period_rows).reindex(columns=FULL_PERIOD_COLUMNS).fillna('')
        
        try:
            ws_full = ss.worksheet('_RawData_FullPeriod')
        except gspread.exceptions.WorksheetNotFound:
            ws_full = ss.add_worksheet('_RawData_FullPeriod', 5000, len(FULL_PERIOD_COLUMNS))
        
        # [v13.0] clear() 제거 → Append-Only: 헤더가 없는 경우(빈 시트)만 헤더 1회 기록
        existing_rows = ws_full.get_all_values()
        if not existing_rows:
            ws_full.append_row(FULL_PERIOD_COLUMNS)
        
        # 데이터 행만 Append (헤더 제외)
        ws_full.append_rows(df_full.values.tolist(), value_input_option='USER_ENTERED')
        print(f"📤 [FullPeriod] Append 완료 (run_id: {run_id[:15]}..., +{len(df_full)}행 추가)")

        # [v16.3] 90일 Rolling Purge — 3000행 초과 시 오래된 행 삭제
        _purge_full_period(ws_full, FULL_PERIOD_COLUMNS, keep_days=90, threshold=3000)

    # ================================================================
    # [v14.3] Channel_KPI 채널 KPI 시트 전송 (실제 API Revenue + 환율 자동 연동)
    # 콜럼: date | subscribers | views_30d | avg_views | watch_time_min |
    #        subscriber_change | algorithm_score | estimated_revenue_usd | estimated_revenue_krw
    # ================================================================
    print("\n📊 [Channel_KPI] 채널 KPI 데이터 수집 및 전송 중...")
    try:
        # 30일 조회수 + 시청시간 + 실제 Revenue (Analytics API)
        views_30d = 0
        watch_time_min = 0
        estimated_revenue_usd = 0.0
        avg_view_duration = 0

        end_dt_kpi = datetime.today() - timedelta(days=1)
        if datetime.today().day <= 2:
            print("  [INFO] Month boundary detected — forcing endDate to -2 days")
            end_dt_kpi = datetime.today() - timedelta(days=2)
        start_dt_kpi = end_dt_kpi - timedelta(days=30)

        # Step 1: views + watchTime + averageViewDuration
        try:
            kpi_resp = analytics.reports().query(
                ids='channel==mine',
                startDate=start_dt_kpi.strftime('%Y-%m-%d'),
                endDate=end_dt_kpi.strftime('%Y-%m-%d'),
                metrics='views,estimatedMinutesWatched,averageViewDuration'
            ).execute()
            if kpi_resp.get('rows'):
                kpi_row = kpi_resp['rows'][0]
                kpi_headers = [h['name'] for h in kpi_resp.get('columnHeaders', [])]
                kpi_hmap = {name: i for i, name in enumerate(kpi_headers)}
                views_30d = int(kpi_row[kpi_hmap['views']]) if 'views' in kpi_hmap else 0
                watch_time_min = int(kpi_row[kpi_hmap['estimatedMinutesWatched']]) if 'estimatedMinutesWatched' in kpi_hmap else 0
                avg_view_duration = int(kpi_row[kpi_hmap['averageViewDuration']]) if 'averageViewDuration' in kpi_hmap else 0
        except Exception as e:
            print(f"  ⚠️ Analytics 기본 KPI 수집 스킵: {e}")

        # Step 2: estimatedRevenue (실제 수익 — monetary 스코프 필요)
        revenue_source = 'RPM_FALLBACK'
        try:
            rev_resp = analytics.reports().query(
                ids='channel==mine',
                startDate=start_dt_kpi.strftime('%Y-%m-%d'),
                endDate=end_dt_kpi.strftime('%Y-%m-%d'),
                metrics='estimatedRevenue'
            ).execute()
            if rev_resp.get('rows'):
                estimated_revenue_usd = round(float(rev_resp['rows'][0][0]), 2)
                revenue_source = 'API'
                print(f"  💰 실제 Revenue API 수집 성공: ${estimated_revenue_usd}")
        except Exception as e:
            # monetary 권한 없으면 RPM 예측으로 폴백
            CHANNEL_RPM = 1.5
            estimated_revenue_usd = round(views_30d * CHANNEL_RPM / 1000, 2)
            print(f"  ⚠️ Revenue API 실패 → RPM ${CHANNEL_RPM} 폴백 적용: ${estimated_revenue_usd} ({e})")

        # Step 3: 환율 자동 조회 (USD → KRW)
        usdkrw_rate = get_usdkrw_rate()
        estimated_revenue_krw = round(estimated_revenue_usd * usdkrw_rate)

        # Step 4: 파생 KPI 계산
        avg_views = round(views_30d / 30) if views_30d > 0 else 0
        subscriber_change = sum(int(r.get('subscribers_gained', 0)) for r in master_rows)

        # 알고리즘 점수 (조회수 밀도 + 좋아요율 기반)
        total_likes = sum(int(r.get('likes', 0)) for r in master_rows)
        total_views_master = sum(int(r.get('views', 0)) for r in master_rows)
        like_ratio = (total_likes / total_views_master * 100) if total_views_master > 0 else 0
        algorithm_score = min(100, round(avg_views / 100 + like_ratio * 5))

        # RPM 자동 계산 (수익 효율 분석용)
        rpm = round(estimated_revenue_usd / views_30d * 1000, 2) if views_30d > 0 else 0

        # KPI 행 작성 (요청 스키마 v14.3)
        KPI_COLUMNS = [
            'date', 'subscribers', 'views_30d', 'avg_views',
            'watch_time_min', 'subscriber_change',
            'algorithm_score', 'estimated_revenue_usd', 'estimated_revenue_krw'
        ]

        kpi_data = {
            'date': (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d'),
            'subscribers': channel_subscribers,
            'views_30d': views_30d,
            'avg_views': avg_views,
            'watch_time_min': watch_time_min,
            'subscriber_change': subscriber_change,
            'algorithm_score': algorithm_score,
            'estimated_revenue_usd': estimated_revenue_usd,
            'estimated_revenue_krw': estimated_revenue_krw
        }

        # 시트 전송 (Append-Only + 헤더 보정)
        try:
            ws_kpi = ss.worksheet('Channel_KPI')
        except gspread.exceptions.WorksheetNotFound:
            ws_kpi = ss.add_worksheet('Channel_KPI', 1000, len(KPI_COLUMNS))

        existing_kpi = ws_kpi.get_all_values()
        if not existing_kpi or existing_kpi[0] != KPI_COLUMNS:
            ws_kpi.clear()
            ws_kpi.append_row(KPI_COLUMNS)

        ws_kpi.append_row([kpi_data[c] for c in KPI_COLUMNS], value_input_option='USER_ENTERED')
        print(f"  ✅ Channel_KPI Append 완료 [{revenue_source}]")
        print(f"     구독자: {channel_subscribers:,} | 30일조회: {views_30d:,} | RPM: ${rpm}")
        print(f"     수익: ${estimated_revenue_usd} / ₩{estimated_revenue_krw:,} | 알고리즘: {algorithm_score}점")
    except Exception as e:
        print(f"  ⚠️ Channel_KPI 전송 실패 (전체 실행 영향 없음): {e}")

    # ================================================================
    # [Active Uploads] 48시간 이내 업로드 영상 → _Active_Uploads 시트 기록
    # generate_active_uploads.py가 이 시트를 읽어 active_uploads.json 생성
    # ================================================================
    try:
        _now_kst_dt = datetime.now(timezone.utc) + timedelta(hours=9)
        _cutoff = (_now_kst_dt - timedelta(hours=48)).strftime('%Y-%m-%d')
        _active = [
            r for r in master_rows
            if r.get('upload_date', '') >= _cutoff
        ]
        if _active:
            print(f"\n⚡ [Active Uploads] 48시간 이내 영상 {len(_active)}개 감지")
            _AU_COLS = ['video_id', 'title', 'upload_date', 'views', 'likes', 'impressions', 'ctr', 'fetched_at']
            _fetched_at = _now_kst_dt.strftime('%Y-%m-%dT%H:%M:%S+09:00')
            _au_rows = [_AU_COLS] + [
                [
                    r['video_id'],
                    r.get('youtube_title', r.get('track_name', '')),
                    r['upload_date'],
                    r.get('views', 0),
                    r.get('likes', 0),
                    r.get('impressions', 0),
                    r.get('ctr', 0),
                    _fetched_at,
                ]
                for r in _active
            ]
            try:
                _ws_au = ss.worksheet('_Active_Uploads')
            except gspread.exceptions.WorksheetNotFound:
                _ws_au = ss.add_worksheet('_Active_Uploads', 5000, len(_AU_COLS))
                _ws_au.append_row(_AU_COLS, value_input_option='USER_ENTERED')
            # append-only: 헤더 없으면 추가, 데이터는 항상 append
            _existing_header = _ws_au.row_values(1)
            if _existing_header != _AU_COLS:
                _ws_au.clear()
                _ws_au.append_row(_AU_COLS, value_input_option='USER_ENTERED')
            _ws_au.append_rows(_au_rows[1:], value_input_option='USER_ENTERED')
            print(f"  ✅ _Active_Uploads 갱신 완료 ({len(_active)}행)")
        else:
            print(f"\n⚡ [Active Uploads] 48시간 이내 신규 업로드 없음 — 스킵")
    except Exception as e:
        print(f"  ⚠️ _Active_Uploads 갱신 실패 (전체 실행 영향 없음): {e}")

    # ================================================================
    # [VideoTraffic] 최근 30일 이내 영상별 트래픽 소스 비율 수집 → _VideoTraffic 시트
    # ================================================================
    print("\n📊 [VideoTraffic] 영상별 트래픽 소스 수집 중...")
    try:
        _now_kst_vt  = datetime.now(timezone.utc) + timedelta(hours=9)
        _cutoff_30d  = (_now_kst_vt - timedelta(days=30)).strftime('%Y-%m-%d')
        _recent_vids = [
            r['video_id'] for r in master_rows
            if r.get('upload_date', '') >= _cutoff_30d and r.get('video_id', '')
        ]
        if _recent_vids:
            vt_rows = fetch_video_traffic_sources_batch(analytics, _recent_vids, end_dt)
            if vt_rows:
                VT_COLS = ['video_id', 'traffic_source', 'views', 'ratio', 'fetched_at']
                try:
                    ws_vt = ss.worksheet('_VideoTraffic')
                except gspread.exceptions.WorksheetNotFound:
                    ws_vt = ss.add_worksheet('_VideoTraffic', 5000, len(VT_COLS))
                ws_vt.clear()
                ws_vt.update([VT_COLS] + [
                    [r['video_id'], r['traffic_source'], r['views'], r['ratio'], r['fetched_at']]
                    for r in vt_rows
                ])
                print(f"  ✅ _VideoTraffic 갱신 완료 ({len(vt_rows)}행, {len(_recent_vids)}개 영상)")
            else:
                print(f"  ℹ️  VideoTraffic 데이터 없음 (API 응답 0행)")
        else:
            print(f"  ℹ️  최근 30일 이내 업로드 영상 없음 — 스킵")
    except Exception as e:
        print(f"  ⚠️ _VideoTraffic 갱신 실패 (전체 실행 영향 없음): {e}")

    # ================================================================
    # [Analytics Aggregation] 4개의 기간별 집계 시트 생성 (대시보드 KPI 용)
    # ================================================================
    print("\n📊 [Analytics Aggregation] 기간별 집계 데이터(7d, 30d, prev30, all) 생성 및 갱신 중...")
    
    aggr_dates = [
        ('Analytics_7d', end_dt_kpi - timedelta(days=7), end_dt_kpi),
        ('Analytics_30d', end_dt_kpi - timedelta(days=30), end_dt_kpi),
        ('Analytics_prev30', end_dt_kpi - timedelta(days=60), end_dt_kpi - timedelta(days=30)),
        ('Analytics_all', datetime.strptime('2020-01-01', '%Y-%m-%d'), end_dt_kpi)
    ]
    
    master_vids = {row['video_id']: row['youtube_title'] for row in master_rows}
    AGGR_COLS = ['type', 'key', 'views', 'likes', 'watch_time_min', 'avg_duration_sec', 'subscriber_change', 'ratio', 'rank', 'title']
    
    for sheet_name, s_dt, e_dt in aggr_dates:
        try:
            str_s_dt = s_dt.strftime('%Y-%m-%d')
            str_e_dt = e_dt.strftime('%Y-%m-%d')
            agg_rows = []
            
            # SUMMARY Rows
            sum_resp = analytics.reports().query(
                ids='channel==mine',
                startDate=str_s_dt, endDate=str_e_dt,
                metrics='views,likes,estimatedMinutesWatched,averageViewDuration,subscribersGained'
            ).execute()
            
            sum_row = {'type': 'SUMMARY', 'key': 'total', 'views': 0, 'likes': 0, 'watch_time_min': 0, 'avg_duration_sec': 0, 'subscriber_change': 0, 'ratio': '', 'rank': '', 'title': 'SUMMARY'}
            if sum_resp.get('rows'):
                hmap = {h['name']: i for i, h in enumerate(sum_resp.get('columnHeaders', []))}
                r = sum_resp['rows'][0]
                sum_row['views'] = int(r[hmap['views']]) if 'views' in hmap else 0
                sum_row['likes'] = int(r[hmap['likes']]) if 'likes' in hmap else 0
                sum_row['watch_time_min'] = int(r[hmap['estimatedMinutesWatched']]) if 'estimatedMinutesWatched' in hmap else 0
                sum_row['avg_duration_sec'] = int(r[hmap['averageViewDuration']]) if 'averageViewDuration' in hmap else 0
                sum_row['subscriber_change'] = int(r[hmap['subscribersGained']]) if 'subscribersGained' in hmap else 0
            elif master_rows:
                raise RuntimeError(
                    f"[Analytics Aggregation] {sheet_name} SUMMARY 응답이 비었습니다. "
                    "master_rows는 존재하므로 잘못된 OAuth 계정/권한/Analytics 응답 이상 가능성이 큽니다."
                )

            if master_rows and not summary_has_meaningful_data(sum_row):
                raise RuntimeError(
                    f"[Analytics Aggregation] {sheet_name} SUMMARY가 전부 0입니다. "
                    "실데이터가 있는 채널에서 0 덮어쓰기를 방지하기 위해 중단합니다."
                )
            agg_rows.append(sum_row)
            
            # VIDEO Rows (Top 10 sorted by views)
            vid_resp = analytics.reports().query(
                ids='channel==mine',
                startDate=str_s_dt, endDate=str_e_dt,
                dimensions='video',
                metrics='views,likes,estimatedMinutesWatched,averageViewDuration,subscribersGained',
                sort='-views', maxResults=10
            ).execute()
            
            if vid_resp.get('rows'):
                hmap = {h['name']: i for i, h in enumerate(vid_resp.get('columnHeaders', []))}
                for rank, r in enumerate(vid_resp['rows'], start=1):
                    vid = r[hmap['video']]
                    v_row = {'type': 'VIDEO', 'key': vid, 'ratio': '', 'rank': rank}
                    v_row['views'] = int(r[hmap['views']]) if 'views' in hmap else 0
                    v_row['likes'] = int(r[hmap['likes']]) if 'likes' in hmap else 0
                    v_row['watch_time_min'] = int(r[hmap['estimatedMinutesWatched']]) if 'estimatedMinutesWatched' in hmap else 0
                    v_row['avg_duration_sec'] = int(r[hmap['averageViewDuration']]) if 'averageViewDuration' in hmap else 0
                    v_row['subscriber_change'] = int(r[hmap['subscribersGained']]) if 'subscribersGained' in hmap else 0
                    v_row['title'] = master_vids.get(vid, vid)
                    
                    if sum_row.get('views', 0) > 0:
                        v_row['ratio'] = round(v_row['views'] / sum_row['views'], 4)
                    else:
                        v_row['ratio'] = 0
                        
                    agg_rows.append(v_row)
            
            # Write to specific Analytics sheet
            df_agg = pd.DataFrame(agg_rows).reindex(columns=AGGR_COLS).fillna('')
            try:
                ws_agg = ss.worksheet(sheet_name)
            except gspread.exceptions.WorksheetNotFound:
                ws_agg = ss.add_worksheet(sheet_name, 100, len(AGGR_COLS))
                
            ws_agg.clear()
            ws_agg.update([df_agg.columns.tolist()] + df_agg.values.tolist())
            print(f"  ✅ {sheet_name} 갱신 완료 ({len(df_agg)}행)")
        except Exception as e:
            print(f"  ⚠️ {sheet_name} 갱신 실패: {e}")

    # ================================================================
    # [Final Layer Sync] _RawData_Master → SS_음원마스터_최종
    # DATA_RULES v11.4: 보호 컬럼 제외, 셀 단위 갱신, 파생 지표 계산
    # 비치명적 — 실패 시 전체 실행 영향 없음
    # ================================================================
    try:
        sync_final_layer(ss, master_rows)
    except Exception as _fls_err:
        print(f"\n  ⚠️  [FinalLayerSync] 실패 (비치명적, 전체 실행 영향 없음): {_fls_err}")
        # C1에 FAIL 상태 기록 (시트 접근 가능한 경우)
        try:
            _now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M') + ' KST'
            _ws_fail = ss.worksheet('SS_음원마스터_최종')
            _sync_kst = (_now_kst)
            _ws_fail.update('C1', [[f'동기화: {_sync_kst} | 상태: FAIL | {str(_fls_err)[:80]}']])
            print(f"  ⏱  C1 FAIL 상태 기록 완료")
        except Exception:
            pass  # C1 기록 실패는 무시

    print(f"\n🔗 https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}")
    print("\n🎉 [최종 성공] SOUNDSTORM 자동수집 시스템이 모든 작업을 성공적으로 마쳤습니다!")
if __name__ == '__main__':
    main()
