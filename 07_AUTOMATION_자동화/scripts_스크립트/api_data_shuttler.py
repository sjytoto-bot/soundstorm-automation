import os
import time
import pickle
import json
import urllib.request
import pandas as pd
import isodate # [v10.2] 성능 최적화 (루프 밖으로 이동)
from datetime import datetime, timedelta
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

def get_authenticated_service():
    creds = None
    if os.path.exists(TOKEN_PICKLE):
        with open(TOKEN_PICKLE, 'rb') as token:
            creds = pickle.load(token)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if IS_CI:
                raise Exception("❌ [CI] token.pickle이 만료되었고 interactive 로그인 불가. 로컬에서 토큰 갱신 후 재업로드 필요.")
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
    # Reach metrics (Impressions/CTR) REQUIRE insightTrafficSourceType dimension in Analytics API
    start_date = (end_dt - timedelta(days=28)).strftime('%Y-%m-%d')
    end_date = end_dt.strftime('%Y-%m-%d')
    print(f"  📅 [Analytics] Video CTR Batch Query (28d window, 3d lag): {start_date} ~ {end_date}")
    
    # First attempt: Try both Impressions and CTR
    req = analytics.reports().query(
        ids='channel==mine',
        startDate=start_date,
        endDate=end_date,
        metrics='videoThumbnailImpressions,videoThumbnailImpressionsClickRate',
        dimensions='video,insightTrafficSourceType'
    )
    resp = execute_query_with_retry(req, "VideoCTRBatch_Full")
    
    # Second attempt: If full query fails, try only Impressions (due to known API bugs with ClickRate)
    if not resp:
        print("  [Analytics] Full CTR query failed. Retrying with impressions only...")
        req_imp = analytics.reports().query(
            ids='channel==mine',
            startDate=start_date,
            endDate=end_date,
            metrics='videoThumbnailImpressions',
            dimensions='video,insightTrafficSourceType'
        )
        resp = execute_query_with_retry(req_imp, "VideoImpressionsOnly")
        has_ctr_metric = False
    else:
        has_ctr_metric = True

    ctr_map = {} # { video_id: { 'impressions': sum, 'clicks': sum } }
    
    if resp and 'rows' in resp:
        headers = [h['name'] for h in resp.get('columnHeaders', [])]
        hmap = {name: i for i, name in enumerate(headers)}
        for r in resp['rows']:
            vid = r[hmap['video']]
            imp = int(r[hmap['videoThumbnailImpressions']])
            
            if vid not in ctr_map:
                ctr_map[vid] = {'impressions': 0, 'clicks': 0.0}
            
            ctr_map[vid]['impressions'] += imp
            
            if has_ctr_metric and 'videoThumbnailImpressionsClickRate' in hmap:
                rate = float(r[hmap['videoThumbnailImpressionsClickRate']])
                ctr_map[vid]['clicks'] += (imp * (rate / 100.0))
    
    # Finalize CTR calculation
    final_map = {}
    for vid, stats in ctr_map.items():
        avg_rate = 0.0
        if stats['impressions'] > 0 and has_ctr_metric:
            avg_rate = round((stats['clicks'] / stats['impressions']) * 100, 2)
        
        final_map[vid] = {
            'impressions': stats['impressions'],
            'ctr': avg_rate
        }
    
    print(f"  ✅ Video CTR Map Calculated: {len(final_map)} videos processed (CTR Metric: {has_ctr_metric})")
    return final_map

def main():
    print("🚀 API-First 셔틀 v10.0 가동 시작...")
    
    # 1. API 인증
    youtube, analytics = get_authenticated_service()
    print("✅ YouTube API 연결 성공")

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
                'data_fetched_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
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
        try:
            # [v12.7] insightTrafficSourceDetail은 반드시 Type(EXT_URL 등)을 필터로 지정해야 함
            ext_detail_req = analytics.reports().query(
                ids='channel==mine',
                startDate=start_date_90,
                endDate=end_date,
                metrics='views',
                dimensions='insightTrafficSourceDetail',
                filters='insightTrafficSourceType==EXT_URL'
            )
            ext_detail_resp = execute_query_with_retry(ext_detail_req, "ExtUrlDetail")
            
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
    DETAIL_SOURCE_TYPES = ['RELATED_VIDEO', 'PLAYLIST', 'SUBSCRIBER', 'NOTIFICATION', 'YT_CHANNEL']
    
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

    # 4. 구글 시트 전송
    scopes_sheet = ['https://www.googleapis.com/auth/spreadsheets']
    creds_sheet = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes_sheet)
    gc = gspread.authorize(creds_sheet)
    ss = gc.open_by_key(SPREADSHEET_ID)
    
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

    # 1) 기본값 적용
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
    
    ws_master.clear() # 전체 값 안전 초기화 후 정렬된 df 통째로 덮어쓰기
    
    print(f"📌 [Master] 시트 Write 직전 데이터 행 수: {len(df_master)}행")
    ws_master.update([df_master.columns.tolist()] + df_master.values.tolist())
    print(f"📤 [Master] 실제 업데이트 완료 로그 출력 (총 {len(df_master)}행)")
    
    # Update _RawData_FullPeriod (Append-Only 구조)
    if full_period_rows:
        # [v13.0] run_id / 날짜 메타 컬럼을 각 행에 추가 (추적 가능성 확보)
        import uuid
        run_id = datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + str(uuid.uuid4())[:8]
        fetched_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
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
            'date': datetime.today().strftime('%Y-%m-%d'),
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

    print(f"\n🔗 https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}")
    print("\n🎉 [최종 성공] SOUNDSTORM 자동수집 시스템이 모든 작업을 성공적으로 마쳤습니다!")
if __name__ == '__main__':
    main()
