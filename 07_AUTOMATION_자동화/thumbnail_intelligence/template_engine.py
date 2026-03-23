#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/template_engine.py

Pillow 기반 썸네일 합성 엔진

흐름:
    background image (URL or local path)
    ↓ resize → 1280x720
    ↓ draw text (copy) with stroke
    ↓ export → output/thumbnail_output.jpg

의존 패키지:
    pip install Pillow requests
"""

import io
import json
import os
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR      = Path(__file__).parent
FONTS_DIR      = _THIS_DIR / "fonts"
OUTPUT_DIR     = _THIS_DIR / "output"
TEMPLATE_JSON  = _THIS_DIR / "thumbnail_template.json"

BEBAS_NEUE_TTF = FONTS_DIR / "BebasNeue-Regular.ttf"
BEBAS_NEUE_URL = "https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW4.ttf"

OUTPUT_DIR.mkdir(exist_ok=True)
FONTS_DIR.mkdir(exist_ok=True)


# ─── 폰트 관리 ────────────────────────────────────────────────────────────────
def _ensure_bebas_neue():
    """Bebas Neue 폰트 파일 확보 (없으면 자동 다운로드)"""
    if BEBAS_NEUE_TTF.exists():
        return str(BEBAS_NEUE_TTF)

    print("[template_engine] Bebas Neue 폰트 다운로드 중...")
    try:
        resp = requests.get(BEBAS_NEUE_URL, timeout=15)
        resp.raise_for_status()
        BEBAS_NEUE_TTF.write_bytes(resp.content)
        print(f"  ✅ 다운로드 완료: {BEBAS_NEUE_TTF}")
        return str(BEBAS_NEUE_TTF)
    except Exception as e:
        print(f"  ⚠ 폰트 다운로드 실패: {e}")
        return None


def _get_font(size):
    """폰트 로드 (Bebas Neue → 시스템 Bold → 기본폰트 순 fallback)"""
    font_path = _ensure_bebas_neue()
    if font_path:
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            pass

    # macOS 시스템 Bold 폰트 fallback 순서
    fallbacks = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for fb in fallbacks:
        if Path(fb).exists():
            try:
                return ImageFont.truetype(fb, size)
            except Exception:
                continue

    print("  ⚠ TrueType 폰트 없음 — 기본 폰트 사용 (품질 저하)")
    return ImageFont.load_default()


# ─── 이미지 로드 ──────────────────────────────────────────────────────────────
def load_image(source):
    """
    로컬 경로 또는 URL에서 이미지 로드 → PIL Image (RGB)
    """
    src = str(source).strip()

    if src.startswith("http://") or src.startswith("https://"):
        resp = requests.get(src, timeout=15,
                            headers={"User-Agent": "SOUNDSTORM-Bot/1.0"})
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    else:
        if not Path(src).exists():
            raise FileNotFoundError(f"이미지 파일 없음: {src}")
        img = Image.open(src).convert("RGB")

    return img


# ─── 텍스트 위치 계산 ─────────────────────────────────────────────────────────
def _calc_position(img_w, img_h, text_w, text_h, position, padding_bottom, padding_side):
    """
    position 문자열 → (x, y) 좌표

    지원 위치 (9구역):
        top_left,    top_center,    top_right
        center_left, center,        center_right
        bottom_left, bottom_center, bottom_right
    """
    pos = position.lower().strip()

    # ── Y 축 ──
    if "bottom" in pos:
        y = img_h - text_h - padding_bottom
    elif "top" in pos:
        y = padding_bottom
    else:
        # center, center_left, center_right
        y = (img_h - text_h) // 2

    # ── X 축 — "center" 단독 또는 접미사 _center 구분 ──
    # center_left/center_right의 경우 "center" 가 포함되지만 X는 left/right
    if pos in ("bottom_center", "top_center", "center"):
        x = (img_w - text_w) // 2
    elif pos.endswith("_right") or pos == "right":
        x = img_w - text_w - padding_side
    elif pos.endswith("_left") or pos == "left":
        x = padding_side
    else:
        # fallback: 수평 중앙
        x = (img_w - text_w) // 2

    return x, y


# ─── 텍스트 그리기 ────────────────────────────────────────────────────────────
def _draw_text_with_stroke(draw, text, pos, font, fill_color, stroke_color, stroke_width):
    """
    텍스트 + 외곽선 렌더링
    Pillow 9.2+ 에서 stroke_width 파라미터 지원 — fallback으로 수동 8방향 렌더링
    """
    x, y = pos
    try:
        draw.text(
            (x, y), text, font=font,
            fill=fill_color,
            stroke_width=stroke_width,
            stroke_fill=stroke_color,
        )
    except TypeError:
        # 구버전 Pillow fallback: 수동 외곽선
        offsets = [(-stroke_width, 0), (stroke_width, 0),
                   (0, -stroke_width), (0, stroke_width),
                   (-stroke_width, -stroke_width), (stroke_width, -stroke_width),
                   (-stroke_width, stroke_width), (stroke_width, stroke_width)]
        for dx, dy in offsets:
            draw.text((x + dx, y + dy), text, font=font, fill=stroke_color)
        draw.text((x, y), text, font=font, fill=fill_color)


# ─── 핵심 함수 ────────────────────────────────────────────────────────────────
def apply_template(image_source, copy_text, template_config=None, output_path=None):
    """
    배경 이미지에 카피 문구 합성 → 썸네일 저장

    Args:
        image_source:    이미지 경로 (str/Path) 또는 URL
        copy_text:       카피 문구 (예: "SAMURAI BATTLE")
        template_config: dict 또는 None (None이면 thumbnail_template.json 로드)
        output_path:     저장 경로 (None이면 output/thumbnail_output.jpg)

    Returns:
        str — 저장된 파일 경로
    """
    # 설정 로드
    if template_config is None:
        with open(TEMPLATE_JSON, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        cfg = template_config

    out_w, out_h    = cfg.get("output_size", [1280, 720])
    font_size       = cfg.get("size", 120)
    position        = cfg.get("position", "bottom_center")
    fill_color      = cfg.get("color", "#ffffff")
    stroke_color    = cfg.get("stroke_color", "#000000")
    stroke_width    = cfg.get("stroke_width", 4)
    padding_bottom  = cfg.get("padding_bottom", 60)
    padding_side    = cfg.get("padding_side", 40)
    output_quality  = cfg.get("output_quality", 95)

    # 이미지 로드 + 리사이즈
    print(f"[template_engine] 이미지 로드 중...")
    img  = load_image(image_source)
    img  = img.resize((out_w, out_h), Image.LANCZOS)
    draw = ImageDraw.Draw(img)
    font = _get_font(font_size)

    # 텍스트 크기 측정
    bbox   = draw.textbbox((0, 0), copy_text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # 텍스트가 너무 넓으면 폰트 크기 자동 축소
    max_w = int(out_w * cfg.get("max_width_ratio", 0.85))
    while text_w > max_w and font_size > 30:
        font_size -= 6
        font  = _get_font(font_size)
        bbox  = draw.textbbox((0, 0), copy_text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

    # 위치 계산
    x, y = _calc_position(out_w, out_h, text_w, text_h,
                           position, padding_bottom, padding_side)

    # 텍스트 렌더링
    print(f"[template_engine] 텍스트 렌더링 → \"{copy_text}\" @ ({x},{y}) size={font_size}")
    _draw_text_with_stroke(draw, copy_text, (x, y), font,
                           fill_color, stroke_color, stroke_width)

    # 저장
    if output_path is None:
        output_path = OUTPUT_DIR / "thumbnail_output.jpg"
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    img.save(str(output_path), "JPEG", quality=output_quality)
    print(f"[template_engine] 저장 완료: {output_path}")
    return str(output_path)


# ─── CLI ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="썸네일 템플릿 엔진")
    parser.add_argument("--image",    required=True, help="배경 이미지 경로 또는 URL")
    parser.add_argument("--copy",     required=True, help="카피 문구 (예: SAMURAI BATTLE)")
    parser.add_argument("--output",   default=None,  help="출력 파일 경로 (기본: output/thumbnail_output.jpg)")
    parser.add_argument("--position", default=None,  help="텍스트 위치 (bottom_center 등 오버라이드)")
    args = parser.parse_args()

    cfg = None
    if args.position:
        with open(TEMPLATE_JSON, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["position"] = args.position

    result = apply_template(args.image, args.copy, template_config=cfg, output_path=args.output)
    print(f"\n✅ 완료: {result}")
