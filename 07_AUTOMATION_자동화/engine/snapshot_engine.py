"""
snapshot_engine.py
SOUNDSTORM Snapshot Automation Engine

기준: SOUNDSTORM_AI_OS_v3.2_STRICT_LOCKED
Spec: Walkthrough v7.1 Production Locked

사용법:
    python3 snapshot_engine.py draft  <팀명>
    python3 snapshot_engine.py approve <팀명>

경로 기준 (Directory Constitution v1.0, Runtime Guard v2.0):
    팀가이드 원본: OS_TEAM_GUIDES 경로
    Draft 저장:   03_RUNTIME/temp/snapshot_drafts/
    Archive 백업: ARCHIVE_TEAM_GUIDES 경로
"""

import os
import sys
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

# 상위 폴더(07_AUTOMATION_자동화)를 로드 경로에 추가 (최소한의 sys.path 조작)
_AUTO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _AUTO_ROOT not in sys.path:
    sys.path.insert(0, _AUTO_ROOT)

from guard.path_rules import (
    get_os_team_guides_path,
    get_archive_team_guides_path,
    get_runtime_path,
    validate_write_path,
    PathGuardError
)


# ─────────────────────────────────────
# CONFIG (Directory Constitution v1.0 기준)
# ─────────────────────────────────────

TEAM_GUIDES_DIR   = Path(get_os_team_guides_path())
SNAPSHOT_DRAFT_DIR = Path(os.path.join(get_runtime_path("temp"), "snapshot_drafts"))
ARCHIVE_DIR        = Path(get_archive_team_guides_path())

MARKER_START = "<!-- SNAPSHOT_START -->"
MARKER_END   = "<!-- SNAPSHOT_END -->"

SPEC_VERSION = "7.1"


# ─────────────────────────────────────
# 하드코딩 경로 자체 검열 (보안 정책)
# ─────────────────────────────────────
_obfuscated_os = "00_SOU" + "NDSTORM_OS/01_T" + "EAM_GUIDES"
_obfuscated_ar = "07_AUT" + "OMATION_자동화/AR" + "CHIVE"

with open(os.path.abspath(__file__), 'r', encoding='utf-8') as _f:
    _code = _f.read()
    # 자체 검열 변수를 제외하고 해당 문자열이 파일 내에 등장하면 차단
    if _code.count(_obfuscated_os) > 1 or _code.count(_obfuscated_ar) > 1:
        raise SystemExit("❌ 보안 위반: snapshot_engine.py 내 금지된 하드코딩 경로가 발견되었습니다.")


# ─────────────────────────────────────
# 메인 진입점
# ─────────────────────────────────────

def main():
    if len(sys.argv) != 3:
        print("사용법: python3 snapshot_engine.py [draft|approve] <팀명>")
        sys.exit(1)

    command   = sys.argv[1].lower()
    team_name = sys.argv[2]

    if command == "draft":
        draft(team_name)
    elif command == "approve":
        approve(team_name)
    else:
        print(f"알 수 없는 명령: {command} (draft 또는 approve 사용)")
        sys.exit(1)


# ─────────────────────────────────────
# DRAFT 모드
# ─────────────────────────────────────

def draft(team_name: str):
    print(f"\n📋 Draft 시작: {team_name}")

    # 1. 팀가이드 파일 로드
    team_file = find_team_file(team_name)
    content   = team_file.read_text(encoding="utf-8")

    # 2. 마커 안전 검사
    safety_check(content, team_name)

    # 3. Snapshot 블록만 추출 (전체 파일 복사 금지)
    snapshot_block = extract_snapshot(content)

    # 4. Draft 파일 저장
    SNAPSHOT_DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    ts         = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    draft_name = f"{team_name}_DRAFT_{ts}.md"
    draft_path = SNAPSHOT_DRAFT_DIR / draft_name

    validate_write_path(str(draft_path))  # Guard 검증
    draft_path.write_text(snapshot_block, encoding="utf-8")

    print(f"  ✓ Draft 생성: {draft_name}")
    print(f"  ✓ 저장 경로: {draft_path}")
    print(f"\n✅ Draft 완료. SNAPSHOT_DRAFT 폴더에서 내용 수정 후 approve 실행.\n")


# ─────────────────────────────────────
# APPROVE 모드
# ─────────────────────────────────────

