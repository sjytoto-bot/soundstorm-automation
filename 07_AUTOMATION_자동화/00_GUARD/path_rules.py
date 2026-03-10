"""
SOUNDSTORM Runtime Guard — Path Rules
======================================
07_AUTOMATION_자동화/00_GUARD/path_rules.py

목적:
  자동 생성 파일(산출물, 로그, 캐시)의 저장 경로를 코드 레벨에서 강제한다.
  이 모듈을 통하지 않는 직접 경로 하드코딩은 금지이다.

허용 저장 경로:
  07_AUTOMATION/03_RUNTIME/cache/
  07_AUTOMATION/03_RUNTIME/temp/
  07_AUTOMATION/03_RUNTIME/logs/
  99_SYSTEM/DATA_SNAPSHOTS/
  99_SYSTEM/LICENSE/DELIVERY/
  99_SYSTEM/LICENSE/LOGS/

차단 경로:
  00_SOUNDSTORM_OS/** → Exception 발생
  08_ARCHIVE/**       → Exception 발생 (자동화 직접 쓰기 금지)

작성일시: 2026-02-25
팀: 운영팀_개발 / 1단계 시스템 안정화
"""

import os
from datetime import datetime
from typing import Optional


# ══════════════════════════════════════════════════════════════
#  ROOT 경로 자동 탐색 (이 파일 위치 기준 상위 폴더 고정)
# ══════════════════════════════════════════════════════════════

_GUARD_DIR = os.path.dirname(os.path.abspath(__file__))          # 00_GUARD/
_AUTOMATION_ROOT = os.path.dirname(_GUARD_DIR)                    # 07_AUTOMATION_자동화/
_SOUNDSTORM_ROOT = os.path.dirname(_AUTOMATION_ROOT)             # SOUNDSTORM/


# ══════════════════════════════════════════════════════════════
#  공식 저장 경로 상수
# ══════════════════════════════════════════════════════════════

RUNTIME_ROOT      = os.path.join(_AUTOMATION_ROOT, "03_RUNTIME")
RUNTIME_CACHE     = os.path.join(RUNTIME_ROOT, "cache")
RUNTIME_TEMP      = os.path.join(RUNTIME_ROOT, "temp")
RUNTIME_LOGS      = os.path.join(RUNTIME_ROOT, "logs")

SYSTEM_ROOT           = os.path.join(_SOUNDSTORM_ROOT, "99_SYSTEM")
SYSTEM_SNAPSHOTS      = os.path.join(SYSTEM_ROOT, "DATA_SNAPSHOTS")
SYSTEM_LICENSE_ROOT   = os.path.join(SYSTEM_ROOT, "LICENSE")
SYSTEM_LICENSE_DELIVERY = os.path.join(SYSTEM_LICENSE_ROOT, "DELIVERY")
SYSTEM_LICENSE_LOGS   = os.path.join(SYSTEM_LICENSE_ROOT, "LOGS")

OS_TEAM_GUIDES        = os.path.join(_SOUNDSTORM_ROOT, "00_SOUNDSTORM_OS", "01_TEAM_GUIDES")
ARCHIVE_TEAM_GUIDES   = os.path.join(_SOUNDSTORM_ROOT, "08_ARCHIVE_보관", "TEAM_GUIDES")


# ══════════════════════════════════════════════════════════════
#  차단 경로 패턴
# ══════════════════════════════════════════════════════════════

_BLOCKED_PATTERNS = [
    "00_SOUNDSTORM_OS",   # OS 헌법 폴더 — 자동화 쓰기 금지
    "08_ARCHIVE_보관",    # 아카이브 폴더 — 직접 자동화 출력 금지
]


# ══════════════════════════════════════════════════════════════
#  Guard 핵심 함수
# ══════════════════════════════════════════════════════════════

class PathGuardError(Exception):
    """허용되지 않은 경로에 쓰기를 시도할 때 발생하는 예외"""
    pass


