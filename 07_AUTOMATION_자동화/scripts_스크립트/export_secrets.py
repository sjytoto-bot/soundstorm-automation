#!/usr/bin/env python3
"""
[SOUNDSTORM] GitHub Secrets 준비 스크립트
=========================================
로컬 인증 파일을 base64로 인코딩하여 GitHub Secrets에 등록할 값을 생성합니다.

사용법:
  python export_secrets.py           # 값 출력만 (복사해서 수동 등록)
  python export_secrets.py --push    # gh CLI로 GitHub Secrets 자동 업데이트

--push 사용 조건:
  - gh CLI 설치: brew install gh
  - 인증: gh auth login (repo 스코프 포함)
  - 또는 환경변수: GH_TOKEN=<PAT with repo scope>
"""

import argparse
import base64
import subprocess
import sys
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR   = SCRIPT_DIR
while ROOT_DIR.name != 'SOUNDSTORM' and ROOT_DIR.parent != ROOT_DIR:
    ROOT_DIR = ROOT_DIR.parent

CREDS_DIR      = ROOT_DIR / "07_AUTOMATION_자동화" / "credentials"
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"

# REPO: gh secret set이 타겟으로 삼을 저장소 (자동 감지 or 하드코딩)
def _detect_repo() -> str:
    try:
        result = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    return ""

# ─── 파일 목록 ───────────────────────────────────────────────────────────────

SECRET_FILES = {
    'SERVICE_ACCOUNT_B64': CREDS_DIR / 'service_account.json',
    'CLIENT_SECRET_B64':   CREDS_DIR / 'client_secret.json',
    'GOOGLE_TOKEN_B64':    CREDS_DIR / 'token.pickle',
}

# ─── gh CLI로 Secret 업데이트 ─────────────────────────────────────────────────

def push_secret(name: str, value: str, repo: str) -> bool:
    """gh CLI를 사용해 GitHub Secret을 업데이트합니다."""
    try:
        result = subprocess.run(
            ["gh", "secret", "set", name, "--repo", repo],
            input=value,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            print(f"  ✅ {name} → GitHub Secrets 업데이트 완료")
            return True
        else:
            print(f"  ❌ {name} 업데이트 실패: {result.stderr.strip()}")
            return False
    except FileNotFoundError:
        print("  ❌ gh CLI가 설치되어 있지 않습니다.")
        print("     설치: brew install gh")
        print("     인증: gh auth login")
        return False
    except Exception as e:
        print(f"  ❌ {name} 업데이트 중 오류: {e}")
        return False


def check_gh_auth() -> bool:
    """gh CLI 인증 상태 확인"""
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False

# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SOUNDSTORM GitHub Secrets 관리")
    parser.add_argument(
        "--push",
        action="store_true",
        help="gh CLI로 GitHub Secrets 자동 업데이트 (gh 인증 필요)",
    )
    parser.add_argument(
        "--token-only",
        action="store_true",
        help="GOOGLE_TOKEN_B64만 업데이트 (토큰 갱신 후 빠른 업데이트용)",
    )
    args = parser.parse_args()

    # ── 파일 수집 ──────────────────────────────────────────────────────────────
    secrets = {}
    missing = []

    targets = (
        {'GOOGLE_TOKEN_B64': SECRET_FILES['GOOGLE_TOKEN_B64']}
        if args.token_only
        else SECRET_FILES
    )

    for secret_name, file_path in targets.items():
        if file_path.exists():
            b64 = base64.b64encode(file_path.read_bytes()).decode()
            secrets[secret_name] = b64
        else:
            missing.append((secret_name, file_path))

    # ── 출력 모드 ─────────────────────────────────────────────────────────────
    print("=" * 60)
    print("🔐 GitHub Secrets 관리")
    print("=" * 60)
    print()

    if missing:
        print("⚠️  누락된 파일:")
        for name, path in missing:
            print(f"   {name}: {path} — 없음")
        print()

    if not args.push:
        # 출력만 모드
        for name, b64 in secrets.items():
            file_path = SECRET_FILES.get(name, Path(name))
            print(f"──── {name} ────")
            print(f"파일: {file_path.name}")
            print(f"길이: {len(b64)} chars")
            print(f"값:")
            print(b64)
            print()

        print(f"──── GOOGLE_SHEETS_ID ────")
        print(f"값: {SPREADSHEET_ID}")
        print()
        print("=" * 60)
        print("위 값들을 GitHub Secrets에 등록하세요:")
        print("  GitHub → Settings → Secrets and variables → Actions")
        print()
        print("⚡ 자동 업데이트 (gh CLI 사용):")
        print("  python export_secrets.py --push")
        print("  python export_secrets.py --push --token-only  # 토큰만 빠르게")
        print("=" * 60)
        return

    # ── 자동 push 모드 ────────────────────────────────────────────────────────
    print("📡 GitHub Secrets 자동 업데이트 모드")
    print()

    # gh CLI 인증 확인
    if not check_gh_auth():
        print("❌ gh CLI 인증이 필요합니다:")
        print("   gh auth login")
        print("   (repo 스코프 포함 필요)")
        sys.exit(1)

    # 저장소 자동 감지
    repo = _detect_repo()
    if not repo:
        print("❌ 저장소를 감지할 수 없습니다.")
        print("   현재 디렉토리가 git 저장소인지 확인하세요.")
        sys.exit(1)

    print(f"📦 대상 저장소: {repo}")
    print()

    # Secrets 업데이트
    success_count = 0
    for name, b64 in secrets.items():
        if push_secret(name, b64, repo):
            success_count += 1

    print()
    print("=" * 60)
    if success_count == len(secrets):
        print(f"✅ {success_count}개 Secret 업데이트 완료")
        if args.token_only or 'GOOGLE_TOKEN_B64' in secrets:
            print()
            print("⚡ 토큰 갱신 반영 확인:")
            print("   GitHub Actions → youtube-data-sync → Run workflow")
    else:
        print(f"⚠️  {success_count}/{len(secrets)}개 성공, {len(secrets)-success_count}개 실패")
        print("   실패한 항목을 수동으로 등록하세요.")
    print("=" * 60)


if __name__ == "__main__":
    main()
