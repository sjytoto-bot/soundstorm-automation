"""
test_final_layer_sync.py  v2
SS_음원마스터_최종 동기화 단독 테스트 — Apps Script syncMasterV10() 100% 동일
"""

import os, sys, gspread
from datetime import datetime
from google.oauth2.service_account import Credentials
from gspread.utils import rowcol_to_a1

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
CREDS_PATH     = os.path.join(BASE_DIR, "..", "credentials", "service_account.json")
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
SCOPES         = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
]

# ── 인증 ─────────────────────────────────────────────────────────────────────
print("🔐 서비스 계정 인증 중...")
creds = Credentials.from_service_account_file(CREDS_PATH, scopes=SCOPES)
gc    = gspread.authorize(creds)
ss    = gc.open_by_key(SPREADSHEET_ID)
print(f"✅ 스프레드시트 연결: {ss.title}")

# ── 탭 목록 확인 ──────────────────────────────────────────────────────────────
worksheets  = ss.worksheets()
FIRST_TAB   = worksheets[0].title
print(f"\n🎯 첫번째 탭: '{FIRST_TAB}'")

# ── _RawData_Master 읽기 ──────────────────────────────────────────────────────
print("\n📥 _RawData_Master 읽는 중...")
ws_raw      = ss.worksheet("_RawData_Master")
raw_values  = ws_raw.get_all_records(numericise_ignore=['all'])
print(f"  ✅ {len(raw_values)}행 로드")

# ── 설정 ─────────────────────────────────────────────────────────────────────
PROTECTED = {'곡명', '상품ID', '음원파일', '영상파일'}

SYNC_ALIASES = {
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
    'youtube_title':        ['youtube_title', '유튜브_제목'],
    '썸네일URL':            ['썸네일URL', '썸네일url'],
}

DERIVED_ALIASES = {
    '좋아요율':           ['좋아요율'],
    '일평균시청시간(분)': ['일평균시청시간(분)', '일평균시청시간'],
    '시청유지밀도':       ['시청유지밀도'],
    '시간보정유지가치':   ['시간보정유지가치'],
    '업로드경과일수':     ['업로드경과일수'],
    '시청유지등급':       ['시청유지등급'],
    '자산등급':           ['자산등급'],
    '러닝타임':           ['러닝타임'],
    '유튜브URL':          ['유튜브URL'],
}

def format_duration(total_sec):
    """Apps Script formatDuration() 완전 동일"""
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

def compute_metrics(raw):
    """Apps Script syncMasterV10() 계산 블록 완전 동일"""
    views         = int(float(raw.get('views', 0) or 0))
    likes         = int(float(raw.get('likes', 0) or 0))
    total_watch   = float(raw.get('total_watch_time_min', 0) or 0)
    avg_watch_sec = float(raw.get('avg_watch_time_sec', 0) or 0)
    runtime_sec   = float(raw.get('runtime_sec', 0) or 0)
    upload_date   = raw.get('upload_date', '')

    days_since = 1
    if upload_date:
        try:
            days_since = max(1, (datetime.today() - datetime.strptime(str(upload_date)[:10], '%Y-%m-%d')).days)
        except Exception:
            pass

    retention   = (avg_watch_sec / runtime_sec) if runtime_sec > 0 else 0
    daily_watch = total_watch / days_since
    value_score = retention * daily_watch
    if value_score != value_score:
        value_score = 0
    like_rate       = (likes / views) if views > 0 else 0
    retention_grade = '높음' if retention >= 0.45 else ('중간' if retention >= 0.3 else '낮음')
    asset_grade     = '높음' if value_score >= 5   else ('중간' if value_score >= 2   else '낮음')

    return {
        'views': views, 'likes': likes, 'total_watch': total_watch,
        'avg_watch_sec': avg_watch_sec, 'runtime_sec': runtime_sec,
        'upload_date': upload_date, 'days_since': days_since,
        'retention': retention, 'daily_watch': daily_watch,
        'value_score': value_score, 'like_rate': like_rate,
        'retention_grade': retention_grade, 'asset_grade': asset_grade,
    }

