from pathlib import Path

# 현재 파일 기준
CURRENT_FILE = Path(__file__).resolve()


def find_project_root(start_path: Path) -> Path:
    """
    SOUNDSTORM 루트를 자동 탐색한다.
    기준:
    - 07_AUTOMATION_자동화 존재
    - 99_SYSTEM 존재
    """
    for parent in start_path.parents:
        if (parent / "07_AUTOMATION_자동화").exists() and \
           (parent / "99_SYSTEM").exists():
            return parent
    raise RuntimeError("SOUNDSTORM root not found")


PROJECT_ROOT = find_project_root(CURRENT_FILE)

# 레이어 정의
STORE_DIR = PROJECT_ROOT / "04_STORE_스토어"
HOMEPAGE_DIR = PROJECT_ROOT / "05_Homepage_홈페이지"
BRAND_DIR = PROJECT_ROOT / "06_BRAND_브랜드"
AUTOMATION_DIR = PROJECT_ROOT / "07_AUTOMATION_자동화"
SYSTEM_DIR = PROJECT_ROOT / "99_SYSTEM"

# 인증 정보
CREDENTIALS_DIR = AUTOMATION_DIR / "credentials"
WORKSPACE_DIR = PROJECT_ROOT / "01_WORKSPACE"

# 보호 자산
MASTER_AUDIO_DIR = PROJECT_ROOT / "00_BRAND_ASSETS" / "MASTER_AUDIO"
