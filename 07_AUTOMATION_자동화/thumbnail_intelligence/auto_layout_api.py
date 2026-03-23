#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/auto_layout_api.py

Flask Blueprint — POST /api/thumbnail/auto-layout

입력 (둘 중 하나):
    A. multipart/form-data  image=<file>
    B. application/json     {"image_path": "/uploads/upload_xxx.jpg"}

출력:
    {
        "best_position": "top_right",
        "confidence":    0.82,
        "zone_scores":   {"top_left": 0.31, ...}
    }
"""

import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

_THIS_DIR  = Path(__file__).parent
UPLOAD_DIR = _THIS_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

from auto_layout import analyze_zones

auto_layout_bp = Blueprint("auto_layout_api", __name__)


@auto_layout_bp.route("/api/thumbnail/auto-layout", methods=["POST", "OPTIONS"])
def auto_layout():
    if request.method == "OPTIONS":
        return "", 204

    image_path = None

    # ── A. multipart 업로드 ──
    file = request.files.get("image")
    if file and file.filename:
        ext        = Path(file.filename).suffix.lower() or ".jpg"
        image_id   = uuid.uuid4().hex[:8]
        image_path = UPLOAD_DIR / f"layout_{image_id}{ext}"
        file.save(str(image_path))
        print(f"[auto_layout_api] 업로드: {image_path.name}")

    # ── B. JSON image_path ──
    elif request.is_json:
        body  = request.get_json(silent=True) or {}
        rel   = body.get("image_path", "")
        fname = Path(rel).name
        image_path = UPLOAD_DIR / fname
        if not image_path.exists():
            return jsonify({"error": f"파일 없음: {rel}"}), 404

    if not image_path:
        return jsonify({"error": "image 파일 또는 image_path 필요"}), 400

    try:
        result = analyze_zones(str(image_path))
        return jsonify(result)
    except Exception as e:
        print(f"[auto_layout_api] 분석 실패: {e}")
        return jsonify({"error": str(e)}), 500
