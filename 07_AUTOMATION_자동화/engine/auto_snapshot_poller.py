"""
auto_snapshot_poller.py
SOUNDSTORM RAW DATA 변경 감지 → Analytics Snapshot 자동 갱신

흐름:
    _RawData_FullPeriod 시트 시그니처(행 수 + 마지막 collected_at) 체크
    → 변경 감지 시 analytics_snapshot_engine.main() 실행
    → _Analytics_Snapshot 시트 overwrite

스케줄링:
    launchd 5분 주기 실행 (kr.soundstorm.snapshot_poller.plist)

사용법:
    python3 auto_snapshot_poller.py           # 일반 실행
    python3 auto_snapshot_poller.py --dry-run # 변경 감지까지만 (시트 쓰기 없음)
    python3 auto_snapshot_poller.py --force   # 시그니처 무시하고 강제 실행
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
_AUTO_ROOT  = os.path.abspath(os.path.join(_ENGINE_DIR, '..'))
if _AUTO_ROOT not in sys.path:
    sys.path.insert(0, _AUTO_ROOT)

# ─── 설정 ─────────────────────────────────────────────────────────────────────
SPREADSHEET_ID  = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
SOURCE_SHEET    = "_RawData_FullPeriod"
CREDENTIALS_PATH = os.path.join(_AUTO_ROOT, "credentials", "service_account.json")

CACHE_DIR  = os.path.join(_AUTO_ROOT, "03_RUNTIME", "cache")
CACHE_FILE = os.path.join(CACHE_DIR, "raw_data_signature.json")

LOG_DIR  = os.path.join(_AUTO_ROOT, "03_RUNTIME", "logs")
LOG_FILE = os.path.join(LOG_DIR, "auto_snapshot_poller.log")

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# ─── 로거 설정 ────────────────────────────────────────────────────────────────
os.makedirs(LOG_DIR,  exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


# ─── 시그니처 계산 ────────────────────────────────────────────────────────────

def build_signature(ws) -> str:
    """
    _RawData_FullPeriod 의 변경 지표:
        last_row | 마지막 행의 첫 번째 셀 값(run_id 또는 collected_at)
    가볍고 충분한 변경 감지용 식별자.
    """
    last_row = ws.row_count
    # 실제 데이터가 있는 마지막 행 번호
    all_vals = ws.get_all_values()
    actual_last = len(all_vals)
    last_cell   = str(all_vals[-1][0]).strip() if actual_last > 1 else ""
    return f"{actual_last}|{last_cell[:80]}"


# ─── 캐시 읽기/쓰기 ───────────────────────────────────────────────────────────

def load_cached_signature() -> str:
    if not os.path.exists(CACHE_FILE):
        return ""
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("signature", "")
    except Exception:
        return ""


def save_signature(sig: str) -> None:
    data = {
        "signature":  sig,
        "updated_at": datetime.now().isoformat(),
    }
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main(dry_run: bool = False, force: bool = False) -> None:
    log.info("=" * 55)
    log.info("▶ auto_snapshot_poller 시작")
    log.info(f"   dry_run={dry_run}  force={force}")
    log.info("=" * 55)

    # ── 인증 & 시트 접근 ──────────────────────────────────────────────────────
    import gspread
    from google.oauth2.service_account import Credentials

    if not os.path.exists(CREDENTIALS_PATH):
        log.error(f"service_account.json 없음: {CREDENTIALS_PATH}")
        sys.exit(1)

    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
    gc    = gspread.authorize(creds)
    ss    = gc.open_by_key(SPREADSHEET_ID)
    log.info("✅ Google Sheets 인증 완료")

    try:
        ws_raw = ss.worksheet(SOURCE_SHEET)
    except gspread.exceptions.WorksheetNotFound:
        log.error(f"시트 없음: {SOURCE_SHEET}")
        sys.exit(1)

    # ── 시그니처 비교 ─────────────────────────────────────────────────────────
    current_sig = build_signature(ws_raw)
    prev_sig    = load_cached_signature()

    log.info(f"📊 현재 시그니처: {current_sig}")
    log.info(f"📊 이전 시그니처: {prev_sig or '(없음)'}")

    if not force and current_sig == prev_sig:
        log.info("✅ 변경 없음 — 종료")
        return

    log.info("🔄 변경 감지 → Analytics Snapshot 실행")

    # ── 스냅샷 엔진 실행 ──────────────────────────────────────────────────────
    if dry_run:
        log.info("⚠️  [dry-run] 실제 시트 쓰기 건너뜀")
    else:
        from analytics_snapshot_engine import main as run_snapshot
        run_snapshot(dry_run=False)

    # ── 시그니처 저장 ─────────────────────────────────────────────────────────
    if not dry_run:
        save_signature(current_sig)
        log.info(f"💾 시그니처 저장 완료: {CACHE_FILE}")

    log.info("=" * 55)
    log.info("✅ auto_snapshot_poller 완료")
    log.info("=" * 55)


# ─── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SOUNDSTORM RAW DATA 변경 감지 폴러")
    parser.add_argument("--dry-run", action="store_true", help="시트 쓰기 없이 감지만")
    parser.add_argument("--force",   action="store_true", help="시그니처 무시하고 강제 실행")
    args = parser.parse_args()
    main(dry_run=args.dry_run, force=args.force)
