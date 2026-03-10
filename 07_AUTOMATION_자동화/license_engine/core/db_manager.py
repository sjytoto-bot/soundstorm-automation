import sqlite3
import os
import json
from datetime import datetime
from license_engine.config import Config

class DBManager:
    def __init__(self):
        self.db_path = Config.DB_PATH
        self._init_db()

    def _get_connection(self):
        # row_factory 설정
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """테이블이 없으면 생성합니다."""
        query = """
        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_number TEXT UNIQUE,
            order_number TEXT,
            message_id TEXT,
            track_id TEXT,
            buyer_name TEXT,
            buyer_email TEXT,
            issue_date TEXT,
            status TEXT,
            error_code TEXT,
            error_message TEXT,
            created_at TEXT,
            UNIQUE(order_number, message_id)
        );
        """
        with self._get_connection() as conn:
            conn.execute(query)
            conn.commit()

    def check_duplicate(self, order_number: str, message_id: str) -> bool:
        """주문번호와 메시지 아이디로 이미 처리된 메일인지(또는 진행중인지) 확인합니다."""
        query = "SELECT 1 FROM licenses WHERE order_number = ? AND message_id = ?"
        with self._get_connection() as conn:
            result = conn.execute(query, (order_number, message_id)).fetchone()
            return result is not None

    def create_pending_license(self, license_number: str, order_number: str, message_id: str, track_id: str, buyer_name: str, buyer_email: str) -> bool:
        """라이선스 발급 전 PENDING 상태로 레코드를 임시 기록합니다."""
        now = datetime.now().isoformat()
        query = """
        INSERT INTO licenses (
            license_number, order_number, message_id, track_id, buyer_name, buyer_email, issue_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        """
        # status -> PENDING, SUCCESS, FAILED, PARTIAL, ROLLBACK
        with self._get_connection() as conn:
            try:
                # BEGIN IMMEDIATE로 트랜잭션 격리 보장
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(query, (license_number, order_number, message_id, track_id, buyer_name, buyer_email, now, now))
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                # UNIQUE 제약 조건(license_number 중복) 시 에러
                conn.rollback()
                return False

    def update_license_status(self, license_number: str, status: str, error_code: str = None, error_message: str = None) -> bool:
        """라이선스 처리 상태를 업데이트합니다."""
        query = """
        UPDATE licenses
        SET status = ?, error_code = ?, error_message = ?
        WHERE license_number = ?
        """
        with self._get_connection() as conn:
            conn.execute(query, (status, error_code, error_message, license_number))
            conn.commit()
            return True

    def get_latest_seq_for_date(self, track_id: str, date_str: str) -> int:
        """특정 트랙과 날짜에 해당하는 다음 발급 일련번호(SEQ)를 조회합니다."""
        # 형태: SS-{track_id}-{date_str}-%
        prefix = f"SS-{track_id}-{date_str}-"
        query = """
        SELECT license_number 
        FROM licenses 
        WHERE license_number LIKE ? 
        ORDER BY id DESC LIMIT 1
        """
        with self._get_connection() as conn:
            result = conn.execute(query, (prefix + '%',)).fetchone()
            if result:
                last_number = result['license_number']
                # SS-SS014-20260223-01 -> 01 파싱
                try:
                    seq_str = last_number.split("-")[-1]
                    return int(seq_str) + 1
                except ValueError:
                    return 1
            return 1

    def save_json_log(self, license_number: str, log_data: dict):
        """JSON 포맷의 최종 처리 로그를 파일로 백업 저장합니다."""
        filename = f"{license_number}_log.json"
        filepath = os.path.join(Config.LOGS_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)

db_manager = DBManager()