def validate_write_path(path: str) -> str:
    """
    저장 경로 유효성 검사.
    차단 패턴에 해당하는 경우 PathGuardError를 발생시킨다.

    Args:
        path: 저장하려는 절대 경로

    Returns:
        검사를 통과한 경우 원본 path 반환

    Raises:
        PathGuardError: 차단된 경로에 쓰기 시도 시
    """
    abs_path = os.path.abspath(path)
    
    # 1. 예외적 쓰기 허용 경로 (Whitelist)
    allowed_prefixes = [
        os.path.abspath(RUNTIME_ROOT),
        os.path.abspath(SYSTEM_SNAPSHOTS),
        os.path.abspath(SYSTEM_LICENSE_DELIVERY),
        os.path.abspath(SYSTEM_LICENSE_LOGS),
        os.path.abspath(OS_TEAM_GUIDES),
        os.path.abspath(ARCHIVE_TEAM_GUIDES)
    ]
    
    for allowed in allowed_prefixes:
        # 허용된 경로의 하위 디렉토리인지 확인
        if abs_path.startswith(allowed):
            return abs_path

    # 2. 명시적 차단 패턴 (OS 루트, 아카이브 직접 쓰기 등)
    for pattern in _BLOCKED_PATTERNS:
        if pattern in abs_path:
            raise PathGuardError(
                f"[GUARD] 경로 쓰기 차단됨: '{pattern}' 포함 경로는 특정 예외 폴더 외에 자동화 출력 대상이 아닙니다.\n"
                f"  시도 경로: {abs_path}"
            )
            
    # 3. 그 외 보호되지 않은 비공식 경로 차단 (Strict Mode)
    raise PathGuardError(
        f"[GUARD] 비공식 경로 쓰기 차단됨: Guard에 정의된 공식 경로가 아닙니다.\n"
        f"  시도 경로: {abs_path}"
    )


def _ensure(path: str) -> str:
    """경로 생성 후 반환 (validate_write_path 포함)"""
    validated = validate_write_path(path)
    os.makedirs(validated, exist_ok=True)
    return validated


# ══════════════════════════════════════════════════════════════
#  공개 API
# ══════════════════════════════════════════════════════════════

def get_runtime_path(type: str) -> str:
    """
    03_RUNTIME/ 하위 경로 반환.

    Args:
        type: "cache" | "temp" | "log"

    Returns:
        해당 타입의 절대 경로 (없으면 자동 생성)

    Raises:
        ValueError: 지원하지 않는 type
    """
    mapping = {
        "cache": RUNTIME_CACHE,
        "temp":  RUNTIME_TEMP,
        "log":   RUNTIME_LOGS,
        "logs":  RUNTIME_LOGS,
    }
    if type not in mapping:
        raise ValueError(f"[GUARD] 지원하지 않는 runtime type: '{type}'. 허용: {list(mapping.keys())}")
    return _ensure(mapping[type])


def get_snapshot_path(date_str: Optional[str] = None) -> str:
    """
    99_SYSTEM/DATA_SNAPSHOTS/YYYY-MM-DD/ 경로 반환.

    Args:
        date_str: "YYYY-MM-DD" 형식. None이면 오늘 날짜 사용.

    Returns:
        날짜 하위 폴더 절대 경로 (없으면 자동 생성)
    """
    date_str = date_str or datetime.now().strftime("%Y-%m-%d")
    return _ensure(os.path.join(SYSTEM_SNAPSHOTS, date_str))


def get_os_team_guides_path() -> str:
    """
    00_SOUNDSTORM_OS/01_TEAM_GUIDES 경로 반환 (OS 파일 덮어쓰기 허용).
    Returns:
        절대 경로 (없으면 자동 생성)
    """
    return _ensure(OS_TEAM_GUIDES)


