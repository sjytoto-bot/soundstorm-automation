import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.core.mail_sender import send_license_email
from license_engine.config import Config

def test_smtp():
    print(f"SMTP Server: {Config.SMTP_SERVER}:{Config.SMTP_PORT}")
    print(f"SMTP User: {Config.SMTP_USER}")
    
    # 더미 PDF 파일 생성
    dummy_pdf = "test_dummy.pdf"
    with open(dummy_pdf, "wb") as f:
        f.write(b"%PDF-1.4\n%Dummy PDF for testing\n")
        
    try:
        # 이메일 발송
        send_license_email(
            buyer_email="sjytoto@gmail.com",
            license_number="SS-TEST-20260223-99",
            drive_link="https://drive.google.com/test",
            pdf_path=dummy_pdf
        )
        print("✅ SMTP 메일 발송 성공!")
    except Exception as e:
        print(f"❌ SMTP 메일 발송 실패: {str(e)}")
    finally:
        os.remove(dummy_pdf)

if __name__ == "__main__":
    test_smtp()
