"""
analytics_snapshot_engine.py
SOUNDSTORM Analytics Snapshot Engine v1.0

목적:
    _RawData_FullPeriod 의 최신 collected_at 스냅샷을 추출·집계하여
    Dashboard 전용 시트 _Analytics_Snapshot 에 overwrite 저장한다.

    _RawData_FullPeriod (append-only, 행 무한 증가)
          ↓  max(fetched_at) 필터 + metric_type/dim_1/dim_2 집계
    _Analytics_Snapshot (Dashboard 전용, 매 실행마다 overwrite)

출력 시트 컬럼:
    snapshot_date | metric_type | dim_1 | dim_2 | value

사용법:
    python3 analytics_snapshot_engine.py
    python3 analytics_snapshot_engine.py --dry-run   # 시트 쓰기 없이 로그만 출력

CI 환경 변수 (GitHub Actions):
    SERVICE_ACCOUNT_B64   — base64 인코딩된 service_account.json
    GOOGLE_SHEETS_ID      — 스프레드시트 ID (선택, 기본값 사용)
"""

import os
import sys
import re
import base64
import argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
# engine/ 기준으로 07_AUTOMATION_자동화 루트를 sys.path 에 추가
_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
_AUTO_ROOT  = os.path.abspath(os.path.join(_ENGINE_DIR, '..'))
if _AUTO_ROOT not in sys.path:
    sys.path.insert(0, _AUTO_ROOT)

# ─── 설정 ─────────────────────────────────────────────────────────────────────
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
SOURCE_SHEET   = "_RawData_FullPeriod"
TARGET_SHEET   = "_Analytics_Snapshot"
SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]

# ─── 듀얼 인증 모드 ────────────────────────────────────────────────────────────
IS_CI = os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true"

if IS_CI:
    print("🔧 [CI Mode] GitHub Actions 환경 — 환경변수 기반 인증")
    _ci_dir = Path("/tmp/soundstorm_creds")
    _ci_dir.mkdir(exist_ok=True)
    b64_val = os.environ.get("SERVICE_ACCOUNT_B64", "")
    if b64_val:
        (_ci_dir / "service_account.json").write_bytes(base64.b64decode(b64_val))
        print("  ✅ service_account.json 복원 완료")
    else:
        print("  ❌ SERVICE_ACCOUNT_B64 환경변수 없음")
        sys.exit(1)
    CREDENTIALS_PATH = str(_ci_dir / "service_account.json")
    SPREADSHEET_ID   = os.environ.get("GOOGLE_SHEETS_ID", SPREADSHEET_ID)
else:
    _creds_dir       = os.path.join(_AUTO_ROOT, "credentials")
    CREDENTIALS_PATH = os.path.join(_creds_dir, "service_account.json")
    if not os.path.exists(CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"❌ service_account.json 없음\n"
            f"   경로: {CREDENTIALS_PATH}\n"
            f"   07_AUTOMATION_자동화/credentials/ 에 파일을 배치하세요."
        )

# ─── 정규식 ───────────────────────────────────────────────────────────────────
# api_data_shuttler.py 가 생성하는 run_id 패턴: 20260311_143022_abcd1234
_SNAPSHOT_ID_RE = re.compile(r"^\d{8}_\d{6}_[a-f0-9]{8}$")
_DATETIME_RE    = re.compile(r"^\d{4}-\d{2}-\d{2}")


# ─── 행 정규화 ────────────────────────────────────────────────────────────────

def _to_num(v) -> float:
    """문자열을 float 로 변환한다. 실패 시 0.0 반환."""
    try:
        return float(v) if v not in (None, "", "None") else 0.0
    except (ValueError, TypeError):
        return 0.0


