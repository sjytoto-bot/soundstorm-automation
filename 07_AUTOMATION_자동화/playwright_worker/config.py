import os
from dotenv import load_dotenv

load_dotenv()


class WorkerConfig:
    # Secret Manager에서 주입되는 환경변수
    NAVER_ID = os.environ.get('NAVER_ID', '')
    NAVER_PW = os.environ.get('NAVER_PW', '')

    LICENSE_ENGINE_URL = os.environ.get(
        'LICENSE_ENGINE_URL',
        'https://license-engine-774503242418.asia-northeast3.run.app'
    )

    # Playwright 세션 파일 (Cloud Run /tmp — 재시작 시 초기화되어도 무방)
    SESSION_PATH = os.environ.get('SESSION_PATH', '/tmp/naver_session.json')
