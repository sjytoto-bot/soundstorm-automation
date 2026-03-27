"""
write_recent_video_worker_result.py

Cloud worker recent-video 응답을 _RawData_Master에 write-back 한다.

사용 예:
  python write_recent_video_worker_result.py --json '{"status":"ok",...}'
  cat worker_result.json | python write_recent_video_worker_result.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials as SACredentials

from recent_video_pipeline import normalize_metric_result, write_metric_result


BASE_DIR = Path(__file__).parent.parent
CREDENTIALS_DIR = BASE_DIR / "credentials"
TARGET_SHEET = "_RawData_Master"
DEFAULT_SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"

IS_CI = os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true"
if IS_CI:
    ci_dir = Path("/tmp/soundstorm_creds")
    ci_dir.mkdir(exist_ok=True)
    b64 = os.environ.get("SERVICE_ACCOUNT_B64", "")
    if b64:
        (ci_dir / "service_account.json").write_bytes(base64.b64decode(b64))
    CREDENTIALS_PATH = ci_dir / "service_account.json"
    SPREADSHEET_ID = os.environ.get("GOOGLE_SHEETS_ID", DEFAULT_SPREADSHEET_ID)
else:
    CREDENTIALS_PATH = CREDENTIALS_DIR / "service_account.json"
    SPREADSHEET_ID = DEFAULT_SPREADSHEET_ID


def get_gspread_client():
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    if not CREDENTIALS_PATH.exists():
        raise RuntimeError(f"Service Account 파일 없음: {CREDENTIALS_PATH}")
    creds = SACredentials.from_service_account_file(str(CREDENTIALS_PATH), scopes=scopes)
    return gspread.authorize(creds)


def load_payload(args) -> dict:
    raw = args.json
    if not raw:
        raw = os.environ.get("RECENT_VIDEO_RESULT_JSON", "")
    if not raw and not os.isatty(0):
        raw = os.sys.stdin.read()
    if not raw:
        raise RuntimeError("worker result JSON이 비어 있습니다.")
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", help="worker result JSON string")
    args = parser.parse_args()

    payload = normalize_metric_result(load_payload(args), default_source="worker")
    print("▶ normalized worker result:", json.dumps(payload, ensure_ascii=False))

    if payload.get("status") not in {"ok", "partial"}:
        print(f"ℹ️ write skip — non-writable status={payload.get('status')} reason={payload.get('reason')}")
        return

    gc = get_gspread_client()
    summary = write_metric_result(gc, SPREADSHEET_ID, TARGET_SHEET, payload)
    print("▶ write summary:", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
