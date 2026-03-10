#!/usr/bin/env python3
"""
refresh_token.py
Drive 로컬 OAuth 토큰을 재발급합니다.
실행 후 브라우저에서 Google 로그인 → token.json 갱신
"""
import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDENTIALS_PATH = os.path.join(BASE_DIR, "credentials.json")
TOKEN_PATH = os.path.join(BASE_DIR, "token.json")

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://mail.google.com/"
]

creds = None
if os.path.exists(TOKEN_PATH):
    creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

if creds and creds.valid:
    print("✅ 토큰이 유효합니다. 갱신 불필요.")
elif creds and creds.expired and creds.refresh_token:
    print("🔄 만료된 토큰 갱신 시도 중...")
    try:
        creds.refresh(Request())
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        print(f"✅ 토큰 갱신 완료: {TOKEN_PATH}")
    except Exception as e:
        print(f"❌ 갱신 실패: {e}")
        print("→ 브라우저 재인증 진행...")
        flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
        creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        print(f"✅ 새 토큰 저장 완료: {TOKEN_PATH}")
else:
    print("🌐 브라우저 인증 진행 중...")
    flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
    creds = flow.run_local_server(port=0)
    with open(TOKEN_PATH, "w") as f:
        f.write(creds.to_json())
    print(f"✅ 새 토큰 저장 완료: {TOKEN_PATH}")
