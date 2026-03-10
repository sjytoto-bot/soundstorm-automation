import qrcode
import base64
from io import BytesIO
from license_engine.config import Config

def generate_qr_base64(license_number: str) -> str:
    """
    주어진 라이선스 번호에 대한 검증 URL을 담은 QR 코드를 생성하고,
    base64 인코딩된 문자열 (data URI 스킴 포함)로 반환합니다.
    """
    verify_url = f"{Config.VERIFY_BASE_URL}/{license_number}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    return f"data:image/png;base64,{img_str}"
