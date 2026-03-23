"""
create_studio_session.py
YouTube Studio 로그인 세션 저장 스크립트 v3.0 (UC 방식)

방식:
    undetected_chromedriver (UC)를 사용하여 Google 봇 감지를 우회한 후
    wldyd032 계정으로 YouTube Studio에 로그인합니다.
    로그인 후 세션 프로필이 UC_PROFILE_DIR에 저장됩니다.

사용법:
    python3 create_studio_session.py

이후 자동 다운로드:
    python3 download_studio_csv.py
"""

import sys
import os
import types
import time
from pathlib import Path

# ─── Python 3.14 distutils 패치 ─────────────────────────────────────────────
def _patch_distutils():
    class LooseVersion:
        def __init__(self, v=None):
            self.vstring = v or ''
            self.version = [int(x) for x in self.vstring.split('.') if x.isdigit()]
        def __str__(self): return self.vstring
        def __lt__(self, o): return self.version < o.version
        def __le__(self, o): return self.version <= o.version
        def __eq__(self, o): return self.version == o.version
        def __ge__(self, o): return self.version >= o.version
        def __gt__(self, o): return self.version > o.version
    m  = types.ModuleType('distutils')
    mv = types.ModuleType('distutils.version')
    mv.LooseVersion = LooseVersion
    m.version = mv
    sys.modules.setdefault('distutils', m)
    sys.modules.setdefault('distutils.version', mv)

_patch_distutils()

import undetected_chromedriver as uc

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent
UC_PROFILE_DIR  = str(BASE_DIR / 'credentials' / 'uc_profile')  # 재사용 가능한 UC 프로필

STUDIO_HOME     = 'https://studio.youtube.com'
CHANNEL_ID      = 'UCAvSo9RLq0rCy64IH2nm91w'
CHROME_VERSION  = 145

SUCCESS_URL_PATTERNS = [
    f'/channel/{CHANNEL_ID}',
    '/channel/UC',
]


def is_studio_loaded(url: str) -> bool:
    return 'studio.youtube.com/channel/' in url


def main():
    print("=" * 60)
    print("YouTube Studio 세션 생성 (UC 방식)")
    print("=" * 60)
    print(f"프로필 저장 경로: {UC_PROFILE_DIR}")
    print()
    print("Chrome이 열립니다. wldyd032 Google 계정으로 로그인하세요.")
    print("YouTube Studio 메인 화면이 열리면 자동으로 저장됩니다.")
    print()

    os.makedirs(UC_PROFILE_DIR, exist_ok=True)

    options = uc.ChromeOptions()
    options.add_argument(f'--user-data-dir={UC_PROFILE_DIR}')
    options.add_argument('--no-first-run')
    options.add_argument('--no-default-browser-check')

    driver = uc.Chrome(
        options=options,
        use_subprocess=True,
        headless=False,
        version_main=CHROME_VERSION,
    )

    try:
        print("YouTube Studio 접속 중...")
        driver.get(STUDIO_HOME)

        print("로그인 대기 중... (최대 5분)")
        deadline = time.time() + 300
        while time.time() < deadline:
            if is_studio_loaded(driver.current_url):
                print(f"\n로그인 확인 — URL: {driver.current_url}")
                time.sleep(3)
                break
            time.sleep(2)
        else:
            print("❌ 5분 내 로그인이 완료되지 않았습니다.")
            return

        print(f"\n세션 저장 완료: {UC_PROFILE_DIR}")
        print("이제 download_studio_csv.py를 실행하세요.")

    finally:
        driver.quit()


if __name__ == '__main__':
    main()
