#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/thumbnail_ab_test.py

A/B Test Engine
동일 이미지 + 테마로 2가지 스타일 썸네일을 생성하고
Style Intelligence CTR 히스토리로 성과를 예측한다.

주요 함수:
    create_ab_test(theme, image_path, ...) → test_data dict
    get_test(test_id) → test_data | None
    get_all_tests() → list
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

# ─── 경로 ─────────────────────────────────────────────────────────────────────
_THIS_DIR    = Path(__file__).parent
AB_TEST_FILE = _THIS_DIR / "output" / "thumbnail_tests.json"
OUTPUT_DIR   = _THIS_DIR / "generated_thumbnails"
FONTS_DIR    = _THIS_DIR / "fonts"
TEMPLATES_FILE = _THIS_DIR / "templates" / "thumbnail_templates.json"

AB_TEST_FILE.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ─── 스타일 → 템플릿 매핑 ─────────────────────────────────────────────────────
STYLE_TO_TEMPLATE: dict[str, str] = {
    "high_contrast": "battle",
    "text_overlay":  "default",
    "dark":          "assassin",
    "oriental":      "oriental",
    "minimal":       "minimal",
    "bright":        "default",
    "red_dominant":  "battle",
    "neutral":       "default",
}

# A/B 기본 페어 (Style Intelligence 데이터 없을 때)
DEFAULT_PAIRS = [
    ("battle",   "oriental"),
    ("assassin", "default"),
    ("battle",   "minimal"),
]

# ─── 카피 맵 ──────────────────────────────────────────────────────────────────
_COPY_MAP: dict[str, list[str]] = {
    "samurai":  ["SAMURAI", "RONIN", "THE KATANA"],
    "battle":   ["BATTLE", "THE CLASH", "WAR CRY"],
    "assassin": ["ASSASSIN", "THE SHADOW", "SILENT BLADE"],
    "war":      ["WAR", "WAR DRUMS", "THE SIEGE"],
    "dark":     ["DARKNESS", "THE VOID", "SHADOW REALM"],
    "oriental": ["ORIENTAL", "DYNASTY", "THE EAST"],
    "royal":    ["ROYAL", "THE THRONE", "PROCESSION"],
    "dragon":   ["DRAGON", "THE BEAST", "FIRE LORD"],
    "warrior":  ["WARRIOR", "THE CHOSEN", "IRON WILL"],
    "ghost":    ["GHOST", "THE SPIRIT", "PHANTOM"],
    "ninja":    ["NINJA", "SHADOW RUN", "THE BLADE"],
    "epic":     ["EPIC", "LEGEND", "THE RISE"],
    "viking":   ["VIKING", "VALHALLA", "RAGNAROK"],
}


def _get_copies(theme: str) -> list[str]:
    words   = theme.lower().split()
    options: list[str] = []
    seen:    set[str]  = set()
    for w in words:
        for opt in _COPY_MAP.get(w, [w.upper()]):
            if opt not in seen:
                options.append(opt)
                seen.add(opt)
    if theme.upper() not in seen:
        options.append(theme.upper())
    return options


# ─── 템플릿 설정 ──────────────────────────────────────────────────────────────
def _load_template_config(template_name: str) -> dict:
    templates: dict = {}
    if TEMPLATES_FILE.exists():
        templates = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
    tmpl = templates.get(template_name) or templates.get("default") or {}

    return {
        "font_file":       str(FONTS_DIR / tmpl.get("font", "BebasNeue-Regular.ttf")),
        "position":        tmpl.get("position",     "bottom_center"),
        "size":            tmpl.get("size",         120),
        "color":           tmpl.get("color",        "#ffffff"),
        "stroke_color":    tmpl.get("stroke_color", "#000000"),
        "stroke_width":    tmpl.get("stroke_width", 6),
        "padding_bottom":  tmpl.get("padding_bottom", 60),
        "padding_side":    40,
        "max_width_ratio": 0.85,
        "output_size":     [1280, 720],
        "output_quality":  95,
    }


# ─── Style Intelligence 캐시 읽기 ─────────────────────────────────────────────
def _load_style_cache() -> dict:
    cache = _THIS_DIR / "output" / "style_intelligence.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    return {}


