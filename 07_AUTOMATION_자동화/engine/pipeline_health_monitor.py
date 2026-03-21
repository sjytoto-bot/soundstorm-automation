#!/usr/bin/env python3
"""
pipeline_health_monitor.py
SOUNDSTORM 데이터 파이프라인 전수 건강 검진 + 자동 복구 엔진 v1.0

기능:
  1) 구글시트 전 탭 자동 전수조사 (행 수, 데이터 신선도, 컬럼 무결성, 수치 정상 여부)
  2) ❌ FAIL / ⚠️ WARN / ✅ OK 판정
  3) --fix 플래그: FAIL 탭 자동 복구 스크립트 실행
  4) _Pipeline_Health 탭에 검진 결과 기록
  5) SLACK_WEBHOOK_URL 환경변수 설정 시 Slack 알림

실행:
  python3 engine/pipeline_health_monitor.py           # 검진만
  python3 engine/pipeline_health_monitor.py --fix     # 검진 + 자동 복구
"""

import os
import sys
import json
import time
import pickle
import base64
import subprocess
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

# ──────────────────────────────────────────────────────────────────────────────
# 경로 설정
# ──────────────────────────────────────────────────────────────────────────────
ENGINE_DIR   = Path(__file__).parent.resolve()          # …/07_AUTOMATION_자동화/engine
AUTOMATION_DIR = ENGINE_DIR.parent                      # …/07_AUTOMATION_자동화
SCRIPTS_DIR  = AUTOMATION_DIR / 'scripts_스크립트'
ANALYTICS_DIR = AUTOMATION_DIR / 'analytics'

IS_CI = os.environ.get('CI') == 'true' or os.environ.get('GITHUB_ACTIONS') == 'true'

if IS_CI:
    _ci_dir = Path('/tmp/soundstorm_creds')
    _ci_dir.mkdir(exist_ok=True)
    for env_key, filename in [
        ('SERVICE_ACCOUNT_B64', 'service_account.json'),
    ]:
        b64_val = os.environ.get(env_key, '')
        if b64_val:
            (_ci_dir / filename).write_bytes(base64.b64decode(b64_val))
    CREDENTIALS_PATH = str(_ci_dir / 'service_account.json')
else:
    CREDENTIALS_PATH = str(AUTOMATION_DIR / 'credentials' / 'service_account.json')

SPREADSHEET_ID   = os.environ.get('GOOGLE_SHEETS_ID', '12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y')
SCOPES_SHEET     = ['https://www.googleapis.com/auth/spreadsheets']
HEALTH_TAB_NAME  = '_Pipeline_Health'

# ──────────────────────────────────────────────────────────────────────────────
# 탭별 건강 검진 규칙 정의
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class TabRule:
    name: str
    min_rows: int = 1                           # 최소 데이터 행 수 (헤더 제외)
    max_age_hours: Optional[float] = None      # 최대 허용 데이터 나이 (시간)
    timestamp_cols: list = field(default_factory=list)  # 신선도 확인용 타임스탬프 컬럼 후보
    required_cols: list = field(default_factory=list)   # 필수 존재 컬럼
    numeric_nonzero: list = field(default_factory=list) # 최소 1개 이상 0이 아니어야 할 컬럼
    fix_script: Optional[str] = None           # 복구 스크립트 경로 (AUTOMATION_DIR 기준)
    fix_note: Optional[str] = None             # 자동 복구 불가 시 안내 메시지

