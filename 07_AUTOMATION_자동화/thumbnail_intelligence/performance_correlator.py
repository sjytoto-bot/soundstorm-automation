#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/performance_correlator.py

썸네일 스타일 태그 × 성과 지표 상관관계 분석

입력:  analyze_batch() 반환값 (list of dicts)
출력:
    {
        "by_style":     {style_tag: {avg_ctr, avg_views, count}},
        "top_videos":   [{video_id, ctr, views, style_tags, ...}],
        "total_analyzed": int,
    }
"""

from collections import defaultdict


# ─── 유틸 ─────────────────────────────────────────────────────────────────────
def _safe_float(val):
    """문자열/None 포함 float 변환. 실패 시 0.0 반환."""
    try:
        return float(str(val).replace("%", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


# ─── 핵심 함수 ────────────────────────────────────────────────────────────────
def correlate(analysis_results):
    """
    스타일 태그별 평균 CTR / 조회수 산출

    Args:
        analysis_results: thumbnail_analyzer.analyze_batch() 반환값

    Returns:
        dict — by_style, top_videos, total_analyzed
    """
    style_buckets = defaultdict(lambda: {"ctr_sum": 0.0, "views_sum": 0.0, "count": 0})
    video_scores  = []

    for item in analysis_results:
        if item.get("error"):
            continue

        ctr   = _safe_float(item.get("ctr", 0))
        views = _safe_float(item.get("views", 0))
        tags  = item.get("style_tags", ["neutral"])

        video_scores.append({
            "video_id":       item.get("video_id", ""),
            "title":          item.get("title", ""),
            "thumbnail_url":  item.get("thumbnail_url", ""),
            "ctr":            ctr,
            "views":          views,
            "style_tags":     tags,
            "dominant_color": item.get("dominant_color", ""),
            "brightness":     item.get("brightness", 0),
            "contrast":       item.get("contrast", 0),
        })

        for tag in tags:
            style_buckets[tag]["ctr_sum"]   += ctr
            style_buckets[tag]["views_sum"] += views
            style_buckets[tag]["count"]     += 1

    # 스타일별 평균 산출
    by_style = {}
    for tag, data in style_buckets.items():
        n = data["count"]
        by_style[tag] = {
            "avg_ctr":   round(data["ctr_sum"]   / n, 2) if n else 0.0,
            "avg_views": round(data["views_sum"] / n, 0) if n else 0.0,
            "count":     n,
        }

    # CTR 기준 내림차순 정렬
    video_scores.sort(key=lambda x: x["ctr"], reverse=True)

    return {
        "by_style":       by_style,
        "top_videos":     video_scores[:10],
        "total_analyzed": len(video_scores),
    }


def get_top_styles(correlation_data, top_n=3):
    """
    CTR 기준 상위 n개 스타일 반환

    Returns:
        [(tag, {avg_ctr, avg_views, count}), ...]
    """
    by_style = correlation_data.get("by_style", {})
    sorted_styles = sorted(
        by_style.items(),
        key=lambda x: x[1]["avg_ctr"],
        reverse=True,
    )
    return sorted_styles[:top_n]


def build_style_summary(correlation_data):
    """
    Dashboard 표시용 요약 텍스트 생성

    Returns:
        list of str — 예: ["dark cinematic  CTR 8.2%", "red_dominant  CTR 7.5%"]
    """
    top = get_top_styles(correlation_data, top_n=5)
    return [
        f"{tag}  CTR {data['avg_ctr']}%  (n={data['count']})"
        for tag, data in top
    ]


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json

    dummy = [
        {
            "video_id": "abc123", "title": "Dark Battle",
            "ctr": "8.2", "views": "12000",
            "style_tags": ["dark", "red_dominant", "high_contrast"],
            "dominant_color": "#c81111", "brightness": 52, "contrast": 68,
        },
        {
            "video_id": "def456", "title": "Minimal Theme",
            "ctr": "3.1", "views": "5000",
            "style_tags": ["bright", "minimal"],
            "dominant_color": "#eeeeee", "brightness": 205, "contrast": 28,
        },
        {
            "video_id": "ghi789", "title": "Assassin Dark",
            "ctr": "7.5", "views": "9800",
            "style_tags": ["dark", "high_contrast"],
            "dominant_color": "#2a0a0a", "brightness": 61, "contrast": 61,
        },
    ]

    result = correlate(dummy)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("\n--- Top Styles ---")
    for line in build_style_summary(result):
        print(" ", line)
