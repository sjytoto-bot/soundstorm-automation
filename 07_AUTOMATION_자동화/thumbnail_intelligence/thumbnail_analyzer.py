#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/thumbnail_analyzer.py

썸네일 이미지 다운로드 + OpenCV 분석

분석 항목:
    brightness      — 평균 밝기 (0~255)
    contrast        — 표준편차 기반 대비
    dominant_color  — K-means 주요 색상 (#hex)
    color_count     — 유효 색상 클러스터 수
    edge_density    — Canny 엣지 밀도 (텍스트·디테일 지표)
    style_tags      — 분류 태그 (dark, red_dominant, high_contrast, minimal, text_overlay)

의존 패키지:
    pip install opencv-python numpy requests
"""

import time
import numpy as np
import requests
import cv2

# ─── 분류 기준값 ───────────────────────────────────────────────────────────────
BRIGHTNESS_DARK   = 80    # 이하 → dark
BRIGHTNESS_BRIGHT = 180   # 이상 → bright
CONTRAST_HIGH     = 55    # 이상 → high_contrast
EDGE_MINIMAL      = 0.04  # 이하 → minimal (엣지 밀도)
EDGE_TEXT         = 0.12  # 이상 → text_overlay (고주파 엣지)
COLOR_CLUSTERS    = 3
REQUEST_DELAY     = 0.3   # 요청 간 대기(초) — 서버 과부하 방지


# ─── 이미지 다운로드 ──────────────────────────────────────────────────────────
def _download_image(url, timeout=10):
    """URL → numpy array (BGR). 실패 시 None 반환."""
    headers = {"User-Agent": "Mozilla/5.0 (compatible; SOUNDSTORM-Bot/1.0)"}
    try:
        resp = requests.get(url, timeout=timeout, headers=headers)
        resp.raise_for_status()
        arr = np.frombuffer(resp.content, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"  [download_err] {url[:70]}... → {e}")
        return None


# ─── 색상 분석 ────────────────────────────────────────────────────────────────
def _extract_dominant_colors(img_bgr, k=COLOR_CLUSTERS):
    """
    K-means로 주요 색상 추출

    Returns:
        colors_rgb: [(R, G, B), ...] — 비율 내림차순
        counts: [int, ...] — 각 클러스터 픽셀 수
    """
    data     = img_bgr.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        data, k, None, criteria, 5, cv2.KMEANS_RANDOM_CENTERS
    )
    counts     = np.bincount(labels.flatten(), minlength=k)
    sorted_idx = np.argsort(-counts)
    colors_bgr = centers[sorted_idx].astype(int)
    colors_rgb = [(int(c[2]), int(c[1]), int(c[0])) for c in colors_bgr]
    return colors_rgb, counts[sorted_idx].tolist()


# ─── 스타일 분류 ──────────────────────────────────────────────────────────────
def _classify_style_tags(brightness, contrast, dominant_rgb, edge_density, color_count):
    """수치 → 스타일 태그 목록"""
    r, g, b = dominant_rgb
    tags = []

    # 밝기
    if brightness < BRIGHTNESS_DARK:
        tags.append("dark")
    elif brightness > BRIGHTNESS_BRIGHT:
        tags.append("bright")

    # 붉은 색 지배
    if r > 130 and r > g * 1.4 and r > b * 1.4:
        tags.append("red_dominant")

    # 대비
    if contrast > CONTRAST_HIGH:
        tags.append("high_contrast")

    # 미니멀 (엣지 낮음 + 색상 단순)
    if edge_density < EDGE_MINIMAL and color_count <= 2:
        tags.append("minimal")

    # 텍스트 오버레이 추정 (고주파 엣지)
    if edge_density > EDGE_TEXT:
        tags.append("text_overlay")

    return tags if tags else ["neutral"]


# ─── 단일 분석 ────────────────────────────────────────────────────────────────
def analyze_thumbnail(video_id, thumbnail_url, delay=REQUEST_DELAY):
    """
    단일 썸네일 분석

    Returns:
        dict — video_id, brightness, contrast, dominant_color, color_count,
               edge_density, style_tags, style_tag (쉼표 구분 문자열)
    """
    img = _download_image(thumbnail_url)
    if img is None:
        return {"video_id": video_id, "thumbnail_url": thumbnail_url, "error": "download_failed"}

    time.sleep(delay)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    brightness   = float(np.mean(gray))
    contrast     = float(np.std(gray))
    edges        = cv2.Canny(gray, 50, 150)
    edge_density = float(np.sum(edges > 0) / edges.size)

    colors_rgb, counts = _extract_dominant_colors(img, k=COLOR_CLUSTERS)
    dominant_color = "#{:02x}{:02x}{:02x}".format(*colors_rgb[0])

    total_pixels = img.shape[0] * img.shape[1]
    color_count  = len([c for c in counts if c > total_pixels * 0.05])

    style_tags = _classify_style_tags(
        brightness, contrast, colors_rgb[0], edge_density, color_count
    )

    return {
        "video_id":       video_id,
        "thumbnail_url":  thumbnail_url,
        "brightness":     round(brightness, 2),
        "contrast":       round(contrast, 2),
        "edge_density":   round(edge_density, 4),
        "dominant_color": dominant_color,
        "color_count":    color_count,
        "style_tags":     style_tags,
        "style_tag":      ",".join(style_tags),   # Sheets 저장용
    }


# ─── 배치 분석 ────────────────────────────────────────────────────────────────
def analyze_batch(dataset, max_items=None):
    """
    dataset (list of dicts from dataset_builder) → 분석 결과 list

    각 결과에 성과 데이터(views, ctr, avg_watch_time, upload_date) 병합
    """
    items   = dataset[:max_items] if max_items else dataset
    results = []

    for i, row in enumerate(items):
        vid = row.get("video_id", "?")
        url = row.get("thumbnail_url", "")
        print(f"  [{i+1}/{len(items)}] {vid} 분석 중...")

        result = analyze_thumbnail(vid, url)

        # 성과 데이터 병합
        result["views"]          = row.get("views", 0)
        result["ctr"]            = row.get("ctr", 0)
        result["avg_watch_time"] = row.get("avg_watch_time", 0)
        result["upload_date"]    = row.get("upload_date", "")
        result["title"]          = row.get("title", "")

        results.append(result)

    success = len([r for r in results if not r.get("error")])
    print(f"[thumbnail_analyzer] 완료: {success}/{len(results)}개 성공")
    return results


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    test_url = "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
    result   = analyze_thumbnail("dQw4w9WgXcQ", test_url)
    print(json.dumps(result, indent=2, ensure_ascii=False))
