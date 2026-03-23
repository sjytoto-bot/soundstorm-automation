#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/api.py

Thumbnail Intelligence Flask API

엔드포인트:
    POST /analyze           — 전체 파이프라인 실행 (다운로드 → 분석 → 저장)
    GET  /results           — 캐시된 분석 결과 반환
    GET  /style             — Style Intelligence JSON 반환
    GET  /health            — 서버 상태 확인

실행:
    cd 07_AUTOMATION_자동화/thumbnail_intelligence
    python3 api.py                  # port 5100 (기본)
    python3 api.py --port 5200      # port 지정

환경변수:
    MASTER_SPREADSHEET_ID   — 마스터 스프레드시트 ID (필수)
    MASTER_WORKSHEET_NAME   — 워크시트 이름 (기본: 마스터)
"""

import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent
_AUTO_ROOT = _THIS_DIR.parent
sys.path.insert(0, str(_THIS_DIR))

from flask import Flask, jsonify, request, make_response

from dataset_builder       import build_dataset
from thumbnail_analyzer    import analyze_batch
from performance_correlator import correlate
from style_engine          import generate_style_intelligence, save_analysis_to_sheets
from style_api             import style_bp
from thumbnail_generate_api import generate_bp
from auto_layout_api        import auto_layout_bp
from attention_map_api      import attention_map_bp
from ab_test_api            import ab_test_bp

# content_engine — STAGE 4
sys.path.insert(0, str(_AUTO_ROOT))
from content_engine.content_pack_api import content_pack_bp

# ─── Flask 앱 ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.register_blueprint(style_bp)
app.register_blueprint(generate_bp)
app.register_blueprint(auto_layout_bp)
app.register_blueprint(attention_map_bp)
app.register_blueprint(ab_test_bp)
app.register_blueprint(content_pack_bp)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024   # 업로드 최대 20MB

# CORS — Electron renderer 에서 localhost 호출 허용
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

# 런타임 캐시 (프로세스 재시작 시 초기화됨)
_cache = {
    "analysis_results": None,
    "correlation_data": None,
    "style_intelligence": None,
    "last_run": None,
}


# ─── 파이프라인 ───────────────────────────────────────────────────────────────
def _run_pipeline(max_items=None, save_to_sheets=True):
    """
    전체 분석 파이프라인 실행

    1. dataset_builder  → Google Sheets 데이터 수집
    2. thumbnail_analyzer → 이미지 다운로드 + OpenCV 분석
    3. performance_correlator → 스타일 × CTR 상관관계
    4. style_engine → Style Intelligence 생성 + Sheets 저장
    """
    print(f"\n{'='*50}")
    print(f"[Thumbnail Intelligence] 파이프라인 시작 {datetime.now():%Y-%m-%d %H:%M:%S}")
    print(f"{'='*50}")

    # Step 1 — 데이터 수집
    print("\n[Step 1] Google Sheets 데이터 수집...")
    dataset = build_dataset()
    if not dataset:
        return {"error": "dataset 비어있음 — MASTER_SPREADSHEET_ID 및 시트 설정 확인"}

    # Step 2 — 썸네일 분석
    print(f"\n[Step 2] {len(dataset)}개 썸네일 분석 중...")
    analysis_results = analyze_batch(dataset, max_items=max_items)

    # Step 3 — 성과 상관관계
    print("\n[Step 3] 성과 상관관계 분석...")
    correlation_data = correlate(analysis_results)

    # Step 4 — Style Intelligence
    print("\n[Step 4] Style Intelligence 생성...")
    style_intelligence = generate_style_intelligence(correlation_data)

    # Step 5 — Sheets 저장
    if save_to_sheets:
        print("\n[Step 5] Google Sheets 저장...")
        try:
            save_analysis_to_sheets(analysis_results)
        except Exception as e:
            print(f"  [warn] Sheets 저장 실패: {e}")

    # 캐시 갱신
    _cache["analysis_results"]  = analysis_results
    _cache["correlation_data"]  = correlation_data
    _cache["style_intelligence"] = style_intelligence
    _cache["last_run"]           = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"\n[파이프라인 완료] {_cache['last_run']}")
    return {
        "status":          "ok",
        "total":           len(analysis_results),
        "success":         len([r for r in analysis_results if not r.get("error")]),
        "style_intelligence": style_intelligence,
    }


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    from pathlib import Path as _P
    cache_exists = (_P(__file__).parent / "output" / "style_intelligence.json").exists()
    return jsonify({
        "status":        "ok",
        "last_run":      _cache["last_run"],
        "cached":        _cache["analysis_results"] is not None,
        "style_cached":  cache_exists,
        "endpoints": [
            "POST /analyze",
            "GET  /results",
            "GET  /style",
            "GET  /correlation",
            "GET  /api/thumbnail/style",
            "POST /api/thumbnail/auto-layout",
            "POST /api/thumbnail/attention-map",
            "POST /api/thumbnail/generate",
            "POST /api/thumbnail/ab-test/create",
            "GET  /api/thumbnail/ab-test/metrics",
            "GET  /api/thumbnail/ab-test/list",
            "POST /api/content-pack/generate-field",
            "POST /api/content-pack/generate-all",
            "GET  /api/content-pack/health",
            "GET  /health",
        ],
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    """전체 파이프라인 실행"""
    body       = request.get_json(silent=True) or {}
    max_items  = body.get("max_items")        # None = 전체
    save       = body.get("save_to_sheets", True)

    try:
        result = _run_pipeline(max_items=max_items, save_to_sheets=save)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/results", methods=["GET"])
def results():
    """캐시된 분석 결과 반환"""
    if not _cache["analysis_results"]:
        return jsonify({"error": "분석 결과 없음 — POST /analyze 먼저 실행"}), 404

    # error 제외 후 반환
    clean = [r for r in _cache["analysis_results"] if not r.get("error")]
    return jsonify({
        "last_run": _cache["last_run"],
        "count":    len(clean),
        "data":     clean,
    })


@app.route("/style", methods=["GET"])
def style():
    """Style Intelligence JSON 반환"""
    if not _cache["style_intelligence"]:
        return jsonify({"error": "Style Intelligence 없음 — POST /analyze 먼저 실행"}), 404

    return jsonify(_cache["style_intelligence"])


@app.route("/correlation", methods=["GET"])
def correlation():
    """스타일별 성과 데이터 반환"""
    if not _cache["correlation_data"]:
        return jsonify({"error": "상관관계 데이터 없음 — POST /analyze 먼저 실행"}), 404

    return jsonify(_cache["correlation_data"])


# ─── CLI 실행 ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Thumbnail Intelligence API")
    parser.add_argument("--port",     type=int,  default=5100,  help="포트 번호 (기본: 5100)")
    parser.add_argument("--host",     type=str,  default="127.0.0.1")
    parser.add_argument("--run-once", action="store_true",
                        help="API 서버 없이 파이프라인 1회 실행 후 종료")
    parser.add_argument("--max",      type=int,  default=None,
                        help="분석할 최대 썸네일 수 (테스트용)")
    args = parser.parse_args()

    if args.run_once:
        result = _run_pipeline(max_items=args.max, save_to_sheets=True)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"\n[Thumbnail Intelligence API] 시작 → http://{args.host}:{args.port}")
        print("  POST /analyze       — 파이프라인 실행")
        print("  GET  /results       — 분석 결과")
        print("  GET  /style         — Style Intelligence")
        print("  GET  /correlation   — 스타일별 성과")
        print("  GET  /health        — 상태 확인\n")
        app.run(host=args.host, port=args.port, debug=False)