def _select_ab_variants(style_cache: dict) -> tuple[dict, dict]:
    """
    Style Intelligence에서 CTR 상위 2개 스타일 선택

    Returns:
        (info_a, info_b) — 각각 {"style", "template", "estimated_ctr"}
    """
    perf = style_cache.get("style_performance", {})

    if len(perf) >= 2:
        sorted_s = sorted(perf.items(),
                          key=lambda kv: kv[1].get("avg_ctr", 0),
                          reverse=True)
        def _style_info(name: str, data: dict) -> dict:
            return {
                "style":         name,
                "template":      STYLE_TO_TEMPLATE.get(name, "default"),
                "estimated_ctr": round(data.get("avg_ctr", 0), 2),
            }
        # 같은 템플릿이 나오면 다음 순위로 교체
        a_name, a_data = sorted_s[0]
        b_name, b_data = sorted_s[1]
        # 같은 템플릿이면 3번째 스타일 시도
        if STYLE_TO_TEMPLATE.get(a_name) == STYLE_TO_TEMPLATE.get(b_name) and len(sorted_s) > 2:
            b_name, b_data = sorted_s[2]
        return _style_info(a_name, a_data), _style_info(b_name, b_data)

    # fallback: default pair
    return (
        {"style": "high_contrast", "template": "battle",   "estimated_ctr": 0},
        {"style": "text_overlay",  "template": "oriental", "estimated_ctr": 0},
    )


# ─── A/B 테스트 생성 ──────────────────────────────────────────────────────────
def create_ab_test(
    theme:      str,
    image_path: str,
    text_a:     str | None = None,
    text_b:     str | None = None,
    position_a: str | None = None,
    position_b: str | None = None,
) -> dict:
    """
    동일 이미지로 2가지 스타일 썸네일 생성 → A/B 테스트 데이터 반환

    Args:
        theme:      콘텐츠 테마 (예: "Samurai Battle")
        image_path: 배경 이미지 파일 경로
        text_a/b:   각 variant 카피 (None이면 자동 선택)
        position_a/b: 텍스트 위치 (None이면 auto-layout)

    Returns:
        {test_id, theme, created_at, variant_a, variant_b, winner}
    """
    from template_engine import apply_template

    style_cache = _load_style_cache()
    info_a, info_b = _select_ab_variants(style_cache)

    # ── Auto Layout: A = 1위, B = 2위 위치 ──
    if not position_a or not position_b:
        try:
            from auto_layout import analyze_zones
            layout       = analyze_zones(str(image_path))
            sorted_zones = sorted(layout["zone_scores"].items(), key=lambda x: x[1])
            position_a   = position_a or sorted_zones[0][0]
            position_b   = position_b or sorted_zones[1][0]
        except Exception as e:
            print(f"[ab_test] auto-layout 실패: {e}")
            position_a = position_a or "bottom_center"
            position_b = position_b or "top_right"

    # ── 카피 선택 ──
    copies = _get_copies(theme)
    text_a = text_a or (copies[0] if copies else theme.upper())
    text_b = text_b or (copies[1] if len(copies) > 1 else f"THE {copies[0]}")

    # ── 썸네일 2개 생성 ──
    test_id = uuid.uuid4().hex[:8]
    results: dict[str, dict] = {}

    for vid, info, text, position in [
        ("A", info_a, text_a, position_a),
        ("B", info_b, text_b, position_b),
    ]:
        out_name = f"ab_{test_id}_{vid}.jpg"
        out_path = OUTPUT_DIR / out_name

        cfg = _load_template_config(info["template"])
        cfg["position"] = position

        try:
            apply_template(
                image_source=str(image_path),
                copy_text=text,
                template_config=cfg,
                output_path=str(out_path),
            )
            thumbnail_url = f"/generated_thumbnails/{out_name}"
            print(f"[ab_test] Variant {vid} 완료: {out_name}")
        except Exception as e:
            print(f"[ab_test] Variant {vid} 실패: {e}")
            thumbnail_url = None

        results[vid] = {
            "thumbnail_url":   thumbnail_url,
            "template":        info["template"],
            "style":           info["style"],
            "text":            text,
            "position":        position,
            "estimated_ctr":   info["estimated_ctr"],
        }

    # ── 승자 판정 (estimated CTR 기준) ──
    ctr_a = results["A"]["estimated_ctr"]
    ctr_b = results["B"]["estimated_ctr"]

    if ctr_a > 0 or ctr_b > 0:
        winner = "A" if ctr_a >= ctr_b else "B"
    else:
        winner = None

    test_data = {
        "test_id":    test_id,
        "theme":      theme,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "variant_a":  results["A"],
        "variant_b":  results["B"],
        "winner":     winner,
    }

    _save_test(test_data)
    print(f"[ab_test] 완료: {test_id} | winner={winner} | CTR A={ctr_a} B={ctr_b}")
    return test_data


# ─── 저장 / 로드 ──────────────────────────────────────────────────────────────
def _save_test(test_data: dict):
    tests = _load_all_tests()
    tests.append(test_data)
    if len(tests) > 50:    # 최근 50개만 유지
        tests = tests[-50:]
    AB_TEST_FILE.write_text(
        json.dumps({"tests": tests}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_all_tests() -> list:
    if AB_TEST_FILE.exists():
        return json.loads(AB_TEST_FILE.read_text(encoding="utf-8")).get("tests", [])
    return []


def get_test(test_id: str) -> dict | None:
    for t in _load_all_tests():
        if t.get("test_id") == test_id:
            return t
    return None


def get_all_tests() -> list:
    return _load_all_tests()
