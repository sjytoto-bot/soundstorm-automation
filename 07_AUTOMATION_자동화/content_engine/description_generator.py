"""
description_generator.py

Content Pack 설명 자동 생성.

패턴:
  1. 테마 기반 Hook 문장
  2. 사용 용도 설명 (keywords 기반 보강)
  3. 플레이리스트 안내
  4. SOUNDSTORM 브랜드 태그라인
"""

from __future__ import annotations

# ─── 용도 문장 매핑 ────────────────────────────────────────────────────────────

_USE_CASES: dict[str, list[str]] = {
    "battle":   ["epic battle scenes", "martial arts demonstrations", "action sequences"],
    "samurai":  ["samurai and warrior themes", "historical dramas", "martial arts content"],
    "assassin": ["stealth action sequences", "spy thriller scenes", "action content"],
    "dungeon":  ["RPG gameplay", "fantasy storytelling", "dungeon exploration content"],
    "ambient":  ["meditation and focus", "study sessions", "relaxation content"],
    "stealth":  ["cinematic spy scenes", "stealth gameplay", "thriller content"],
    "horror":   ["horror game streams", "scary cinematic scenes", "thriller content"],
    "celtic":   ["fantasy adventure content", "nature documentaries", "folk storytelling"],
    "viking":   ["historical epic content", "Norse mythology", "adventure scenes"],
    "ritual":   ["ancient ceremony scenes", "mystical storytelling", "fantasy rituals"],
}

_DEFAULT_USES = ["cinematic experiences", "gaming and streaming", "epic storytelling"]

_BRAND_TAGLINE = "🎵 SOUNDSTORM — Music that moves you."


def _get_use_cases(theme: str) -> list[str]:
    tl = theme.lower()
    for key, uses in _USE_CASES.items():
        if key in tl:
            return uses
    return _DEFAULT_USES


def generate_description(
    theme: str,
    keywords: list[str] | None = None,
    playlist: str | None = None,
) -> str:
    """
    Content Pack 설명 생성.

    Args:
        theme:    콘텐츠 테마
        keywords: 추가 키워드 (설명에 자연스럽게 통합)
        playlist: 플레이리스트 이름 (있으면 안내 추가)

    Returns:
        멀티라인 설명 문자열
    """
    theme = theme.strip()
    uses  = _get_use_cases(theme)

    # 용도 문장 조합
    if len(uses) >= 3:
        use_str = f"{uses[0]}, {uses[1]}, and {uses[2]}"
    elif len(uses) == 2:
        use_str = f"{uses[0]} and {uses[1]}"
    else:
        use_str = uses[0]

    lines: list[str] = []

    # Hook
    lines.append(
        f"Epic {theme} music crafted for {use_str}."
    )
    lines.append("")

    # 키워드 보강 (있으면)
    if keywords:
        kw_str = " · ".join(k.strip() for k in keywords[:4] if k.strip())
        if kw_str:
            lines.append(f"Keywords: {kw_str}")
            lines.append("")

    # 플레이리스트 안내
    if playlist and playlist.strip():
        lines.append(f"📂 Part of the '{playlist.strip()}' playlist.")
        lines.append("")

    # 브랜드
    lines.append(_BRAND_TAGLINE)

    return "\n".join(lines)
