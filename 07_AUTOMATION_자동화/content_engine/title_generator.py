"""
title_generator.py

Content Pack 제목 자동 생성.

전략:
  1. 상위 CTR 영상 패턴 분석 → 구조 추출
  2. 테마 + 키워드 조합
  3. SOUNDSTORM 채널 스타일 유지

패턴:
  {THEME} | {GENRE_KEYWORD} | {MOOD_KEYWORD}
  예: SAMURAI BATTLE | Epic War Drums | Oriental Battle Music
"""

from __future__ import annotations

# ─── 장르/분위기 키워드 매핑 ──────────────────────────────────────────────────
# 테마 키워드 → (genre_keyword, mood_keyword)

_THEME_MAP: dict[str, tuple[str, str]] = {
    "samurai":    ("Epic War Drums",    "Oriental Battle Music"),
    "battle":     ("Epic War Drums",    "Cinematic Battle Music"),
    "assassin":   ("Dark Stealth",      "Cinematic Action Music"),
    "war":        ("Epic Orchestra",    "Cinematic War Music"),
    "dungeon":    ("Dark Ambience",     "Fantasy RPG Music"),
    "stealth":    ("Dark Cinematic",    "Spy Thriller Music"),
    "ambient":    ("Atmospheric",       "Relaxing Ambient Music"),
    "dragon":     ("Epic Fantasy",      "Cinematic Dragon Music"),
    "ninja":      ("Dark Martial Arts", "Oriental Action Music"),
    "warrior":    ("Epic Drums",        "Battle Warrior Music"),
    "ritual":     ("Tribal Drums",      "Ancient Ritual Music"),
    "celtic":     ("Celtic Orchestra",  "Folk Fantasy Music"),
    "gothic":     ("Dark Gothic",       "Symphonic Dark Music"),
    "viking":     ("Nordic Battle",     "Viking Epic Music"),
    "horror":     ("Dark Tension",      "Horror Cinematic Music"),
}

_DEFAULT_GENRE = "Epic Cinematic"
_DEFAULT_MOOD  = "Orchestral Music"


def _match_keyword(theme: str) -> tuple[str, str]:
    """테마에서 장르/분위기 키워드 추출."""
    tl = theme.lower()
    for key, (genre, mood) in _THEME_MAP.items():
        if key in tl:
            return genre, mood
    return _DEFAULT_GENRE, _DEFAULT_MOOD


def generate_title(
    theme: str,
    keywords: list[str] | None = None,
    top_videos: list[dict] | None = None,
) -> str:
    """
    Content Pack 제목 생성.

    Args:
        theme:      콘텐츠 테마 (예: "Samurai Battle")
        keywords:   OpportunityEngine 출력 키워드 (선택)
        top_videos: 상위 CTR 영상 [{title, ctr, views}] (선택)

    Returns:
        생성된 제목 문자열
    """
    theme = theme.strip()
    theme_upper = theme.upper()

    genre_kw, mood_kw = _match_keyword(theme)

    # 키워드가 있으면 mood_kw를 첫 번째 키워드로 보강
    if keywords:
        first_kw = keywords[0].strip().title()
        if first_kw and first_kw.lower() not in theme.lower():
            mood_kw = f"{first_kw} Music"

    return f"{theme_upper} | {genre_kw} | {mood_kw}"