def approve(team_name: str):
    print(f"\n🚀 Approval 시작: {team_name}")

    # 1. 파일 로드
    team_file       = find_team_file(team_name)
    draft_file      = find_latest_draft(team_name)
    original_content = team_file.read_text(encoding="utf-8")
    new_snapshot     = draft_file.read_text(encoding="utf-8").strip()

    # 2. 마커 안전 검사
    safety_check(original_content, team_name)

    # 3. Snapshot 교체 (substring 기반)
    updated_content = replace_snapshot(original_content, new_snapshot)

    # 4. Fixed Layer 보호 검사 (재탐색 기반 직접 비교)
    fixed_layer_check(original_content, updated_content)
    print("  ✓ Fixed Layer Integrity Verified.")

    # 5. ARCHIVE 백업 (백업 먼저)
    backup_path = backup_file(team_file, original_content, team_name)
    print(f"  ✓ Verified Backup Created: {backup_path.name}")

    # 6. Meta Layer 업데이트
    updated_content = bump_version(updated_content)
    updated_content = update_timestamp(updated_content)
    updated_content = append_change_log(updated_content, team_name)

    # 7. Atomic Replace
    atomic_write(team_file, updated_content)
    print("  ✓ Atomic Replace Successful.")

    # 8. Draft 파일 삭제
    draft_file.unlink()
    print("  ✓ Draft removed from SNAPSHOT_DRAFT folder.")

    print(f"\n✅ Approval 완료: {team_name}\n")


# ─────────────────────────────────────
# 안전 검사
# ─────────────────────────────────────

def safety_check(content: str, team_name: str):
    has_start = MARKER_START in content
    has_end   = MARKER_END in content

    checks = [
        (has_start,
         "SNAPSHOT_START 마커 없음"),
        (has_end,
         "SNAPSHOT_END 마커 없음"),
        (content.count(MARKER_START) == 1,
         f"SNAPSHOT_START 마커 중복 ({content.count(MARKER_START)}개)"),
        (content.count(MARKER_END) == 1,
         f"SNAPSHOT_END 마커 중복 ({content.count(MARKER_END)}개)"),
        # 순서 검사는 둘 다 존재할 때만
        (not (has_start and has_end) or
         content.index(MARKER_START) < content.index(MARKER_END),
         "마커 순서 오류 (START가 END보다 뒤에 있음)"),
    ]

    for ok, msg in checks:
        if not ok:
            raise SystemExit(f"\n❌ Safety Check Failed [{team_name}]: {msg}\n")


def fixed_layer_check(original_content: str, updated_content: str):
    """
    Fixed Layer 보호: 재탐색 기반 직접 비교
    Snapshot 블록을 제거한 나머지 영역이 동일한지 확인
    해시 방식 미사용
    """
    original_fixed = remove_snapshot_block(original_content)
    recomputed_fixed = remove_snapshot_block(updated_content)

    if original_fixed != recomputed_fixed:
        raise SystemExit(
            "\n❌ Fixed Layer Integrity Breach: "
            "Snapshot 외 영역이 변경됨. Approve 중단.\n"
        )


def remove_snapshot_block(content: str) -> str:
    """Snapshot 마커 + 블록 전체 제거 후 반환"""
    start_idx = content.index(MARKER_START)
    end_idx   = content.index(MARKER_END) + len(MARKER_END)
    return content[:start_idx] + content[end_idx:]


# ─────────────────────────────────────
# Snapshot 교체 (substring 기반, 정규식 전역치환 금지)
# ─────────────────────────────────────

def extract_snapshot(content: str) -> str:
    start_idx = content.index(MARKER_START) + len(MARKER_START)
    end_idx   = content.index(MARKER_END)
    return content[start_idx:end_idx].strip()


def replace_snapshot(content: str, new_snapshot: str) -> str:
    start_idx = content.index(MARKER_START) + len(MARKER_START)
    end_idx   = content.index(MARKER_END)

    before = content[:start_idx]
    after  = content[end_idx:]

    return before + "\n" + new_snapshot + "\n" + after


# ─────────────────────────────────────
# Meta Layer 업데이트
# ─────────────────────────────────────

def bump_version(content: str) -> str:
    """
    Version 정책 (확정):
    major.minor 구조, minor += 1
    minor >= 10 → major += 1, minor = 0
    예: 2.9 → 3.0 / 2.8 → 2.9 / 3.9 → 4.0
    float 연산 금지, 정수 연산만 사용
    """
    pattern = re.compile(r'(Version:\s*)(\d+)\.(\d+)')
    match   = pattern.search(content)

    if not match:
        print("  ⚠ Version 필드 없음 → 건너뜀")
        return content

    major = int(match.group(2))
    minor = int(match.group(3))

    minor += 1
    if minor >= 10:
        major += 1
        minor = 0

    new_version = f"{major}.{minor}"
    old_version = f"{match.group(2)}.{match.group(3)}"

    updated = pattern.sub(f"{match.group(1)}{new_version}", content, count=1)
    print(f"  ✓ Version: {old_version} → {new_version}")
    return updated


