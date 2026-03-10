import os
import sys

# 프로젝트 루트(07_AUTOMATION_자동화) 경로를 PATH에 추가 (자신이 license_engine 내부에 있으므로 상위 디렉터리)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.config import Config
from license_engine.core.gmail_listener import GmailListener

def generate_local_token():
    """
    로컬 환경에서 브라우저 인증을 통해 token.json을 생성합니다.
    """
    print("Gmail API 인증 프로세스를 시작합니다...")
    if not os.path.exists(Config.BASE_DIR + "/credentials.json"):
        print("❌ Error: credentials.json 파일이 루트 폴더에 없습니다. GCP 콘솔에서 다운받아주세요.")
        sys.exit(1)
        
    print("브라우저가 열리면 사용할 Gmail 계정(sjytoto@gmail.com)으로 로그인 후 권한을 허용해주세요.")
    # GmailListener 초기화 시 자동으로 _authenticate() 가 호출되며 브라우저 플로우가 실행됩니다.
    listener = GmailListener(Config.BASE_DIR)
    
    if listener.service:
        print("\n✅ 인증 성공! token.json 이 생성되었습니다.")
        print(f"저장 위치: {listener.token_path}")
        print("\n이 token.json의 전체 내용을 복사하여 GCP Secret Manager에 GMAIL_TOKEN_JSON 이라는 이름으로 등록하시면 됩니다.")
    else:
        print("\n❌ 인증 실패!")

if __name__ == "__main__":
    generate_local_token()
