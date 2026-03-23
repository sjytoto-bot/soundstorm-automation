"""
thumbnail_text_generator.py

썸네일 텍스트 자동 생성.

원칙:
  - 최대 2줄
  - 줄당 최대 2단어 (가독성)
  - 강렬한 단어 우선
  - 전부 대문자
"""

from __future__ import annotations

# 제외 단어 (일반 조사/전치사)
_STOP_WORDS = {
    "the", "a", "an", "of", "for", "and", "or", "is", "in", "on",
    "at", "to", "with", "by", "be", "as", "it", "epic", "music",
    "cinematic", "bgm", "ost",
}


def generate_thumbnail_text(
    theme: str,
    title: str | None = None,
) -> str:
    """
    썸네일 오버레이 텍스트 생성.

    Args:
        theme: 콘텐츠 테마 (예: "Samurai Battle")
        title: 생성된 제목 (있으면 핵심 단어 추출에 활용)

    Returns:
        최대 2줄, 줄바꿈으로 구분된 대문자 텍스트
        예: "SAMURAI\nBATTLE"
    """
    # 테마 단어 중 의미 있는 것 우선 추출
    source = theme.strip()
    words = [w for w in source.upper().split() if w.lower() not in _STOP_WORDS]

    if not words:
        words = source.upper().split()

    if len(words) == 1:
        return words[0]

    if len(words) == 2:
        return f"{words[0]}\n{words[1]}"

    # 3단어 이상: 첫 2단어만 (가독성)
    return f"{words[0]}\n{words[1]}"
