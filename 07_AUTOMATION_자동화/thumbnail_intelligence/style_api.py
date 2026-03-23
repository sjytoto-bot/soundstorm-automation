#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/style_api.py

Flask Blueprint — GET /api/thumbnail/style

처리 순서:
    1 캐시(output/style_intelligence.json) 확인
    2 캐시 있으면 즉시 반환 (source: "cache")
    3 ?refresh=true 또는 캐시 없으면 Google Sheets → Thumbnail_Analysis 읽기
    4 correlate() → generate_style_intelligence() 실행
    5 캐시 갱신 후 반환 (source: "live")
"""

import json
import sys
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request

# ─── 경로 ─────────────────────────────────────────────────────────────────────
_THIS_DIR   = Path(__file__).parent
_AUTO_ROOT  = _THIS_DIR.parent
STYLE_CACHE = _THIS_DIR / "output" / "style_intelligence.json"

sys.path.insert(0, str(_THIS_DIR))

# ─── Blueprint ────────────────────────────────────────────────────────────────
style_bp = Blueprint("style_api", __name__)


# ─── 캐시 유틸 ────────────────────────────────────────────────────────────────
def _read_cache():
    if STYLE_CACHE.exists():
        return json.loads(STYLE_CACHE.read_text(encoding="utf-8"))
    return None


def _write_cache(data: dict):
    STYLE_CACHE.parent.mkdir(parents=True, exist_ok=True)
    STYLE_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ─── Sheets에서 스타일 재계산 ─────────────────────────────────────────────────
def _compute_from_sheets():
    """
    Google Sheets Thumbnail_Analysis → correlate → generate_style_intelligence

    Returns:
        dict — style_intelligence 결과
    """
    from dataset_builder       import get_client, SPREADSHEET_ID
    from performance_correlator import correlate
    from style_engine          import generate_style_intelligence

    client  = get_client()
    sh      = client.open_by_key(SPREADSHEET_ID)
    ws      = sh.worksheet("Thumbnail_Analysis")
    records = ws.get_all_records()

    if not records:
        raise ValueError("Thumbnail_Analysis 시트가 비어있습니다. api.py --run-once 먼저 실행하세요.")

    # correlate() 입력 포맷으로 변환
    analysis_results = []
    for row in records:
        tags = [t.strip() for t in str(row.get("style_tag", "")).split(",") if t.strip()]
        analysis_results.append({
            "video_id":    row.get("video_id", ""),
            "style_tags":  tags if tags else ["neutral"],
            "style_tag":   row.get("style_tag", ""),
            "brightness":  row.get("brightness", 0),
            "contrast":    row.get("contrast", 0),
            "edge_density": row.get("edge_density", 0),
            "dominant_color": row.get("dominant_color", ""),
            "color_count": row.get("color_count", 0),
            "ctr":         row.get("ctr", 0),
            "views":       row.get("views", 0),
        })

    correlation_data   = correlate(analysis_results)
    style_intelligence = generate_style_intelligence(correlation_data)
    style_intelligence["total_videos"] = len(analysis_results)

    return style_intelligence


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────
@style_bp.route("/api/thumbnail/style", methods=["GET"])
def get_style():
    """
    Style Intelligence 반환

    Query params:
        refresh=true  — 캐시 무시하고 Google Sheets에서 재계산
    """
    refresh = request.args.get("refresh", "false").lower() == "true"

    # ── 캐시 반환 (기본) ──
    if not refresh:
        cached = _read_cache()
        if cached:
            return jsonify({**cached, "source": "cache"})

    # ── Sheets 재계산 ──
    try:
        print(f"[style_api] Sheets 재계산 시작 ({datetime.now():%H:%M:%S})")
        data = _compute_from_sheets()
        _write_cache(data)
        print(f"[style_api] 완료: {data.get('best_style')}")
        return jsonify({**data, "source": "live"})

    except Exception as e:
        print(f"[style_api] 재계산 실패: {e}")
        # Sheets 실패 시 캐시 fallback
        cached = _read_cache()
        if cached:
            return jsonify({**cached, "source": "cache_fallback", "warning": str(e)})
        return jsonify({"error": str(e), "hint": "api.py --run-once 먼저 실행하세요"}), 503