TAB_RULES: list[TabRule] = [
    TabRule(
        name='_RawData_Master',
        min_rows=50,
        max_age_hours=26,
        timestamp_cols=['data_fetched_at'],      # 실제 컬럼명 확인됨
        required_cols=['video_id', 'views'],
        numeric_nonzero=['views'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='_RawData_FullPeriod',
        min_rows=50,
        max_age_hours=72,
        timestamp_cols=[],                       # 타임스탬프 컬럼 없음 — 행 수만 검사
        required_cols=['metric_type', 'value'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='Channel_KPI',
        min_rows=1,
        max_age_hours=26,
        timestamp_cols=['date'],                 # 실제 컬럼명 확인됨
        required_cols=['subscribers'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='Analytics_Periods',
        min_rows=40,
        max_age_hours=26,
        timestamp_cols=[],                       # period 필터링으로 대체
        required_cols=['period', 'type', 'views'],
        numeric_nonzero=['views'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='_Analytics_Snapshot',
        min_rows=5,
        max_age_hours=48,
        timestamp_cols=['snapshot_date'],        # 실제 컬럼명 확인됨
        required_cols=['metric_type'],
        fix_script='engine/analytics_snapshot_engine.py',
    ),
    TabRule(
        name='Thumbnail_Analysis',
        min_rows=10,
        required_cols=['video_id'],
        fix_note='YouTube Studio CSV 수동 다운로드 후 sync_studio_csv.sh 실행 필요',
    ),
    TabRule(
        name='Channel_CTR_KPI',
        min_rows=1,
        required_cols=['metric', 'value'],       # 실제 컬럼 구조: metric | value | ...
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='Thumbnail_Style_Performance',      # 실제 탭명 (점 없음)
        min_rows=1,
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='Video_Diagnostics',
        min_rows=10,
        required_cols=['video_id'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
    TabRule(
        name='Reference_Videos',
        min_rows=5,
        required_cols=['video_id'],
        fix_script='scripts_스크립트/api_data_shuttler.py',
    ),
]

# ──────────────────────────────────────────────────────────────────────────────
# 결과 데이터 구조
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class TabHealth:
    name: str
    status: str          # 'OK' | 'WARN' | 'FAIL' | 'MISSING'
    row_count: int = 0
    last_update: str = ''
    issues: list = field(default_factory=list)
    fix_script: Optional[str] = None
    fix_note: Optional[str] = None

# ──────────────────────────────────────────────────────────────────────────────
# 타임스탬프 파싱 유틸리티
# ──────────────────────────────────────────────────────────────────────────────
_TS_FMTS = [
    '%Y-%m-%d %H:%M:%S KST',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%dT%H:%M:%S',
    '%Y-%m-%dT%H:%M:%SZ',
    '%Y-%m-%d',
]
# 각 format의 예시 결과 길이 (슬라이싱용)
_TS_LENS = [23, 19, 19, 20, 10]

def _parse_ts(val: str) -> Optional[datetime]:
    if not val:
        return None
    val = val.strip()
    for fmt, length in zip(_TS_FMTS, _TS_LENS):
        try:
            return datetime.strptime(val[:length], fmt)
        except (ValueError, TypeError):
            continue
    return None


def _latest_ts_in_col(rows: list[dict], col_candidates: list[str]) -> Optional[datetime]:
    """여러 컬럼 후보 중 파싱 가능한 가장 최신 타임스탬프 반환."""
    best: Optional[datetime] = None
    for col in col_candidates:
        for row in rows:
            val = row.get(col, '')
            dt = _parse_ts(str(val))
            if dt and (best is None or dt > best):
                best = dt
    return best


def _hours_since(dt: datetime) -> float:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return (now - dt).total_seconds() / 3600

# ──────────────────────────────────────────────────────────────────────────────
# 단일 탭 검진
# ──────────────────────────────────────────────────────────────────────────────
def check_tab(ws_map: dict[str, gspread.Worksheet], rule: TabRule) -> TabHealth:
    health = TabHealth(
        name=rule.name,
        status='OK',
        fix_script=rule.fix_script,
        fix_note=rule.fix_note,
    )

    # ① 탭 존재 여부
    if rule.name not in ws_map:
        health.status = 'MISSING'
        health.issues.append('탭 없음 — 구글시트에서 탭을 찾을 수 없음')
        return health

    ws = ws_map[rule.name]
    try:
        all_vals = ws.get_all_values()
    except Exception as e:
        health.status = 'FAIL'
        health.issues.append(f'시트 읽기 실패: {e}')
        return health

    if not all_vals:
        health.row_count = 0
        health.status = 'FAIL'
        health.issues.append('시트 완전히 비어있음')
        return health

    # 빈 헤더 컬럼 무시하고 rows → list[dict] 변환
    header = all_vals[0]
    col_map = {i: h for i, h in enumerate(header) if h.strip()}
    rows_raw = []
    for raw_row in all_vals[1:]:
        if not any(raw_row):
            continue  # 빈 행 스킵
        d = {h: (raw_row[i] if i < len(raw_row) else '') for i, h in col_map.items()}
        rows_raw.append(d)

    health.row_count = len(rows_raw)

    # ② 최소 행 수
    if health.row_count < rule.min_rows:
        health.status = 'FAIL'
        health.issues.append(
            f'행 수 부족: {health.row_count}행 (최소 {rule.min_rows}행 필요)'
        )

    # ③ 필수 컬럼 존재
    if rows_raw and rule.required_cols:
        actual_cols = set(rows_raw[0].keys())
        missing = [c for c in rule.required_cols if c not in actual_cols]
        if missing:
            if health.status == 'OK':
                health.status = 'WARN'
            health.issues.append(f'필수 컬럼 없음: {missing}')

    # ④ 신선도 검사
    if rule.max_age_hours and rule.timestamp_cols and rows_raw:
        latest = _latest_ts_in_col(rows_raw, rule.timestamp_cols)
        if latest:
            age_h = _hours_since(latest)
            health.last_update = latest.strftime('%Y-%m-%d %H:%M')
            if age_h > rule.max_age_hours:
                if health.status in ('OK', 'WARN'):
                    health.status = 'WARN'
                health.issues.append(
                    f'데이터 오래됨: {age_h:.1f}시간 전 (허용 {rule.max_age_hours}시간)'
                )
        else:
            # 타임스탬프 컬럼 자체가 없을 수 있음 → WARN
            if health.status == 'OK':
                health.status = 'WARN'
            health.issues.append(
                f'타임스탬프 확인 불가 ({rule.timestamp_cols} 중 유효값 없음)'
            )

    # ⑤ 핵심 수치 0 여부
    if rows_raw and rule.numeric_nonzero:
        for col in rule.numeric_nonzero:
            vals = [row.get(col, 0) for row in rows_raw]
            nonzero = [v for v in vals if v not in ('', None, 0, '0')]
            if not nonzero:
                if health.status == 'OK':
                    health.status = 'WARN'
                health.issues.append(f'수치 이상: {col} 전체 0 또는 빈값')

    return health

# ──────────────────────────────────────────────────────────────────────────────
# 전체 검진
# ──────────────────────────────────────────────────────────────────────────────
def run_health_check(ss: gspread.Spreadsheet) -> list[TabHealth]:
    print('\n' + '='*60)
    print('📋 SOUNDSTORM 파이프라인 전수 건강 검진')
    print('='*60)

    # 현재 탭 목록을 한 번에 로드 (API 호출 최소화)
    ws_map = {ws.title: ws for ws in ss.worksheets()}
    print(f'  시트 탭 목록 ({len(ws_map)}개): {list(ws_map.keys())}\n')

    results: list[TabHealth] = []
    for rule in TAB_RULES:
        health = check_tab(ws_map, rule)
        results.append(health)

        icon = {'OK': '✅', 'WARN': '⚠️ ', 'FAIL': '❌', 'MISSING': '🚫'}.get(health.status, '?')
        print(f'  {icon} [{health.status:7s}] {health.name:<28} {health.row_count:>5}행', end='')
        if health.last_update:
            print(f'  최종: {health.last_update}', end='')
        print()
        for issue in health.issues:
            print(f'           → {issue}')

    ok    = sum(1 for r in results if r.status == 'OK')
    warn  = sum(1 for r in results if r.status == 'WARN')
    fail  = sum(1 for r in results if r.status in ('FAIL', 'MISSING'))
    print(f'\n  합계: ✅ {ok}개 정상 / ⚠️  {warn}개 경고 / ❌ {fail}개 장애')
    return results

# ──────────────────────────────────────────────────────────────────────────────
# 자동 복구
# ──────────────────────────────────────────────────────────────────────────────
def run_auto_fix(results: list[TabHealth]) -> dict[str, bool]:
    """FAIL / MISSING 탭의 fix_script를 중복 없이 실행. 반환: {script_path: success}"""
    to_fix = [r for r in results if r.status in ('FAIL', 'MISSING') and r.fix_script]
    if not to_fix:
        print('\n  ℹ️  자동 복구 대상 없음')
        return {}

    # 동일 스크립트 중복 실행 방지
    scripts_to_run: dict[str, list[str]] = {}
    for r in to_fix:
        if r.fix_script not in scripts_to_run:
            scripts_to_run[r.fix_script] = []
        scripts_to_run[r.fix_script].append(r.name)

    # 자동 복구 불가 탭 안내
    no_fix = [r for r in results if r.status in ('FAIL', 'MISSING') and not r.fix_script]
    for r in no_fix:
        print(f'\n  🔧 [{r.name}] 수동 복구 필요: {r.fix_note or "담당자 확인 필요"}')

    fix_results: dict[str, bool] = {}
    print(f'\n{"="*60}')
    print(f'🔧 자동 복구 실행 ({len(scripts_to_run)}개 스크립트)')
    print('='*60)

    for rel_script, affected_tabs in scripts_to_run.items():
        abs_script = str(AUTOMATION_DIR / rel_script)
        print(f'\n  → {rel_script}')
        print(f'    대상 탭: {affected_tabs}')

        if not Path(abs_script).exists():
            print(f'    ❌ 스크립트 파일 없음: {abs_script}')
            fix_results[rel_script] = False
            continue

        try:
            proc = subprocess.run(
                [sys.executable, abs_script],
                cwd=str(AUTOMATION_DIR / rel_script).rsplit('/', 1)[0],
                capture_output=True,
                text=True,
                timeout=600,
            )
            success = proc.returncode == 0
            fix_results[rel_script] = success
            if success:
                print(f'    ✅ 완료 (returncode=0)')
            else:
                print(f'    ❌ 실패 (returncode={proc.returncode})')
                if proc.stderr:
                    for line in proc.stderr.strip().split('\n')[-10:]:
                        print(f'       {line}')
        except subprocess.TimeoutExpired:
            fix_results[rel_script] = False
            print(f'    ❌ 타임아웃 (10분 초과)')
        except Exception as e:
            fix_results[rel_script] = False
            print(f'    ❌ 실행 오류: {e}')

    return fix_results

# ──────────────────────────────────────────────────────────────────────────────
# _Pipeline_Health 탭 갱신
# ──────────────────────────────────────────────────────────────────────────────
def write_health_tab(ss: gspread.Spreadsheet, results: list[TabHealth]) -> None:
    now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d %H:%M:%S KST')
    headers = ['tab_name', 'status', 'row_count', 'last_update', 'issues', 'checked_at']
    rows = [headers]
    for r in results:
        rows.append([
            r.name,
            r.status,
            r.row_count,
            r.last_update,
            ' | '.join(r.issues) if r.issues else '',
            now_kst,
        ])

    try:
        try:
            ws = ss.worksheet(HEALTH_TAB_NAME)
        except gspread.exceptions.WorksheetNotFound:
            ws = ss.add_worksheet(HEALTH_TAB_NAME, 50, len(headers))
        ws.clear()
        ws.update(rows)
        print(f'\n  📊 {HEALTH_TAB_NAME} 탭 갱신 완료 ({len(results)}개 탭 검진 결과)')
    except Exception as e:
        print(f'\n  ⚠️  {HEALTH_TAB_NAME} 탭 write 실패: {e}')

# ──────────────────────────────────────────────────────────────────────────────
# Slack 알림
# ──────────────────────────────────────────────────────────────────────────────
def slack_notify(results: list[TabHealth], fix_results: Optional[dict] = None) -> None:
    webhook_url = os.environ.get('SLACK_WEBHOOK_URL', '')
    if not webhook_url:
        return

    fail_tabs  = [r for r in results if r.status in ('FAIL', 'MISSING')]
    warn_tabs  = [r for r in results if r.status == 'WARN']
    ok_count   = sum(1 for r in results if r.status == 'OK')

    if not fail_tabs and not warn_tabs:
        emoji, title = '✅', 'SOUNDSTORM 파이프라인 전체 정상'
    elif fail_tabs:
        emoji, title = '🚨', f'SOUNDSTORM 파이프라인 장애 ({len(fail_tabs)}개 탭)'
    else:
        emoji, title = '⚠️', f'SOUNDSTORM 파이프라인 경고 ({len(warn_tabs)}개 탭)'

    lines = [f'{emoji} *{title}*']
    lines.append(f'✅ {ok_count}개 정상 | ⚠️ {len(warn_tabs)}개 경고 | ❌ {len(fail_tabs)}개 장애')

    for r in fail_tabs:
        lines.append(f'  ❌ `{r.name}`: {" / ".join(r.issues)}')
    for r in warn_tabs:
        lines.append(f'  ⚠️ `{r.name}`: {" / ".join(r.issues)}')

    if fix_results:
        fixed = sum(1 for v in fix_results.values() if v)
        total = len(fix_results)
        lines.append(f'🔧 자동 복구: {fixed}/{total} 성공')

    payload = json.dumps({'text': '\n'.join(lines)}).encode()
    try:
        req = urllib.request.Request(webhook_url, data=payload,
                                     headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f'  ⚠️  Slack 알림 전송 실패: {e}')

# ──────────────────────────────────────────────────────────────────────────────
# 인증 + 진입점
# ──────────────────────────────────────────────────────────────────────────────
def _connect_sheets() -> gspread.Spreadsheet:
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES_SHEET)
    gc = gspread.authorize(creds)
    for attempt in range(4):
        try:
            return gc.open_by_key(SPREADSHEET_ID)
        except Exception as e:
            if attempt < 3:
                time.sleep(5 * (attempt + 1))
            else:
                raise RuntimeError(f'구글시트 연결 실패: {e}') from e


def main():
    auto_fix = '--fix' in sys.argv

    print('🩺 SOUNDSTORM Pipeline Health Monitor v1.0')
    print(f'   모드: {"검진 + 자동 복구" if auto_fix else "검진만"}')

    ss = _connect_sheets()
    print(f'   스프레드시트: {ss.title}')

    # 1. 전수 검진
    results = run_health_check(ss)

    # 2. 자동 복구 (--fix 플래그)
    fix_results: Optional[dict] = None
    if auto_fix:
        fix_results = run_auto_fix(results)

        # 복구 후 재검진
        if any(fix_results.values()):
            print('\n\n' + '='*60)
            print('🔁 복구 후 재검진')
            print('='*60)
            results = run_health_check(ss)

    # 3. _Pipeline_Health 탭 기록
    write_health_tab(ss, results)

    # 4. Slack 알림
    slack_notify(results, fix_results)

    # 5. 최종 요약
    fail_count = sum(1 for r in results if r.status in ('FAIL', 'MISSING'))
    warn_count = sum(1 for r in results if r.status == 'WARN')
    ok_count   = sum(1 for r in results if r.status == 'OK')

    print(f'\n{"="*60}')
    if fail_count == 0 and warn_count == 0:
        print(f'🎉 전체 {ok_count}개 탭 정상 — 파이프라인 100% 건강')
    elif fail_count > 0:
        print(f'🚨 장애 {fail_count}개 탭 — 즉시 확인 필요')
        if not auto_fix:
            print('   (--fix 플래그로 재실행 시 자동 복구 시도)')
    else:
        print(f'⚠️  경고 {warn_count}개 탭 — 모니터링 권장')
    print('='*60)

    # FAIL이 있으면 exit code 1 (cron/CI에서 알람 트리거용)
    sys.exit(1 if fail_count > 0 else 0)


if __name__ == '__main__':
    main()