def update_timestamp(content: str) -> str:
    now = datetime.now(timezone.utc)
    ts  = now.strftime("%Y-%m-%d %H:%M UTC")

    updated = re.sub(r'작성일시:\s*.+', f'작성일시: {ts}', content, count=1)
    print(f"  ✓ 작성일시: {ts}")
    return updated


def append_change_log(content: str, team_name: str) -> str:
    now  = datetime.now(timezone.utc)
    date = now.strftime("%Y-%m-%d")

    # Version 추출 (갱신 후 기준)
    match = re.search(r'Version:\s*(\d+\.\d+)', content)
    ver   = match.group(1) if match else "?"

    entry = f"v{ver} ({date}) - Snapshot 승인 반영 [{team_name}]"

    # Change Log 섹션 찾아서 추가
    log_pattern = re.compile(r'((?:#{1,3}|📝)\s*Change Log\s*\n)')
    if log_pattern.search(content):
        updated = log_pattern.sub(f"\\1{entry}\n", content, count=1)
    else:
        updated = content + f"\n\n## Change Log\n{entry}\n"

    print(f"  ✓ Change Log 추가: {entry}")
    return updated


# ─────────────────────────────────────
# 파일 유틸리티
# ─────────────────────────────────────

def find_team_file(team_name: str) -> Path:
    """팀가이드 파일 탐색 (01_TEAM_GUIDES 경로만 허용)"""
    if not TEAM_GUIDES_DIR.exists():
        raise SystemExit(f"\n❌ 팀가이드 경로 없음: {TEAM_GUIDES_DIR}\n")

    # 정확한 파일명 우선
    exact = TEAM_GUIDES_DIR / f"{team_name}.md"
    if exact.exists():
        return exact

    # 부분 일치 탐색
    matches = list(TEAM_GUIDES_DIR.glob(f"*{team_name}*.md"))
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        raise SystemExit(
            f"\n❌ 팀 파일 중복 ({len(matches)}개): {[m.name for m in matches]}\n"
        )
    else:
        raise SystemExit(f"\n❌ 팀가이드 파일 없음: {team_name}\n")


def find_latest_draft(team_name: str) -> Path:
    """Draft 파일 탐색 - 정확히 1개만 허용"""
    if not SNAPSHOT_DRAFT_DIR.exists():
        raise SystemExit(f"\n❌ SNAPSHOT_DRAFT 폴더 없음: {SNAPSHOT_DRAFT_DIR}\n")

    drafts = list(SNAPSHOT_DRAFT_DIR.glob(f"{team_name}_DRAFT_*.md"))

    if len(drafts) == 0:
        raise SystemExit(f"\n❌ Draft 파일 없음: {team_name}\n")
    elif len(drafts) > 1:
        raise SystemExit(
            f"\n❌ Draft 파일 중복 ({len(drafts)}개). "
            f"SNAPSHOT_DRAFT 폴더에 해당 팀 Draft가 1개만 있어야 합니다.\n"
            f"파일 목록: {[d.name for d in drafts]}\n"
        )

    print(f"  ✓ Single Draft found: {drafts[0].name}")
    return drafts[0]


def backup_file(team_file: Path, content: str, team_name: str) -> Path:
    """ARCHIVE 폴더에 백업 생성"""
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts          = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_name = f"{team_name}_BACKUP_{ts}.md"
    backup_path = ARCHIVE_DIR / backup_name
    
    validate_write_path(str(backup_path))  # Guard 검증
    backup_path.write_text(content, encoding="utf-8")
    return backup_path


def atomic_write(target_path: Path, content: str):
    """
    Atomic Replace:
    .tmp 생성 → flush + fsync → os.replace → tmp 제거
    쓰기 도중 손상 방지
    """
    validate_write_path(str(target_path))  # Guard 검증
    tmp_path = target_path.with_suffix(".tmp")
    validate_write_path(str(tmp_path))     # 임시 파일도 Guard 검증
    
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, target_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


# ─────────────────────────────────────
# 실행
# ─────────────────────────────────────

if __name__ == "__main__":
    main()
