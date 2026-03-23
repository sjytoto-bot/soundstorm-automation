#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/ab_test_api.py

Flask Blueprint — Thumbnail A/B Test API

엔드포인트:
    POST /api/thumbnail/ab-test/create   — A/B 테스트 생성
    GET  /api/thumbnail/ab-test/metrics  — 테스트 결과 조회
    GET  /api/thumbnail/ab-test/list     — 최근 테스트 목록
"""

import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

_THIS_DIR  = Path(__file__).parent
UPLOAD_DIR = _THIS_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

from thumbnail_ab_test import create_ab_test, get_all_tests, get_test

ab_test_bp = Blueprint("ab_test_api", __name__)


# ─── A/B 테스트 생성 ──────────────────────────────────────────────────────────
@ab_test_bp.route("/api/thumbnail/ab-test/create", methods=["POST", "OPTIONS"])
def create():
    if request.method == "OPTIONS":
        return "", 204

    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "image 파일 필요"}), 400

    theme  = (request.form.get("theme")  or "").strip()
    text_a = (request.form.get("text_a") or "").strip().upper() or None
    text_b = (request.form.get("text_b") or "").strip().upper() or None

    if not theme:
        return jsonify({"error": "theme 필요"}), 400

    ext        = Path(file.filename).suffix.lower() or ".jpg"
    image_id   = uuid.uuid4().hex[:8]
    image_path = UPLOAD_DIR / f"ab_{image_id}{ext}"
    file.save(str(image_path))
    print(f"[ab_test_api] 업로드: {image_path.name} | theme={theme}")

    try:
        result = create_ab_test(
            theme=theme,
            image_path=str(image_path),
            text_a=text_a,
            text_b=text_b,
        )
        return jsonify(result)
    except Exception as e:
        print(f"[ab_test_api] 생성 실패: {e}")
        return jsonify({"error": str(e)}), 500


# ─── 테스트 결과 조회 ─────────────────────────────────────────────────────────
@ab_test_bp.route("/api/thumbnail/ab-test/metrics", methods=["GET"])
def metrics():
    """
    ?test_id=xxx  → 특정 테스트 상세
    (없으면 전체)
    """
    test_id = request.args.get("test_id")
    if test_id:
        test = get_test(test_id)
        if not test:
            return jsonify({"error": f"테스트 없음: {test_id}"}), 404
        return jsonify(test)

    tests = get_all_tests()
    return jsonify({"tests": tests, "total": len(tests)})


# ─── 최근 테스트 목록 ─────────────────────────────────────────────────────────
@ab_test_bp.route("/api/thumbnail/ab-test/list", methods=["GET"])
def list_tests():
    """최근 10개 테스트 요약 반환"""
    tests = get_all_tests()[-10:]
    summary = [
        {
            "test_id":    t.get("test_id"),
            "theme":      t.get("theme"),
            "created_at": t.get("created_at"),
            "winner":     t.get("winner"),
            "ctr_a":      t.get("variant_a", {}).get("estimated_ctr"),
            "ctr_b":      t.get("variant_b", {}).get("estimated_ctr"),
        }
        for t in reversed(tests)  # 최신순
    ]
    return jsonify({"tests": summary})
