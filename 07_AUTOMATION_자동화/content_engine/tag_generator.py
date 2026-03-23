"""
tag_generator.py

Content Pack Hashtag + Keyword 자동 생성.

- hashtags: YouTube 설명란 해시태그 (#epicmusic 형식)
- keywords: 검색 최적화 키워드 문구 ("epic battle music" 형식)
"""

from __future__ import annotations
import re

# ─── 테마별 태그 세트 ─────────────────────────────────────────────────────────

_THEME_TAGS: dict[str, list[str]] = {
    "samurai":  ["samurai", "japanese", "oriental", "wardrums", "bushido"],
    "battle":   ["battle", "war", "epic", "wardrums", "cinematic"],
    "assassin": ["assassin", "stealth", "darkcinematic", "spy", "action"],
    "dungeon":  ["dungeon", "rpg", "fantasy", "darkfantasy", "gaming"],
    "ambient":  ["ambient", "lofi", "chillout", "focus", "relaxing"],
    "stealth":  ["stealth", "spy", "thriller", "darkcinematic", "action"],
    "horror":   ["horror", "scary", "dark", "tension", "creepy"],
    "celtic":   ["celtic", "folk", "fantasy", "nature", "mystical"],
    "viking":   ["viking", "nordic", "norse", "epic", "historical"],
    "ritual":   ["ritual", "tribal", "ancient", "mystical", "ceremony"],
    "dragon":   ["dragon", "fantasy", "epic", "fire", "mythical"],
    "warrior":  ["warrior", "battle", "epic", "heroic", "powerful"],
    "ninja":    ["ninja", "martial", "oriental", "stealth", "action"],
    "gothic":   ["gothic", "dark", "symphonic", "horror", "classical"],
}

_BASE_TAGS    = ["epicmusic", "cinematicmusic", "soundstorm", "bgm", "ost"]
_BASE_KEYWORDS = ["epic cinematic music", "soundstorm bgm", "cinematic background music"]


def _slugify(text: str) -> str:
    """태그용 슬러그 변환 (소문자, 영숫자만)."""
    return re.sub(r"[^a-z0-9]", "", text.lower().strip())


def _get_theme_tags(theme: str) -> list[str]:
    tl = theme.lower()
    for key, tags in _THEME_TAGS.items():
        if key in tl:
            return tags
    # 테마 단어 자체를 슬러그로 사용
    words = [_slugify(w) for w in tl.split() if len(w) > 2]
    return words[:3] if words else []


def generate_hashtags(
    theme: str,
    opportunity_keywords: list[str] | None = None,
    max_tags: int = 8,
) -> list[str]:
    """
    YouTube 해시태그 생성 (#tag 형식).

    Args:
        theme:                 콘텐츠 테마
        opportunity_keywords:  OpportunityEngine 키워드 (있으면 우선 포함)
        max_tags:              최대 태그 수 (기본 8)

    Returns:
        ["#epicmusic", "#samurai", ...] 형식 리스트
    """
    tags: list[str] = []

    # 1) 기회 키워드 우선 (최대 3개)
    if opportunity_keywords:
        for kw in opportunity_keywords[:3]:
            slug = _slugify(kw)
            if slug and slug not in tags:
                tags.append(slug)

    # 2) 테마 기반 태그
    for t in _get_theme_tags(theme):
        if t and t not in tags:
            tags.append(t)

    # 3) 기본 태그 보충
    for t in _BASE_TAGS:
        if t not in tags:
            tags.append(t)

    return [f"#{t}" for t in tags[:max_tags]]


def generate_keywords(
    theme: str,
    opportunity_keywords: list[str] | None = None,
    max_keywords: int = 8,
) -> list[str]:
    """
    검색 키워드 문구 생성.

    Args:
        theme:                 콘텐츠 테마
        opportunity_keywords:  OpportunityEngine 키워드
        max_keywords:          최대 키워드 수

    Returns:
        ["samurai battle music", "epic war drums", ...] 형식 리스트
    """
    theme_lower = theme.strip().lower()
    keywords: list[str] = []

    # 1) 테마 기반 핵심 키워드
    keywords.append(f"{theme_lower} music")
    keywords.append(f"epic {theme_lower} music")
    keywords.append(f"{theme_lower} bgm")

    # 2) 기회 키워드 통합
    if opportunity_keywords:
        for kw in opportunity_keywords[:3]:
            kw = kw.strip().lower()
            if kw and kw not in keywords:
                keywords.append(kw)

    # 3) 기본 키워드 보충
    for kw in _BASE_KEYWORDS:
        if kw not in keywords:
            keywords.append(kw)

    return keywords[:max_keywords]
