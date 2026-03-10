import os
import sys
import logging
import ssl

# macOS Weasyprint Google Fonts 다운로드 시 SSL 인증 에러 우회
ssl._create_default_https_context = ssl._create_unverified_context

# 상위 경로를 PYTHONPATH에 추가하여 모듈 인식 보장
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.core.gmail_listener import GmailListener
from license_engine.core.issue_license import issue_license_process
from license_engine.config import Config

logging.basicConfig(level=logging.INFO)

def run_e2e_test():
    print("🚀 [License Engine v2.1] 로컬 E2E 통합 테스트 시작...\n")
    
    # 1. Gmail API 리스너 초기화 시도
    listener = GmailListener(Config.BASE_DIR)
    if not listener.service:
        print("❌ Gmail API 초기화 실패. credentials.json 및 token.json 설정을 확인하세요.")
        return

    print("✅ Gmail 연동 완료. 새 주문 메일을 검색합니다...")
    orders = listener.fetch_unread_orders()
    
    if not orders:
        print("📭 현재 수신된 네이버 스토어 신규 주문 메일(읽지 않음 상태)이 없습니다.")
        print("테스트를 원하시면 sjytoto@gmail.com 계정으로 [from:store@naver.com subject:(주문) is:unread] 조건에 맞는 테스트 메일을 전송/수정해 주세요.")
        
        # 테스트를 위해 강제로 가상 주문 처리 시연
        print("\n--- 가상 데이터를 사용한 강제 연동 테스트 시나리오 실행 ---")
        mock_order = {
            "order_number": "TEST-ORD-20260224-0001",
            "message_id": "TEST-MSG-ID-0001",
            "buyer_name": "SOUNDSTORM TESTER",
            "buyer_email": "sjytoto@gmail.com",
            "track_id": "SS-014_1. 도륙의 세월 마스터",
            "track_title": "도륙의 세월 마스터 - E2E 테스트 버킷 연동",
            "license_type": "permanent"
        }
        orders = [mock_order]
    
    for order in orders:
        print(f"\n📦 감지된 주문 처리 시작: {order['order_number']}")
        try:
            result = issue_license_process(
                order_number=order['order_number'],
                message_id=order['message_id'],
                buyer_name=order['buyer_name'],
                buyer_email=order['buyer_email'],
                track_id=order['track_id'],
                track_title=order['track_title'],
                license_type=order['license_type']
            )
            print("\n=== 테스트 결과 ===")
            print(f"Status: {result.get('status')}")
            if result.get('status') == 'skip':
                print(f"Skipped Reason: {result.get('error_message')}")
            else:
                print(f"License Number: {result.get('license_number')}")
                print(f"R2 Presigned URL: {result.get('drive_folder_url')}")
                if result.get('error_code'):
                    print(f"Error: {result.get('error_code')} / {result.get('error_message')}")

            if result.get("status") == "success":
                print("\n✅ 실제 발급 E2E 테스트 (SUCCESS) 통과!")
        except Exception as e:
            print(f"\n❌ 예상치 못한 런타임 오류 발생: {str(e)}")

if __name__ == "__main__":
    run_e2e_test()