def normalize_row(headers: list[str], raw: list[str]) -> dict:
    """
    _RawData_FullPeriod 행을 정규화된 dict 로 변환한다.

    지원 스키마 3종:
      [AGG]    metric_type | dim_1 | dim_2 | value [| fetched_at]
      [SNAP-A] run_id | start_date | end_date | collected_at | metric_type | dim_1 | dim_2 | value
      [SNAP-B] run_id | start_date | end_date | metric_type  | dim_1 | dim_2 | value | fetched_at
               (api_data_shuttler v13.0+ 실사용 포맷)
    """
    # 헤더 기반 dict 생성 (길이 불일치 대비 zip 사용)
    d = dict(zip(headers, raw))
    col0 = raw[0].strip() if raw else ""

    if _SNAPSHOT_ID_RE.match(col0):
        # run_id 첫 컬럼 → SNAP 계열
        col3 = raw[3].strip() if len(raw) > 3 else ""
        if _DATETIME_RE.match(col3):
            # [SNAP-A] col3 = collected_at
            return {
                "metric_type":  raw[4].upper().strip() if len(raw) > 4 else "",
                "dim_1":        raw[5].strip()          if len(raw) > 5 else "",
                "dim_2":        raw[6].strip()          if len(raw) > 6 else "",
                "value":        _to_num(raw[7])         if len(raw) > 7 else 0.0,
                "collected_at": col3,
            }
        else:
            # [SNAP-B] col3 = metric_type, col7 = fetched_at
            return {
                "metric_type":  col3.upper(),
                "dim_1":        raw[4].strip() if len(raw) > 4 else "",
                "dim_2":        raw[5].strip() if len(raw) > 5 else "",
                "value":        _to_num(raw[6]) if len(raw) > 6 else 0.0,
                "collected_at": raw[7].strip() if len(raw) > 7 else "",
            }

    # [AGG] 헤더 이름 기반 직접 매핑
    collected_at = (
        d.get("fetched_at") or d.get("collected_at") or ""
    ).strip()
    return {
        "metric_type":  d.get("metric_type", "").upper().strip(),
        "dim_1":        d.get("dim_1", "").strip(),
        "dim_2":        d.get("dim_2", "").strip(),
        "value":        _to_num(d.get("value", "")),
        "collected_at": collected_at,
    }


# ─── 최신 스냅샷 필터 ─────────────────────────────────────────────────────────

def filter_latest_snapshot(
    headers: list[str],
    rows: list[list[str]],
) -> list[dict]:
    """
    rows 전체를 정규화한 뒤 max(collected_at) 타임스탬프 행만 반환한다.
    collected_at 이 없는 시트(집계 전용)는 전체 행을 반환한다.
    """
    normalized = [normalize_row(headers, r) for r in rows]

    # max collected_at 탐색
    max_ts  = -1.0
    max_str = ""
    for n in normalized:
        at = n["collected_at"]
        if not at:
            continue
        try:
            ts = datetime.fromisoformat(at).timestamp()
            if ts > max_ts:
                max_ts  = ts
                max_str = at
        except ValueError:
            continue

    if not max_str:
        print("⚠️  collected_at 컬럼 없음 — 전체 행 사용")
        return normalized

    print(f"📅 최신 collected_at: {max_str}")

    filtered = []
    for n in normalized:
        at = n["collected_at"]
        if not at:
            continue
        try:
            # 1초 이내 같은 스냅샷으로 간주 (문자열 포맷 미세 차이 허용)
            if abs(datetime.fromisoformat(at).timestamp() - max_ts) < 1.0:
                filtered.append(n)
        except ValueError:
            continue

    return filtered


# ─── 집계 ─────────────────────────────────────────────────────────────────────

