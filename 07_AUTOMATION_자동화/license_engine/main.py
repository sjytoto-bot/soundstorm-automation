from license_engine.core.issue_license import issue_license_process

def issue_license(buyer_name: str, buyer_email: str, track_id: str, track_title: str, license_type: str) -> dict:
    """
    네이버 스토어 주문 정보 기반 라이선스 자동 발급 요청을 수신합니다.
    
    Args:
        buyer_name (str): 구매자명 (예: "홍길동")
        buyer_email (str): 구매자 이메일 주소 (예: "test@email.com")
        track_id (str): 트랙 고유 ID (예: "SS014")
        track_title (str): 트랙 제목 (예: "토벌 (討伐)")
        license_type (str): "one_time" | "permanent"
        
    Returns:
        dict: 처리 결과 데이터 (status, license_number, drive_folder_url, issued_at 등)
    """
    return issue_license_process(
        buyer_name=buyer_name,
        buyer_email=buyer_email,
        track_id=track_id,
        track_title=track_title,
        license_type=license_type
    )

if __name__ == "__main__":
    # 간단한 실행 테스트를 위한 더미 진입점
    print("License Engine Initialized.")
    # result = issue_license("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
    # print(result)
