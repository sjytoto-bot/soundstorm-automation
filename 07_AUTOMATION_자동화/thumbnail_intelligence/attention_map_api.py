#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/attention_map_api.py

Flask Blueprint — POST /api/thumbnail/attention-map

입력 (둘 중 하나):
    A. multipart/form-data  image=<file>
    B. application/json     {"image_path": "/uploads/upload_xxx.jpg"}

출력:
    {
        "attention_zones": [{"x":120,"y":80,"w":400,"h":300}, ...],
        "heatmap_url":     "/heatmaps/heatmap_upload_xxx.jpg",
        "method":          "spectral_residual"
    }
"""

import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory

_THIS_DIR   = Path(__file__).parent
UPLOAD_DIR  = _THIS_DIR / "uploads"
HEATMAP_DIR = _THIS_DIR / "output" / "heatmaps"

UPLOAD_DIR.mkdir(exist_ok=True)
HEATMAP_DIR.mkdir(parents=True, exist_ok=True)

from attention_map import compute_attention

attention_map_bp = Blueprint("attention_map_api", __name__)


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────
@attention_map_bp.route("/api/thumbnail/attention-map", methods=["POST", "OPTIONS"])
def attention_map():
    if request.method == "OPTIONS":
        return "", 204

    image_path = None

    # ── A. multipart 업로드 ──
    file = request.files.get("image")
    if file and file.filename:
        ext        = Path(file.filename).suffix.lower() or ".jpg"
        image_id   = uuid.uuid4().hex[:8]
        image_path = UPLOAD_DIR / f"attn_{image_id}{ext}"
        file.save(str(image_path))
        print(f"[attention_map_api] 업로드: {image_path.name}")

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
        result = compute_attention(str(image_path), save_heatmap_flag=True)

        heatmap_url = None
        if result.get("heatmap_path"):
            hname       = Path(result["heatmap_path"]).name
            heatmap_url = f"/heatmaps/{hname}"

        return jsonify({
            "attention_zones": result["attention_zones"],
            "heatmap_url":     heatmap_url,
            "method":          result.get("method", "unknown"),
        })
    except Exception as e:
        print(f"[attention_map_api] 분석 실패: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Heatmap 정적 서빙 ────────────────────────────────────────────────────────
@attention_map_bp.route("/heatmaps/<path:filename>")
def serve_heatmap(filename):
    return send_from_directory(str(HEATMAP_DIR), filename)
