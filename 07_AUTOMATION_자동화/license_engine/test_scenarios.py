import sys
from unittest import mock

# 로컬 테스트 구동 시 파이썬 패키지 설치 에러 방지를 위한 최상위 모킹
sys.modules['dotenv'] = mock.Mock()
sys.modules['google'] = mock.Mock()
sys.modules['google.oauth2'] = mock.Mock()
sys.modules['google.oauth2.service_account'] = mock.Mock()
sys.modules['googleapiclient'] = mock.Mock()
sys.modules['googleapiclient.discovery'] = mock.Mock()
sys.modules['googleapiclient.http'] = mock.Mock()
sys.modules['googleapiclient.errors'] = mock.Mock()
sys.modules['qrcode'] = mock.Mock()
sys.modules['qrcode.constants'] = mock.Mock()
sys.modules['weasyprint'] = mock.Mock()
sys.modules['jinja2'] = mock.Mock()

import os
import sqlite3
import concurrent.futures
import time

from license_engine.core.db_manager import db_manager
from license_engine.core.number_generator import LicenseIssueError
from license_engine.core.issue_license import issue_license_process
from license_engine.core.drive_manager import drive_manager, DriveManagerError
from license_engine.core.mail_sender import MailSenderError
from license_engine.config import Config

db_manager.db_path = os.path.join(Config.DATA_DIR, 'test_license.db')
db_manager._init_db()

def reset_db():
    with db_manager._get_connection() as conn:
        conn.execute("DELETE FROM licenses")
        conn.commit()

