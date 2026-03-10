from datetime import datetime
from license_engine.core.db_manager import db_manager

class LicenseIssueError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(self.message)

def generate_license_number(track_id: str) -> str:
    """
    트랙 ID와 날짜를 기반으로 고유한 라이선스 번호를 생성합니다.
    동시성 문제나 중복이 발생할 경우 1회 재시도합니다.
    
    포맷: SS-{TRACK_ID}-{YYYYMMDD}-{SEQ:02d}
    """
    date_str = datetime.now().strftime("%Y%m%d")
    
    # 중복 충돌 시 최대 2회까지 시도 (1회 재시도 포함)
    max_retries = 2
    
    for attempt in range(max_retries):
        # 1. DB에서 다음 SEQ 번호를 조회
        next_seq = db_manager.get_latest_seq_for_date(track_id, date_str)
        # 2. 번호 조합
        license_number = f"SS-{track_id}-{date_str}-{next_seq:02d}"
        
        # 여기서 생성한 번호가 충돌 안하는지 확실히 검증하기 위해 DB에 PENDING 기록을 하는 주체는 
        # issue_license 모듈이므로 생성 함수 자체는 번호만 리턴함.
        # 단, 동시성 보장을 위해선 생성과 등록이 원자적으로 묶여야 하므로 issue_license 쪽에서 로직 처리.
        # DB의 create_pending_license 함수에서 sqlite3.IntegrityError가 떨어지면 이 함수를 다시 호출하게 됨.
        
        return license_number
        
    raise LicenseIssueError("ERR006", "라이선스 번호 생성 중복 발생으로 실패했습니다.")

def get_and_reserve_license_number(track_id: str, buyer_name: str, buyer_email: str) -> str:
    """
    번호를 채번하고 즉시 DB에 PENDING 상태로 Insert 하여
    번호의 고유성(UNIQUE)과 동시성을 보장합니다.
    """
    date_str = datetime.now().strftime("%Y%m%d")
    max_retries = 2
    
    for attempt in range(max_retries):
        next_seq = db_manager.get_latest_seq_for_date(track_id, date_str)
        license_number = f"SS-{track_id}-{date_str}-{next_seq:02d}"
        
        # 즉시 예약 (Insert) 통과되면 번호 할당 성공
        success = db_manager.create_pending_license(
            license_number=license_number,
            track_id=track_id,
            buyer_name=buyer_name,
            buyer_email=buyer_email
        )
        
        if success:
            return license_number
            
    # 재시도에도 실패하면 오류 발생
    raise LicenseIssueError("ERR006", "라이선스 번호 채번 및 DB 기록에 실패했습니다. (동시성 충돌)")