# ── Final 시트 읽기 ───────────────────────────────────────────────────────────
print(f"\n🔗 [FinalLayerSync v2] '{FIRST_TAB}' 동기화 시작...")
ws_final   = ss.worksheet(FIRST_TAB)
all_values = ws_final.get_all_values()

# 헤더 감지
header_row_idx = next(
    (i for i, row in enumerate(all_values[:5])
     if any(str(c).strip().lower() in ('video_id', 'videoid', '영상id') for c in row)),
    None
)
if header_row_idx is None:
    print("❌ CRITICAL: video_id 헤더 없음")
    sys.exit(1)

headers    = [h.strip() for h in all_values[header_row_idx]]
data_start = header_row_idx + 1
vid_col_idx = next(
    (i for i, h in enumerate(headers) if h.lower() in ('video_id', 'videoid', '영상id')), None
)
if vid_col_idx is None:
    print("❌ CRITICAL: video_id 컬럼 없음")
    sys.exit(1)

print(f"  🔑 video_id 컬럼: {vid_col_idx+1}번 열 ({rowcol_to_a1(1, vid_col_idx+1)[:-1]}열)")
print(f"  📋 헤더 {header_row_idx+1}행 | 데이터 {data_start+1}행~")

header_col_map = {h: (i+1) for i, h in enumerate(headers)}

raw_to_col  = {}
for raw_col, aliases in SYNC_ALIASES.items():
    for alias in aliases:
        if alias in header_col_map and alias not in PROTECTED:
            raw_to_col[raw_col] = header_col_map[alias]
            break

derived_col = {}
for name, aliases in DERIVED_ALIASES.items():
    for alias in aliases:
        if alias in header_col_map and alias not in PROTECTED:
            derived_col[name] = header_col_map[alias]
            break

unmapped = [k for k in {**SYNC_ALIASES, **DERIVED_ALIASES} if k not in {**raw_to_col, **derived_col}]
if unmapped:
    print(f"  ⚠️  Unmapped: {unmapped}")
else:
    print(f"  ✅ 전체 컬럼 매핑 완료")
print(f"  🔗 {len(raw_to_col)}개 raw + {len(derived_col)}개 파생·조합")

# 수식 감지
formula_based_derived = set()
if len(all_values) > data_start:
    first_row = all_values[data_start]
    for name, col_1idx in derived_col.items():
        val = str(first_row[col_1idx-1]).strip() if col_1idx-1 < len(first_row) else ''
        if val.startswith('='):
            formula_based_derived.add(name)
            print(f"  ⚠️  [수식] '{name}' 수식 기반 → 스킵")

master_lookup = {str(r.get('video_id','')).strip(): r for r in raw_values if str(r.get('video_id','')).strip()}
print(f"\n  📦 master lookup: {len(master_lookup)}개")

# ── UPDATE ───────────────────────────────────────────────────────────────────
cell_updates   = []
matched = skipped = 0
final_ids_seen = set()

for row_0idx, row in enumerate(all_values[data_start:], start=data_start):
    sheet_row = row_0idx + 1
    if len(row) <= vid_col_idx: continue
    vid = str(row[vid_col_idx]).strip()
    if not vid: continue
    final_ids_seen.add(vid)
    raw = master_lookup.get(vid)
    if not raw:
        skipped += 1
        continue
    matched += 1
    m = compute_metrics(raw)

    def _u(col, val):
        cell_updates.append({'range': rowcol_to_a1(sheet_row, col), 'values': [[val]]})

    for raw_col, final_col in raw_to_col.items():
        _u(final_col, raw.get(raw_col, ''))

    def _d(name, val):
        if name in derived_col and name not in formula_based_derived:
            _u(derived_col[name], val)

    _d('좋아요율',           round(m['like_rate'], 4))
    _d('일평균시청시간(분)', round(m['daily_watch'], 3))
    _d('시청유지밀도',       m['retention'])
    _d('시간보정유지가치',   m['value_score'])
    _d('업로드경과일수',     m['days_since'])
    _d('시청유지등급',       m['retention_grade'])
    _d('자산등급',           m['asset_grade'])
    _d('러닝타임',           format_duration(m['runtime_sec']))
    _d('유튜브URL',          f"https://www.youtube.com/watch?v={vid}")