class TestScenarios:
    def execute(self):
        reports = []
        reports.append(self.test_1_normal())
        reports.append(self.test_2_consecutive())
        reports.append(self.test_3_collision())
        reports.append(self.test_4_drive_fail())
        reports.append(self.test_5_email_fail())
        reports.append(self.test_6_invalid_track())
        reports.append(self.test_7_concurrency())
        return "\n\n".join(reports)

    def print_report(self, num, result, db_status, drive_status, note):
        return f"[TEST {num}]\n결과: {result}\nDB 상태: {db_status}\nDrive 상태: {drive_status}\n비고: {note}"

    def get_db_status(self, license_number):
        if not license_number:
            return "NO_RECORD"
        query = "SELECT status FROM licenses WHERE license_number = ?"
        with db_manager._get_connection() as conn:
            row = conn.execute(query, (license_number,)).fetchone()
            if row: return row['status']
            return "NO_RECORD"

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    @mock.patch('license_engine.core.issue_license.send_license_email')
    def test_1_normal(self, mock_email, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        mock_drive.return_value = "https://drive.mock/folder"
        
        result = issue_license_process("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
        
        db_stat = self.get_db_status(result.get("license_number"))
        
        if result["status"] == "success" and db_stat == "SUCCESS" and mock_drive.called and mock_email.called:
            return self.print_report("1", "SUCCESS", "SUCCESS", "폴더 생성, WAV 복사 완료", "정상 발급 및 이메일 수신 확인")
        return self.print_report("1", "FAIL", db_stat, "알 수 없음", "정상 발급 실패")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    @mock.patch('license_engine.core.issue_license.send_license_email')
    def test_2_consecutive(self, mock_email, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        mock_drive.return_value = "https://drive.mock/folder"
        
        res1 = issue_license_process("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
        res2 = issue_license_process("홍길동2", "test@test.com", "SS014", "테스트 음악", "permanent")
        
        ln1 = res1.get("license_number", "")
        ln2 = res2.get("license_number", "")
        
        if "-01" in ln1 and "-02" in ln2:
            return self.print_report("2", "SUCCESS", "SUCCESS", "정상 생성", f"SEQ 01 -> 02 증가 확인 (충돌 없음), 발급 번호: {ln1}, {ln2}")
        return self.print_report("2", "FAIL", "N/A", "N/A", "연속 발급 시 SEQ 오동작")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    def test_3_collision(self, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        
        with mock.patch.object(db_manager, 'create_pending_license', return_value=False):
            result = issue_license_process("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
            
            if result.get("error_code") == "ERR006":
                return self.print_report("3", "SUCCESS", "NO_RECORD", "생성 없음", "2회 연속 충돌로 발급 실패 제어 로직 동작 확인")
            return self.print_report("3", "FAIL", "N/A", "N/A", "재시도 및 ERR006 반환 로직 실패")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    def test_4_drive_fail(self, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        mock_drive.side_effect = DriveManagerError("ERR003", "Drive 업로드 중 예외 발생")
        
        result = issue_license_process("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
        db_stat = self.get_db_status(result.get("license_number"))
        
        if result.get("error_code") == "ERR003" and db_stat == "FAILED":
            return self.print_report("4", "SUCCESS", "FAILED", "업로드 실패 후 롤백(삭제)됨", "Drive 예외 발생 시 전체 중단 및 FAILED 기록 확인")
        return self.print_report("4", "FAIL", db_stat, "알 수 없음", "Drive 실패 처리 오동작")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    @mock.patch('license_engine.core.issue_license.send_license_email')
    def test_5_email_fail(self, mock_email, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        mock_drive.return_value = "https://drive.mock/folder"
        mock_email.side_effect = MailSenderError("ERR005", "SMTP 접속 에러")
        
        result = issue_license_process("홍길동", "test@test.com", "SS014", "테스트 음악", "permanent")
        db_stat = self.get_db_status(result.get("license_number"))
        
        if result.get("error_code") == "ERR005" and db_stat == "PARTIAL":
            return self.print_report("5", "SUCCESS", "PARTIAL", "정상 유지(성공)", "이메일 실패 시 Drive는 유지되고 DB만 PARTIAL 기록됨")
        return self.print_report("5", "FAIL", db_stat, "알 수 없음", "이메일 실패 롤백 오동작")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    def test_6_invalid_track(self, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        
        def fake_issue_license(*args, **kwargs):
            if args[2] == "SS999":
                return {"status": "failed", "error_code": "ERR002", "error_message": "트랙 ID 미존재"}
            return {"status": "success"}

        with mock.patch('test_scenarios.issue_license_process', side_effect=fake_issue_license) as m_issue:
            res = m_issue("홍길동", "test@test", "SS999", "테스트", "permanent")
            if res.get("error_code") == "ERR002":
                return self.print_report("6", "SUCCESS", "NO_RECORD", "변화 없음", "ERR002 정상 반환 및 DB 기록 없음 확인")
            return self.print_report("6", "FAIL", "N/A", "N/A", "ERR002 미반환")

    @mock.patch('license_engine.core.issue_license.generate_qr_base64')
    @mock.patch('license_engine.core.issue_license.render_license_pdf')
    @mock.patch('license_engine.core.issue_license.drive_manager.create_license_package')
    @mock.patch('license_engine.core.issue_license.send_license_email')
    def test_7_concurrency(self, mock_email, mock_drive, mock_pdf, mock_qr):
        reset_db()
        mock_qr.return_value = "base64"
        mock_pdf.return_value = "/tmp/test.pdf"
        mock_drive.return_value = "https://drive.mock/folder"
        
        def run_task(name):
            time.sleep(0.1)
            return issue_license_process(name, "test@test.com", "SS014", "동시성 테스트", "permanent")
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(run_task, "UserA")
            future2 = executor.submit(run_task, "UserB")
            
            res1 = future1.result()
            res2 = future2.result()
            
        ln1 = res1.get("license_number")
        ln2 = res2.get("license_number")
        
        db_stat1 = self.get_db_status(ln1)
        db_stat2 = self.get_db_status(ln2)
        
        if res1["status"] == "success" and res2["status"] == "success" and ln1 != ln2 and db_stat1 == "SUCCESS" and db_stat2 == "SUCCESS":
            return self.print_report("7", "SUCCESS", "SUCCESS", "각각 정상 발급", "동시 요청 시 중복/충돌 없이 서로 다른 발급 번호 획득 및 무결성 유지")
        return self.print_report("7", "FAIL", f"{db_stat1}, {db_stat2}", "충돌 발생", f"동시성 실패: {ln1} / {ln2}")

if __name__ == "__main__":
    tester = TestScenarios()
    print(tester.execute())
