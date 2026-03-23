
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
    # 1. 기존 토큰 백업 (안전을 위해)
    if os.path.exists(TOKEN_PICKLE):
        backup_path = TOKEN_PICKLE + ".bak"
        os.rename(TOKEN_PICKLE, backup_path)
        print(f"Existing token backed up to {backup_path}")

    # 2. OAuth Flow 설정
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET, 
        scopes=SCOPES,
        redirect_uri='urn:ietf:wg:oauth:2.0:oob' # 콘솔 입력 방식
    )

    # 3. 인증 URL 생성
    auth_url, _ = flow.authorization_url(prompt='select_account')

    print("\n" + "="*60)
    print("1. 아래 링크를 브라우저(시크릿 모드 권장)에서 열어주세요.")
    print(f"   반드시 'wldyd032@gmail.com' 계정을 사용해야 합니다.")
    print("-" * 60)
    print(auth_url)
    print("-" * 60)
    print("2. 인증을 완료한 후 화면에 나오는 '인증 코드'를 복사하세요.")
    print("3. 아래에 코드를 입력하고 Enter를 눌러주세요.")
    print("="*60 + "\n")

    code = input("Enter the authorization code: ").strip()

    # 4. 토큰 획득 및 저장
    flow.fetch_token(code=code)
    creds = flow.credentials

    with open(TOKEN_PICKLE, 'wb') as token:
        pickle.dump(creds, token)
    
    print("\n✅ 인증 성공! token.pickle이 업데이트되었습니다.")

if __name__ == "__main__":
    main()
