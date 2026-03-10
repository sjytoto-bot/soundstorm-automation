import os
import sys

# 상위 경로를 PYTHONPATH에 추가하여 모듈 인식 보장
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.core.issue_license import issue_license_process
from license_engine.config import Config

def run_real_test():
    print(f"[{Config.SMTP_USER}] 메일과 Drive 연결을 사용한 실제 발급 프로세스 시작...")
    
    # 구매자 이메일을 사용자 계정으로 설정하여 수신 권한 획득 테스트, SS014 기준으로 테스트
    buyer_name = "SOUNDSTORM TESTER"
    buyer_email = "sjytoto@gmail.com"  # 권한 및 메일 수신 확인용 계정
    track_id = "SS014"                 # MASTER AUDIO에 SS014.wav 가 존재한다고 가정
    track_title = "토벌 (討伐) - 테스트"
    license_type = "permanent"

    try:
        result = issue_license_process(buyer_name, buyer_email, track_id, track_title, license_type)
        print("\n=== 테스트 결과 ===")
        print(f"Status: {result.get('status')}")
        print(f"License Number: {result.get('license_number')}")
        print(f"Drive URL: {result.get('drive_folder_url')}")
        print(f"Error: {result.get('error_code')} / {result.get('error_message')}")
        
        if result.get("status") == "success":
            print("\n✅ 실제 발급 테스트 (SUCCESS) 통과!")
        else:
            print("\n❌ 실제 발급 테스트 (FAIL)")
    except Exception as e:
        print(f"\n❌ 예상치 못한 런타임 오류 발생: {str(e)}")

if __name__ == "__main__":
    run_real_test()
