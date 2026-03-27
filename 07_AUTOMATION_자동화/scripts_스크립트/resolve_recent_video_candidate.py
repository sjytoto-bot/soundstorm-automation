"""
resolve_recent_video_candidate.py

_RawData_Master에서 최근 영상 보강 대상을 하나 고르고 JSON으로 출력한다.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials as SACredentials

from recent_video_pipeline import select_recent_video_candidate

BASE_DIR = Path(__file__).parent.parent
CREDENTIALS_DIR = BASE_DIR / "credentials"
IS_CI = os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true"
SPREADSHEET_ID = os.environ.get("GOOGLE_SHEETS_ID", "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y")

if IS_CI:
    _ci_dir = Path("/tmp/soundstorm_creds")
    _ci_dir.mkdir(exist_ok=True)
    b64 = os.environ.get("SERVICE_ACCOUNT_B64", "")
    if b64:
        (_ci_dir / "service_account.json").write_bytes(base64.b64decode(b64))
    CREDENTIALS_PATH = _ci_dir / "service_account.json"
else:
    CREDENTIALS_PATH = CREDENTIALS_DIR / "service_account.json"


def main() -> None:
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    gc = gspread.authorize(SACredentials.from_service_account_file(str(CREDENTIALS_PATH), scopes=scopes))
    ws = gc.open_by_key(SPREADSHEET_ID).worksheet("_RawData_Master")
    records = ws.get_all_records()
    result = select_recent_video_candidate(records, max_age_hours=72)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
