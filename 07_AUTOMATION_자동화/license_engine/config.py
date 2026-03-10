import os
import json
from dotenv import load_dotenv

# .env 로드
load_dotenv()

class Config:
    # 기본 경로 설정
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    LOGS_DIR = os.path.join(BASE_DIR, 'logs')
    OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
    TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
    
    DB_PATH = os.path.join(DATA_DIR, 'license.db')
    
    # Drive 설정
    DRIVE_ROOT_FOLDER_ID = os.environ.get('DRIVE_ROOT_FOLDER_ID', '')
    MASTER_AUDIO_FOLDER_ID = os.environ.get('MASTER_AUDIO_FOLDER_ID', '')
    SERVICE_ACCOUNT_FILE = os.path.join(BASE_DIR, 'service_account.json')
    
    # R2 스토리지 설정
    R2_ENDPOINT = os.environ.get('R2_ENDPOINT', '')
    R2_BUCKET = os.environ.get('R2_BUCKET', 'soundstorm-license')
    R2_ACCESS_KEY = os.environ.get('R2_ACCESS_KEY', '')
    R2_SECRET_KEY = os.environ.get('R2_SECRET_KEY', '')
    
    # 이메일 설정 (SMTP)
    SMTP_SERVER = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
    SMTP_USER = os.environ.get('SMTP_USER', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    
    # Gmail API (Secret Manager 지원: JSON 문자열 우선, 없으면 로컬 파일 경로)
    GMAIL_CREDENTIALS_JSON = os.environ.get('GMAIL_CREDENTIALS_JSON')
    GMAIL_TOKEN_JSON = os.environ.get('GMAIL_TOKEN_JSON')
    
    # 검증 URL 기본 주소
    VERIFY_BASE_URL = "https://soundstorm.kr/verify"

    @classmethod
    def ensure_directories(cls):
        """필요한 디렉토리가 모두 존재하는지 확인하고 없으면 생성합니다."""
        for dr in [cls.DATA_DIR, cls.LOGS_DIR, cls.OUTPUT_DIR, cls.TEMPLATES_DIR]:
            os.makedirs(dr, exist_ok=True)

# 초기화 시 디렉토리 생성
Config.ensure_directories()
