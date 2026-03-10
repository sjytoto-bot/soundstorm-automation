import os
import sys
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from license_engine.config import Config

# Cloud Run 환경에서는 guard 모듈이 없으므로 graceful fallback 적용
try:
    _AUTOMATION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
    if _AUTOMATION_ROOT not in sys.path:
        sys.path.insert(0, _AUTOMATION_ROOT)
    from guard.path_rules import get_license_pdf_path  # noqa: E402
except ModuleNotFoundError:
    # Cloud Run: /tmp 임시 폴더 사용
    def get_license_pdf_path(license_number: str) -> str:
        tmp_dir = "/tmp/license_output"
        os.makedirs(tmp_dir, exist_ok=True)
        return os.path.join(tmp_dir, f"{license_number}_license.pdf")

class PDFRenderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(self.message)

def render_license_pdf(
    buyer_name: str,
    track_title: str,
    license_number: str,
    qr_base64: str,
    track_id: str = "",
    license_type: str = "permanent",
    issue_date: str = ""
) -> str:
    """
    Jinja2 템플릿 엔진과 WeasyPrint를 사용하여 라이선스 발급용 PDF 파일을 생성합니다.
    생성된 PDF의 로컬 임시 파일 절대 경로를 반환합니다.
    """
    try:
        # Jinja2 환경 로드
        env = Environment(loader=FileSystemLoader(Config.TEMPLATES_DIR))
        template = env.get_template('soundstorm_license_TEMPLATE.html')
        
        from datetime import datetime
        if not issue_date:
            issue_date = datetime.now().strftime("%Y년 %m월 %d일")

        # 템플릿 변수 치환
        html_out = template.render(
            buyer_name=buyer_name,
            track_title=track_title,
            license_number=license_number,
            qr_base64=qr_base64,
            track_id=track_id,
            license_type=license_type,
            issue_date=issue_date
        )
        
        # 출력 파일 경로 — Guard 모듈을 통해 경로 결정 (하드코딩 금지)
        output_path = get_license_pdf_path(license_number)
        
        # HTML 렌더링 결과물을 base_url을 지정하여 WeasyPrint 로 PDF 캐스팅
        HTML(string=html_out, base_url=Config.TEMPLATES_DIR).write_pdf(output_path)
        
        return output_path
        
    except Exception as e:
        raise PDFRenderError("ERR004", f"PDF 문서 생성 중 오류가 발생했습니다: {str(e)}")
