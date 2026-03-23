
import os
import pickle
import json
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# 설정
BASE_DIR = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화"
TOKEN_PICKLE = os.path.join(BASE_DIR, "credentials/token.pickle")
CLIENT_SECRET = os.path.join(BASE_DIR, "credentials/client_secret.json")

SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
    'https://www.googleapis.com/auth/youtubereporting.readonly'
]

def main():
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
    # 포트를 8080으로 고정하여 예측 가능한 URL 생성
    creds = flow.run_local_server(port=8080, prompt='select_account')

    with open(TOKEN_PICKLE, 'wb') as token:
        pickle.dump(creds, token)
    
    print("\n✅ 인증 완료! token.pickle이 업데이트되었습니다.")

if __name__ == "__main__":
    main()