print(f"\n  ✅ 매칭: {matched}개 | 스킵: {skipped}개")

# C1
from datetime import timezone, timedelta
latest_fetched_at = max((str(r.get('data_fetched_at','') or '') for r in raw_values), default='')
sync_ran_at = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M') + ' KST'
c1_value    = f'데이터수집: {latest_fetched_at or "미확인"} | 동기화: {sync_ran_at} | 상태: SUCCESS'
cell_updates.insert(0, {'range': 'C1', 'values': [[c1_value]]})
print(f"  ⏱  C1: {c1_value}")

print(f"\n  📤 batch_update ({len(cell_updates)}셀)...")
ws_final.batch_update(cell_updates, value_input_option='USER_ENTERED')
print(f"  ✅ UPDATE 완료 — {matched}개 / {len(cell_updates)}셀")

# ── APPEND ───────────────────────────────────────────────────────────────────
missing_ids = [v for v in master_lookup if v not in final_ids_seen]
appended = 0

for vid in sorted(missing_ids):
    raw     = master_lookup[vid]
    m       = compute_metrics(raw)
    new_row = [''] * len(headers)
    new_row[vid_col_idx] = vid

    for raw_col, final_col in raw_to_col.items():
        new_row[final_col - 1] = raw.get(raw_col, '')

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
    _a('러닝타임',           format_duration(m['runtime_sec']))
    _a('유튜브URL',          f"https://www.youtube.com/watch?v={vid}")

    ws_final.append_row(new_row, value_input_option='USER_ENTERED')
    print(f"  ➕ [APPEND] {vid} | {raw.get('track_name', vid)} | {m['upload_date']}")
    appended += 1

if appended:
    print(f"  ✅ {appended}개 신규 행 추가")
else:
    print(f"  ℹ️  신규 추가 없음")

# ── 정렬: 게시일 내림차순 (Apps Script sort 동일) ────────────────────────────
date_col = header_col_map.get('게시일')
if date_col:
    refreshed   = ws_final.get_all_values()
    data_rows   = [r for r in refreshed[data_start:] if any(c.strip() for c in r)]
    sort_count  = len(data_rows)
    if sort_count > 1:
        sort_start = rowcol_to_a1(data_start + 1, 1)
        sort_end   = rowcol_to_a1(data_start + sort_count, len(headers))
        ws_final.sort((date_col, 'des'), range=f"{sort_start}:{sort_end}")
        print(f"  📊 정렬 완료 — 게시일 내림차순 ({sort_count}행)")

print(f"\n🎉 전체 완료 — UPDATE {matched}개 + APPEND {appended}개")

# ── diff 검증: Python vs Apps Script 예상값 비교 ─────────────────────────────
print("\n📐 [Diff 검증] ZgCeY-blMhs 샘플 계산값:")
sample = master_lookup.get('ZgCeY-blMhs')
if sample:
    m = compute_metrics(sample)
    print(f"  runtime_sec    = {sample.get('runtime_sec')} → 러닝타임: {format_duration(float(sample.get('runtime_sec', 0)))}")
    print(f"  유튜브URL      = https://www.youtube.com/watch?v=ZgCeY-blMhs")
    print(f"  업로드경과일수 = {m['days_since']}일")
    print(f"  시청유지밀도   = {m['retention']}")
    print(f"  일평균시청시간 = {round(m['daily_watch'], 3)}")
    print(f"  시간보정유지가치 = {m['value_score']}")
    print(f"  시청유지등급   = {m['retention_grade']}")
    print(f"  자산등급       = {m['asset_grade']}")
    print(f"  좋아요율       = {round(m['like_rate'], 4)}")
