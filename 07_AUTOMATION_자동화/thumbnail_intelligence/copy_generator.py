#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/copy_generator.py

Theme + Keywords → 썸네일 카피 문구 생성

규칙:
    - 전부 대문자
    - 짧고 강렬 (1~3 단어)
    - 테마 핵심 단어 우선
    - Epic 수식어 자동 조합

사용법:
    python3 copy_generator.py --theme "Samurai Battle"
    python3 copy_generator.py --theme "Dark Assassin" --keywords dark,stealth,shadow
"""

import argparse
import re
from itertools import product

# ─── 테마 단어 → 카피 변환 사전 ──────────────────────────────────────────────
THEME_COPY_MAP = {
    "samurai":   ["SAMURAI", "RONIN", "THE KATANA"],
    "battle":    ["BATTLE", "THE CLASH", "WAR CRY"],
    "assassin":  ["ASSASSIN", "THE SHADOW", "SILENT BLADE"],
    "war":       ["WAR", "WAR DRUMS", "THE SIEGE"],
    "dark":      ["DARKNESS", "THE VOID", "SHADOW REALM"],
    "oriental":  ["ORIENTAL", "DYNASTY", "THE EAST"],
    "royal":     ["ROYAL", "THE THRONE", "PROCESSION"],
    "ghost":     ["GHOST", "THE SPIRIT", "PHANTOM"],
    "dragon":    ["DRAGON", "THE BEAST", "FIRE LORD"],
    "ninja":     ["NINJA", "SHADOW RUN", "THE BLADE"],
    "epic":      ["EPIC", "LEGEND", "THE RISE"],
    "celtic":    ["CELTIC", "THE HIGHLANDS", "ANCIENT WAR"],
    "viking":    ["VIKING", "VALHALLA", "RAGNAROK"],
    "warrior":   ["WARRIOR", "THE CHOSEN", "IRON WILL"],
    "dungeon":   ["DUNGEON", "THE ABYSS", "DARK HALL"],
    "korean":    ["JOSEON", "HANGUK", "THE DYNASTY"],
    "stealth":   ["STEALTH", "SILENT HUNT", "IN THE DARK"],
    "trap":      ["TRAP", "THE DROP", "BASS HITS"],
    "beat":      ["THE BEAT", "BASS LINE", "RHYTHM"],
    "bgm":       ["SCORE", "THEME", "THE MUSIC"],
    "advance":   ["ADVANCE", "MARCH ON", "THE PUSH"],
    "honor":     ["HONOR", "THE CODE", "SWORN OATH"],
    "blood":     ["BLOOD OATH", "CRIMSON", "THE PRICE"],
    "fire":      ["FIRE", "INFERNO", "BLAZE"],
    "siege":     ["SIEGE", "BREACH", "THE WALL"],
    "thunder":   ["THUNDER", "STORM", "LIGHTNING"],
    "sword":     ["SWORD", "THE BLADE", "STEEL"],
}

# Epic 수식어 (테마 앞에 붙일 수 있는 단어)
EPIC_PREFIX = ["EPIC", "DARK", "ANCIENT", "ETERNAL", "IRON", "BLOOD", "SHADOW"]

# 결합형 카피 패턴
COMBO_PATTERNS = [
    "{word1} {word2}",
    "{epic} {word1}",
    "{word1}",
]


def _extract_theme_words(theme):
    """테마 문자열 → 소문자 단어 리스트"""
    return [w.lower() for w in re.split(r"[\s\-_]+", theme)]


def generate_copy_options(theme, keywords=None, max_options=6):
    """
    썸네일 카피 문구 생성

    Args:
        theme:    콘텐츠 테마 (예: "Samurai Battle")
        keywords: 추가 키워드 리스트 (예: ["dark", "stealth"])
        max_options: 반환할 최대 카피 수

    Returns:
        list of str — 대문자 카피 문구 목록
    """
    theme_words = _extract_theme_words(theme)
    extra_words = [kw.lower() for kw in (keywords or [])]
    all_words   = theme_words + extra_words

    options = []
    seen    = set()

    # 1순위: 테마 단어 직접 매핑
    for word in all_words:
        copies = THEME_COPY_MAP.get(word, [])
        for copy in copies:
            if copy not in seen:
                options.append(copy)
                seen.add(copy)

    # 2순위: Epic prefix 조합
    for word in theme_words:
        mapped = THEME_COPY_MAP.get(word, [word.upper()])
        base   = mapped[0]
        for prefix in EPIC_PREFIX[:3]:
            combo = f"{prefix} {base}"
            if combo not in seen:
                options.append(combo)
                seen.add(combo)

    # 3순위: 테마 단어 2개 조합
    if len(theme_words) >= 2:
        pair = f"{theme_words[0].upper()} {theme_words[1].upper()}"
        if pair not in seen:
            options.append(pair)
            seen.add(pair)

    # 4순위: 테마 전체 대문자 (fallback)
    full = theme.upper()
    if full not in seen:
        options.append(full)

    return options[:max_options]


# ─── CLI ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="썸네일 카피 생성기")
    parser.add_argument("--theme",    required=True, help="콘텐츠 테마 (예: Samurai Battle)")
    parser.add_argument("--keywords", default="",
                        help="추가 키워드 쉼표 구분 (예: dark,shadow)")
    args = parser.parse_args()

    kws  = [k.strip() for k in args.keywords.split(",") if k.strip()]
    opts = generate_copy_options(args.theme, keywords=kws)

    print(f"\n[카피 옵션] 테마: {args.theme}")
    for i, opt in enumerate(opts, 1):
        print(f"  {i}. {opt}")
