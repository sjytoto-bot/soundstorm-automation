#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/thumbnail_generate_api.py

Flask Blueprint — Pillow 기반 서버 사이드 썸네일 생성

엔드포인트:
    POST /api/thumbnail/generate   — 이미지 + 텍스트 → 썸네일 생성
    GET  /generated_thumbnails/<filename>  — 생성된 썸네일 서빙
    GET  /uploads/<filename>               — 업로드 이미지 서빙
    GET  /api/thumbnail/templates          — 사용 가능한 템플릿 목록

요청 형식 (multipart/form-data):
    image     : 이미지 파일 (필수)
    text      : 카피 문구 (기본: SOUNDSTORM)
    template  : 템플릿 이름 (기본: default)

응답:
    {
        "thumbnail_url": "/generated_thumbnails/thumbnail_samurai_battle_ab1c.jpg",
        "text": "SAMURAI BATTLE",
        "template": "battle",
        "size": "1280x720"
    }
"""

import json
import sys
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR       = Path(__file__).parent
sys.path.insert(0, str(_THIS_DIR))

UPLOAD_DIR      = _THIS_DIR / "uploads"
OUTPUT_DIR      = _THIS_DIR / "generated_thumbnails"
TEMPLATES_FILE  = _THIS_DIR / "templates" / "thumbnail_templates.json"
FONTS_DIR       = _THIS_DIR / "fonts"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

from template_engine import apply_template

# ─── Blueprint ────────────────────────────────────────────────────────────────
generate_bp = Blueprint("generate_api", __name__)


# ─── 템플릿 로드 ──────────────────────────────────────────────────────────────
def _load_templates() -> dict:
    if TEMPLATES_FILE.exists():
        return json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
    return {}


def _build_template_config(template_name: str) -> dict:
    """템플릿 이름 → template_engine용 config dict 변환"""
    templates  = _load_templates()
    tmpl       = templates.get(template_name) or templates.get("default") or {}

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


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────
@generate_bp.route("/api/thumbnail/generate", methods=["POST", "OPTIONS"])
def generate_thumbnail():
    """
    POST multipart/form-data
        image    — 이미지 파일
        text     — 카피 문구
        template — 템플릿 이름 (battle / assassin / oriental / minimal / default)
    """
    if request.method == "OPTIONS":
        return "", 204

    # ── 파일 수신 ──
    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "image 파일 없음"}), 400

    text              = (request.form.get("text") or "SOUNDSTORM").strip().upper()
    template_name     = (request.form.get("template") or "default").strip().lower()
    position_override = (request.form.get("position") or "").strip().lower() or None

    # ── 업로드 저장 ──
    ext        = Path(file.filename).suffix.lower() or ".jpg"
    image_id   = uuid.uuid4().hex[:8]
    image_path = UPLOAD_DIR / f"upload_{image_id}{ext}"
    file.save(str(image_path))
    print(f"[generate_api] 업로드 완료: {image_path.name}")

    # ── 출력 파일명 ──
    safe_text   = "".join(c if c.isalnum() else "_" for c in text.lower())[:30]
    output_name = f"thumbnail_{safe_text}_{image_id}.jpg"
    output_path = OUTPUT_DIR / output_name

    # ── Pillow 합성 ──
    try:
        cfg = _build_template_config(template_name)
        if position_override:
            cfg["position"] = position_override
        apply_template(
            image_source=str(image_path),
            copy_text=text,
            template_config=cfg,
            output_path=str(output_path),
        )
    except Exception as e:
        print(f"[generate_api] 합성 실패: {e}")
        return jsonify({"error": f"썸네일 생성 실패: {e}"}), 500

    print(f"[generate_api] 생성 완료: {output_name}")
    return jsonify({
        "thumbnail_url": f"/generated_thumbnails/{output_name}",
        "text":          text,
        "template":      template_name,
        "size":          "1280x720",
    })


@generate_bp.route("/api/thumbnail/templates", methods=["GET"])
def list_templates():
    """사용 가능한 템플릿 목록 반환"""
    templates = _load_templates()
    return jsonify({
        "templates": list(templates.keys()),
        "configs":   templates,
    })


# ─── Static 서빙 ─────────────────────────────────────────────────────────────
@generate_bp.route("/generated_thumbnails/<path:filename>")
def serve_generated(filename):
    return send_from_directory(str(OUTPUT_DIR), filename)


@generate_bp.route("/uploads/<path:filename>")
def serve_uploads(filename):
    return send_from_directory(str(UPLOAD_DIR), filename)
