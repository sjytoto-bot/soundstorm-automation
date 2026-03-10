#!/usr/bin/env python3
"""
[SOUNDSTORM] GitHub Secrets 준비 스크립트
=========================================
로컬 인증 파일을 base64로 인코딩하여 GitHub Secrets에 등록할 값을 생성합니다.

사용법:
  python export_secrets.py

출력된 값을 GitHub → Settings → Secrets and variables → Actions에 등록하세요.
"""

import base64
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR
while ROOT_DIR.name != 'SOUNDSTORM' and ROOT_DIR.parent != ROOT_DIR:
    ROOT_DIR = ROOT_DIR.parent

CREDS_DIR = ROOT_DIR / "07_AUTOMATION_자동화" / "credentials"
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"

files = {
    'SERVICE_ACCOUNT_B64': CREDS_DIR / 'service_account.json',
    'CLIENT_SECRET_B64':   CREDS_DIR / 'client_secret.json',
    'GOOGLE_TOKEN_B64':    CREDS_DIR / 'token.pickle',
}

print("=" * 60)
print("🔐 GitHub Secrets 등록용 Base64 값")
print("=" * 60)
print()

for secret_name, file_path in files.items():
    if file_path.exists():
        b64 = base64.b64encode(file_path.read_bytes()).decode()
        print(f"──── {secret_name} ────")
        print(f"파일: {file_path.name}")
        print(f"길이: {len(b64)} chars")
        print(f"값:")
        print(b64)
        print()
    else:
        print(f"⚠️ {secret_name}: 파일 없음 ({file_path})")
        print()

print(f"──── GOOGLE_SHEETS_ID ────")
print(f"값: {SPREADSHEET_ID}")
print()
print("=" * 60)
print("위 4개 값을 GitHub Secrets에 등록하세요:")
print("  GitHub → Settings → Secrets and variables → Actions")
print("  → New repository secret")
print("=" * 60)