def aggregate(rows: list[dict]) -> list[tuple]:
    """
    metric_type + dim_1 + dim_2 기준으로 value 를 합산한다.
    반환: [((metric_type, dim_1, dim_2), value), ...]  value 내림차순
    """
    agg: dict[tuple, float] = defaultdict(float)
    for r in rows:
        mt = r["metric_type"]
        if not mt:
            continue  # metric_type 없는 행 스킵
        key = (mt, r["dim_1"], r["dim_2"])
        agg[key] += r["value"]

    return sorted(agg.items(), key=lambda x: (-x[1], x[0][0], x[0][1]))


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main(dry_run: bool = False) -> None:
    print("=" * 60)
    print("🔄 Analytics Snapshot Engine v1.0 시작")
    print(f"   Source  : {SOURCE_SHEET}")
    print(f"   Target  : {TARGET_SHEET}")
    print(f"   Mode    : {'CI' if IS_CI else 'Local'}")
    print(f"   Dry-run : {dry_run}")
    print("=" * 60)

    # ── Google Sheets 인증 ───────────────────────────────────────────────────
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
    gc    = gspread.authorize(creds)
    ss    = gc.open_by_key(SPREADSHEET_ID)
    print("✅ Google Sheets 인증 완료")

    # ── 소스 시트 읽기 ────────────────────────────────────────────────────────
    try:
        ws_source = ss.worksheet(SOURCE_SHEET)
    except gspread.exceptions.WorksheetNotFound:
        print(f"❌ 시트 없음: {SOURCE_SHEET}")
        sys.exit(1)

    all_values = ws_source.get_all_values()
    if len(all_values) < 2:
        print("❌ 데이터 없음 (헤더 행만 존재하거나 빈 시트)")
        sys.exit(1)

    headers   = [h.strip() for h in all_values[0]]
    data_rows = all_values[1:]
    print(f"📥 소스 읽기 완료: {len(data_rows)}행 (헤더 제외)")
    print(f"   헤더: {headers}")

    # ── 최신 스냅샷 필터 ──────────────────────────────────────────────────────
    latest_rows = filter_latest_snapshot(headers, data_rows)
    print(f"\n📊 Snapshot rows processed : {len(latest_rows)}")

    if not latest_rows:
        print("❌ 필터 결과 없음 — 처리 중단")
        sys.exit(1)

    # ── 집계 ─────────────────────────────────────────────────────────────────
    aggregated  = aggregate(latest_rows)
    type_counts: dict[str, int] = defaultdict(int)
    for (mt, _, _), _ in aggregated:
        type_counts[mt] += 1

    print(f"📊 Metric groups created   : {len(type_counts)}")
    for mt in sorted(type_counts):
        print(f"   {mt:<20} {type_counts[mt]}건")

    # ── 출력 행 구성 ──────────────────────────────────────────────────────────
    snapshot_date  = datetime.now().strftime("%Y-%m-%d")
    OUTPUT_HEADERS = ["snapshot_date", "metric_type", "dim_1", "dim_2", "value"]

    output_rows = [OUTPUT_HEADERS]
    for (mt, d1, d2), val in aggregated:
        # 정수로 떨어지는 값은 int 로 저장 (불필요한 소수점 제거)
        v_out = int(val) if val == int(val) else round(val, 6)
        output_rows.append([snapshot_date, mt, d1, d2, v_out])

    data_row_count = len(output_rows) - 1
    print(f"\n📝 출력 준비: {data_row_count}행")

    # ── 타깃 시트 overwrite ───────────────────────────────────────────────────
    if dry_run:
        print("\n⚠️  [Dry-run] 시트 쓰기 건너뜀")
        print("   샘플 (최대 5행):")
        for r in output_rows[:6]:
            print(f"   {r}")
    else:
        try:
            ws_target = ss.worksheet(TARGET_SHEET)
        except gspread.exceptions.WorksheetNotFound:
            ws_target = ss.add_worksheet(
                title=TARGET_SHEET,
                rows=max(5000, data_row_count + 10),
                cols=len(OUTPUT_HEADERS),
            )
            print(f"✅ 새 시트 생성: {TARGET_SHEET}")

        # clear() → update() 사이 공백 제거: update 먼저, 초과 행 resize로 정리
        # clear() 후 update() 방식은 fetch 타이밍에 따라 빈 데이터 반환 가능
        ws_target.update(output_rows, value_input_option="USER_ENTERED")
        total_rows = max(len(output_rows) + 5, 10)
        ws_target.resize(rows=total_rows)
        print(f"📤 Snapshot write complete : {data_row_count}행 → [{TARGET_SHEET}]")

    print("\n" + "=" * 60)
    print("✅ Analytics Snapshot Engine 완료")
    print("=" * 60)


# ─── CLI 진입점 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="SOUNDSTORM Analytics Snapshot Engine"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="시트에 쓰지 않고 로그만 출력",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
