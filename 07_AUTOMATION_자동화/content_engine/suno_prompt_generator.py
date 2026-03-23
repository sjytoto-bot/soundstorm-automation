"""
suno_prompt_generator.py

Suno AI 음악 생성 프롬프트 자동 생성.

Suno 프롬프트 구조:
  {mood}, {instruments}, {style}, {atmosphere}

최적화 원칙:
  - 쉼표로 구분된 태그 형식
  - 악기 + 분위기 + 장르 조합
  - "no vocals" 포함 (BGM 목적)
"""

from __future__ import annotations

# ─── 테마별 Suno 태그 매핑 ────────────────────────────────────────────────────

_THEME_PROMPTS: dict[str, dict[str, list[str]]] = {
    "samurai": {
        "mood":        ["epic", "powerful", "intense"],
        "instruments": ["taiko drums", "koto", "shakuhachi", "orchestra"],
        "style":       ["cinematic", "orchestral", "japanese"],
        "atmosphere":  ["dark", "honorable", "battle-ready"],
    },
    "battle": {
        "mood":        ["epic", "intense", "heroic"],
        "instruments": ["war drums", "brass orchestra", "choir"],
        "style":       ["cinematic", "orchestral", "epic"],
        "atmosphere":  ["powerful", "dramatic", "climactic"],
    },
    "assassin": {
        "mood":        ["dark", "tense", "mysterious"],
        "instruments": ["strings", "electronic bass", "percussion"],
        "style":       ["cinematic", "dark electronic", "thriller"],
        "atmosphere":  ["stealth", "dangerous", "suspenseful"],
    },
    "dungeon": {
        "mood":        ["dark", "mysterious", "ominous"],
        "instruments": ["organ", "choir", "low strings", "ambient pads"],
        "style":       ["fantasy", "dark ambient", "rpg"],
        "atmosphere":  ["eerie", "ancient", "underground"],
    },
    "ambient": {
        "mood":        ["calm", "peaceful", "atmospheric"],
        "instruments": ["piano", "ambient pads", "soft strings"],
        "style":       ["lofi", "ambient", "chill"],
        "atmosphere":  ["relaxing", "meditative", "floating"],
    },
    "horror": {
        "mood":        ["terrifying", "unsettling", "dark"],
        "instruments": ["dissonant strings", "piano", "electronic noise"],
        "style":       ["horror", "dark cinematic", "suspense"],
        "atmosphere":  ["scary", "tense", "creepy"],
    },
    "celtic": {
        "mood":        ["mystical", "adventurous", "uplifting"],
        "instruments": ["fiddle", "tin whistle", "bodhran", "harp"],
        "style":       ["celtic", "folk", "fantasy"],
        "atmosphere":  ["magical", "nature", "ancient"],
    },
    "viking": {
        "mood":        ["epic", "fierce", "heroic"],
        "instruments": ["war drums", "horn", "male choir", "strings"],
        "style":       ["viking", "nordic", "epic orchestral"],
        "atmosphere":  ["savage", "glorious", "ancient"],
    },
    "ritual": {
        "mood":        ["mystical", "ceremonial", "dark"],
        "instruments": ["tribal drums", "chanting", "didgeridoo", "ambient"],
        "style":       ["tribal", "dark ambient", "ritual"],
        "atmosphere":  ["ancient", "spiritual", "intense"],
    },
}

_DEFAULT_PROMPT: dict[str, list[str]] = {
    "mood":        ["epic", "powerful"],
    "instruments": ["orchestra", "drums", "choir"],
    "style":       ["cinematic", "orchestral"],
    "atmosphere":  ["dramatic", "intense"],
}


def _get_theme_tags(theme: str) -> dict[str, list[str]]:
    tl = theme.lower()
    for key, tags in _THEME_PROMPTS.items():
        if key in tl:
            return tags
    return _DEFAULT_PROMPT


def generate_suno_prompt(
    theme: str,
    keywords: list[str] | None = None,
) -> str:
    """
    Suno AI 음악 생성 프롬프트 생성.

    Args:
        theme:    콘텐츠 테마
        keywords: 추가 분위기 키워드 (있으면 atmosphere에 추가)

    Returns:
        쉼표 구분 태그 문자열
        예: "epic, powerful, taiko drums, koto, cinematic, dark, no vocals"
    """
    tags = _get_theme_tags(theme)

    parts: list[str] = []
    parts.extend(tags.get("mood", [])[:2])
    parts.extend(tags.get("instruments", [])[:3])
    parts.extend(tags.get("style", [])[:2])
    parts.extend(tags.get("atmosphere", [])[:2])

    # 키워드 보강 (최대 2개)
    if keywords:
        for kw in keywords[:2]:
            kw = kw.strip().lower()
            if kw and kw not in parts:
                parts.append(kw)

    parts.append("no vocals")

    return ", ".join(parts)
