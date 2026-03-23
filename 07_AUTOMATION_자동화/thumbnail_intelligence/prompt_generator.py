#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/prompt_generator.py

Content Theme + Style Intelligence → Midjourney 프롬프트 생성

사용법:
    python3 prompt_generator.py --theme "Samurai Battle"
    python3 prompt_generator.py --theme "Dark Assassin" --style dark,red_dominant
"""

import argparse
import sys
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR = Path(__file__).parent
sys.path.insert(0, str(_THIS_DIR))

# ─── 테마 → 시각적 키워드 매핑 ───────────────────────────────────────────────
THEME_KEYWORDS = {
    # 전투 계열
    "battle":       ["epic battlefield", "war chaos", "clash of swords", "smoke and fire"],
    "war":          ["war drums", "marching army", "battlefield horizon", "war banners"],
    "samurai":      ["samurai warrior", "katana silhouette", "feudal japan", "cherry blossom"],
    "assassin":     ["shadow figure", "rooftop silhouette", "hidden blade", "stealth night"],
    "oriental":     ["asian architecture", "lanterns", "misty mountains", "dragon motif"],
    "dark":         ["dark void", "shadow realm", "ominous sky", "moonlit ruins"],
    "epic":         ["epic scale", "god rays", "vast landscape", "heroic pose"],
    "royal":        ["royal procession", "golden throne", "imperial palace", "crown"],
    "dragon":       ["dragon silhouette", "fire breath", "mythical beast", "scales"],
    "warrior":      ["armored warrior", "battle stance", "war paint", "shield and spear"],
    "dungeon":      ["dungeon interior", "torch light", "stone walls", "dark corridors"],
    "ghost":        ["ghost warrior", "ethereal glow", "spirit form", "translucent figure"],
    "ninja":        ["ninja shadow", "shuriken", "black mask", "rooftop sprint"],
    "celtic":       ["celtic knot", "ancient ruins", "misty highlands", "stone circle"],
    "viking":       ["viking longship", "norse runes", "fjord", "battle axe"],
    "korean":       ["korean hanok", "geobukseon", "joseon dynasty", "korean armor"],
    "chinese":      ["great wall", "chinese palace", "red lantern", "pagoda"],
    "japanese":     ["mount fuji", "torii gate", "sakura petals", "japanese temple"],
    "trap":         ["urban night", "neon lights", "gritty street", "smoke"],
    "beat":         ["audio waveform", "bass drop", "music pulse", "sound waves"],
    "bgm":          ["cinematic scene", "score sheet", "orchestra pit", "film reel"],
}

# 스타일 태그 → 분위기 수식어
STYLE_ATMOSPHERE = {
    "dark":          ["dark cinematic", "dramatic lighting", "deep shadows", "moody atmosphere"],
    "red_dominant":  ["red accent lighting", "crimson glow", "blood moon", "scarlet haze"],
    "high_contrast": ["high contrast", "sharp shadows", "bold light and dark", "stark contrast"],
    "minimal":       ["minimalist composition", "clean negative space", "simple elements"],
    "bright":        ["vibrant colors", "golden hour light", "luminous atmosphere"],
    "text_overlay":  ["clear background area", "strong foreground element"],
    "neutral":       ["balanced lighting", "natural atmosphere"],
}

# Midjourney 공통 suffix (품질/스타일 파라미터)
MJ_SUFFIX = "--ar 16:9 --v 6 --style raw --q 2"


def generate_prompt(theme, style_tags=None, extra_keywords=None):
    """
    Midjourney 프롬프트 생성

    Args:
        theme:          콘텐츠 테마 문자열 (예: "Samurai Battle")
        style_tags:     스타일 태그 리스트 (예: ["dark", "high_contrast"])
        extra_keywords: 추가 키워드 리스트 (style_engine 권장 키워드)

    Returns:
        dict — prompt (전체 문자열), keywords (키워드 리스트), mj_prompt (MJ용)
    """
    # 테마 분해 → 키워드 추출
    words = theme.lower().split()
    theme_kws = []
    for word in words:
        for key, kws in THEME_KEYWORDS.items():
            if key in word and kws[0] not in theme_kws:
                theme_kws.extend(kws[:2])

    # fallback: 매핑 없으면 테마 단어 그대로 사용
    if not theme_kws:
        theme_kws = [theme.lower(), "epic cinematic", "dramatic scene"]

    # 스타일 분위기 추가
    atmo_kws = []
    for tag in (style_tags or ["high_contrast", "dark"]):
        for kw in STYLE_ATMOSPHERE.get(tag, [])[:2]:
            if kw not in atmo_kws:
                atmo_kws.append(kw)

    # 추가 키워드 병합 (중복 제거)
    extra = [kw for kw in (extra_keywords or []) if kw not in theme_kws + atmo_kws]

    # 최종 조합: 테마 → 분위기 → 추가
    all_keywords = theme_kws[:3] + atmo_kws[:3] + extra[:2]

    prompt_text = ", ".join(all_keywords)
    mj_prompt   = f"{prompt_text} {MJ_SUFFIX}"

    return {
        "theme":    theme,
        "keywords": all_keywords,
        "prompt":   prompt_text,
        "mj_prompt": mj_prompt,
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Midjourney 프롬프트 생성기")
    parser.add_argument("--theme",  required=True, help="콘텐츠 테마 (예: Samurai Battle)")
    parser.add_argument("--style",  default="dark,high_contrast",
                        help="스타일 태그 쉼표 구분 (기본: dark,high_contrast)")
    args = parser.parse_args()

    style_tags = [s.strip() for s in args.style.split(",")]
    result = generate_prompt(args.theme, style_tags=style_tags)

    print(f"\n{'='*50}")
    print(f"테마: {result['theme']}")
    print(f"{'='*50}")
    print(f"\n[키워드]")
    for kw in result["keywords"]:
        print(f"  • {kw}")
    print(f"\n[Midjourney 프롬프트]")
    print(f"  {result['mj_prompt']}")
