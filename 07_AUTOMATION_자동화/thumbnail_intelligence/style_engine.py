#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/style_engine.py

Style Intelligence 생성 + Google Sheets(Thumbnail_Analysis) 저장

출력 JSON:
    {
        "best_style": ["dark", "red_dominant", "high_contrast"],
        "recommended_prompt_keywords": ["dark cinematic", "red accent", ...],
        "style_performance": {style: {avg_ctr, count}},
        "generated_at": "2026-03-14 12:00:00"
    }

환경변수:
    MASTER_SPREADSHEET_ID — 저장할 스프레드시트 ID
"""

import os
import sys
from datetime import datetime
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent
_AUTO_ROOT = _THIS_DIR.parent
sys.path.insert(0, str(_THIS_DIR))

from performance_correlator import get_top_styles

CREDENTIALS_PATH      = _AUTO_ROOT / "credentials" / "service_account.json"
SCOPES                = ["https://www.googleapis.com/auth/spreadsheets"]
MASTER_SPREADSHEET_ID = os.environ.get(
    "MASTER_SPREADSHEET_ID",
    "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
)
OUTPUT_SHEET_NAME = "Thumbnail_Analysis"

# ─── 스타일 태그 → 프롬프트 키워드 매핑 ──────────────────────────────────────
STYLE_TO_PROMPT = {
    "dark":          ["dark cinematic",      "dramatic lighting",   "dark atmosphere"],
    "red_dominant":  ["red accent",          "crimson lighting",    "bold red"],
    "high_contrast": ["high contrast",       "dramatic shadows",    "sharp definition"],
    "minimal":       ["clean composition",   "minimal elements",    "focused subject"],
    "bright":        ["vibrant atmosphere",  "vivid colors",        "bright mood"],
    "text_overlay":  ["clear text area",     "strong typography"],
    "neutral":       ["balanced composition","natural lighting"],
}


# ─── 인증 ─────────────────────────────────────────────────────────────────────
def _get_client():
    if not CREDENTIALS_PATH.exists():
        raise FileNotFoundError(
            f"service_account.json 없음: {CREDENTIALS_PATH}"
        )
    creds = Credentials.from_service_account_file(str(CREDENTIALS_PATH), scopes=SCOPES)
    return gspread.authorize(creds)


# ─── Style Intelligence 생성 ──────────────────────────────────────────────────
def generate_style_intelligence(correlation_data):
    """
    상관관계 데이터 → Style Intelligence JSON

    Args:
        correlation_data: performance_correlator.correlate() 반환값

    Returns:
        dict — best_style, recommended_prompt_keywords, style_performance, generated_at
    """
    top_styles = get_top_styles(correlation_data, top_n=3)

    best_style = [tag for tag, _ in top_styles]

    # 중복 없이 키워드 수집 (상위 스타일 순서 우선)
    keywords = []
    for tag, _ in top_styles:
        for kw in STYLE_TO_PROMPT.get(tag, []):
            if kw not in keywords:
                keywords.append(kw)

    return {
        "best_style":                   best_style,
        "recommended_prompt_keywords":  keywords[:6],
        "style_performance": {
            tag: {"avg_ctr": data["avg_ctr"], "count": data["count"]}
            for tag, data in top_styles
        },
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


# ─── Sheets 저장 ──────────────────────────────────────────────────────────────
def save_analysis_to_sheets(analysis_results, spreadsheet_id=None):
    """
    analyze_batch() 결과 → Thumbnail_Analysis 시트 저장

    Args:
        analysis_results: thumbnail_analyzer.analyze_batch() 반환값
        spreadsheet_id: 없으면 MASTER_SPREADSHEET_ID 사용
    """
    sid = spreadsheet_id or MASTER_SPREADSHEET_ID

    client = _get_client()
    sh     = client.open_by_key(sid)

    try:
        ws = sh.worksheet(OUTPUT_SHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(OUTPUT_SHEET_NAME, rows=1000, cols=12)
        print(f"[style_engine] 새 시트 생성: {OUTPUT_SHEET_NAME}")

    headers = [
        "video_id", "title", "style_tag",
        "brightness", "contrast", "edge_density",
        "dominant_color", "color_count",
        "impressions", "ctr", "views", "upload_date", "analyzed_at",
    ]
    now  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = [headers]

    for item in analysis_results:
        if item.get("error"):
            continue
        rows.append([
            item.get("video_id",       ""),
            item.get("title",          ""),
            item.get("style_tag",      ""),
            item.get("brightness",     ""),
            item.get("contrast",       ""),
            item.get("edge_density",   ""),
            item.get("dominant_color", ""),
            item.get("color_count",    ""),
            item.get("impressions",    ""),
            item.get("ctr",            ""),
            item.get("views",          ""),
            item.get("upload_date",    ""),
            now,
        ])

    ws.clear()
    ws.update("A1", rows)
    print(f"[style_engine] {len(rows)-1}개 행 → {OUTPUT_SHEET_NAME} 저장 완료")


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json

    dummy_correlation = {
        "by_style": {
            "dark":          {"avg_ctr": 8.1, "avg_views": 12000, "count": 5},
            "red_dominant":  {"avg_ctr": 7.5, "avg_views": 10200, "count": 3},
            "high_contrast": {"avg_ctr": 6.8, "avg_views":  9000, "count": 4},
            "minimal":       {"avg_ctr": 3.2, "avg_views":  4500, "count": 2},
        }
    }

    result = generate_style_intelligence(dummy_correlation)
    print(json.dumps(result, indent=2, ensure_ascii=False))
