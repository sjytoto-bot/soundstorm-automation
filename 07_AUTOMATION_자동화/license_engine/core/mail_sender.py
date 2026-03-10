import smtplib
from email.message import EmailMessage
import os
from license_engine.config import Config

class MailSenderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(self.message)

def send_license_email(buyer_email: str, license_number: str, drive_links: dict | str, pdf_path: str):
    """
    발급이 완료된 라이선스의 PDF를 첨부하고 다운로드 Drive 링크를 포함하여
    구매자에게 이메일을 발송합니다.
    """
    subject = f"[SOUNDSTORM] 라이선스 발급 완료 - {license_number}"
    
    download_text = ""
    if isinstance(drive_links, dict):
        for ext, link in drive_links.items():
            download_text += f"▶ 다운로드 링크 ({ext.upper()}): {link}\n"
    else:
        download_text = f"▶ 다운로드 링크: {drive_links}\n"

    body = f"""안녕하세요, SOUNDSTORM입니다.

요청하신 라이선스가 성공적으로 발급되었습니다.

■ 라이선스 정보
- 라이선스 번호: {license_number}

■ 증명서 (PDF)
본 메일에 라이선스 증명서가 첨부되어 있습니다.

■ 음원 및 증명 파일 다운로드
아래의 링크를 통해 마스터 음원 파일 원본을 다운로드하실 수 있습니다.
(이 다운로드 링크는 보안을 위해 발급 시점으로부터 7일 동안만 유효합니다.)

{download_text}
감사합니다.
SOUNDSTORM 드림
"""

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"SOUNDSTORM <{Config.SMTP_USER}>"
    msg['To'] = buyer_email
    msg.set_content(body)

    # PDF 첨부
    try:
        with open(pdf_path, 'rb') as f:
            pdf_data = f.read()
            pdf_name = os.path.basename(pdf_path)
        msg.add_attachment(pdf_data, maintype='application', subtype='pdf', filename=pdf_name)
    except Exception as e:
        raise MailSenderError("ERR005", f"이메일 발송 전 PDF 첨부 실패: {str(e)}")

    # 이메일 전송 (SMTP 기반)
    try:
        server = smtplib.SMTP(Config.SMTP_SERVER, Config.SMTP_PORT)
        server.starttls()
        # 구글 앱 비밀번호가 필요할 수 있습니다 ('SMTP_PASSWORD'에 사용)
        server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        raise MailSenderError("ERR005", f"이메일 SMTP 발송 실패: {str(e)}")