def get_archive_team_guides_path() -> str:
    """
    08_ARCHIVE_보관/TEAM_GUIDES 경로 반환 (팀가이드 백업용).
    Returns:
        절대 경로 (없으면 자동 생성)
    """
    return _ensure(ARCHIVE_TEAM_GUIDES)


def get_license_delivery_path() -> str:
    """
    99_SYSTEM/LICENSE/DELIVERY/ 경로 반환.
    PDF 라이선스 최종 저장 위치.

    Returns:
        절대 경로 (없으면 자동 생성)
    """
    return _ensure(SYSTEM_LICENSE_DELIVERY)


def get_license_log_path() -> str:
    """
    99_SYSTEM/LICENSE/LOGS/ 경로 반환.
    라이선스 발급 로그 저장 위치.

    Returns:
        절대 경로 (없으면 자동 생성)
    """
    return _ensure(SYSTEM_LICENSE_LOGS)


def get_license_pdf_path(license_number: str) -> str:
    """
    라이선스 PDF 파일의 최종 저장 전체 경로 반환.

    Args:
        license_number: 라이선스 번호 (파일명 기반)

    Returns:
        "{DELIVERY_DIR}/{license_number}_license.pdf" 절대 경로
    """
    delivery_dir = get_license_delivery_path()
    return os.path.join(delivery_dir, f"{license_number}_license.pdf")


# ══════════════════════════════════════════════════════════════
#  Guard 자체 무결성 테스트
# ══════════════════════════════════════════════════════════════

def run_self_test() -> dict:
    """
    Guard 모듈 자체 무결성 테스트.
    정상 경로 조회 + 차단 경로 감지 여부를 확인한다.

    Returns:
        테스트 결과 dict
    """
    results = {}

    # 정상 경로 테스트
    try:
        p = get_runtime_path("cache")
        results["runtime_cache"] = f"✅ PASS → {p}"
    except Exception as e:
        results["runtime_cache"] = f"❌ FAIL: {e}"

    try:
        p = get_runtime_path("log")
        results["runtime_log"] = f"✅ PASS → {p}"
    except Exception as e:
        results["runtime_log"] = f"❌ FAIL: {e}"

    try:
        p = get_snapshot_path()
        results["snapshot"] = f"✅ PASS → {p}"
    except Exception as e:
        results["snapshot"] = f"❌ FAIL: {e}"

    try:
        p = get_license_delivery_path()
        results["license_delivery"] = f"✅ PASS → {p}"
    except Exception as e:
        results["license_delivery"] = f"❌ FAIL: {e}"

    try:
        p = get_license_log_path()
        results["license_log"] = f"✅ PASS → {p}"
    except Exception as e:
        results["license_log"] = f"❌ FAIL: {e}"

    # 차단 경로 테스트 — OS 폴더
    try:
        validate_write_path(os.path.join(_SOUNDSTORM_ROOT, "00_SOUNDSTORM_OS", "test.txt"))
        results["block_os"] = "❌ FAIL: OS 폴더 차단 실패"
    except PathGuardError:
        results["block_os"] = "✅ PASS: OS 폴더 차단 정상"

    # 차단 경로 테스트 — Archive 폴더
    try:
        validate_write_path(os.path.join(_SOUNDSTORM_ROOT, "08_ARCHIVE_보관", "test.txt"))
        results["block_archive"] = "❌ FAIL: Archive 폴더 차단 실패"
    except PathGuardError:
        results["block_archive"] = "✅ PASS: Archive 폴더 차단 정상"

    return results


if __name__ == "__main__":
    print("=" * 60)
    print("  SOUNDSTORM Runtime Guard — Self Test")
    print("=" * 60)
    results = run_self_test()
    for key, val in results.items():
        print(f"  [{key}] {val}")
    print("=" * 60)
    all_pass = all("✅" in v for v in results.values())
    print(f"\n  최종 결과: {'✅ 전체 통과' if all_pass else '❌ 일부 실패'}")
