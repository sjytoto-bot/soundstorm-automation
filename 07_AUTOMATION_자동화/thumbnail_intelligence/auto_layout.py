#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/auto_layout.py

Auto Text Placement Engine
OpenCV edge density + brightness variance + Attention Map 기반
최적 텍스트 위치 자동 계산

출력:
    {
        "best_position":   "top_right",
        "confidence":      0.82,
        "zone_scores":     {"top_left": 0.31, ...},
        "attention_zones": [{"x","y","w","h"}, ...],
        "heatmap_url":     "/heatmaps/heatmap_upload_xxx.jpg" | null
    }

알고리즘:
    score = W_EDGE   × edge_density
          + W_BVAR   × brightness_variance
          + W_BRIGHT × darkness_penalty
          + W_ATTN   × attention_overlap
    → 점수 최저 구역 = 텍스트 배치 최적 위치
"""

import numpy as np
import cv2
from pathlib import Path

# ─── 9구역 정의 ───────────────────────────────────────────────────────────────
# (name, (row_start, row_end), (col_start, col_end)) — 비율 0.0 ~ 1.0
ZONES = [
    ("top_left",      (0.00, 0.34), (0.00, 0.34)),
    ("top_center",    (0.00, 0.34), (0.33, 0.67)),
    ("top_right",     (0.00, 0.34), (0.66, 1.00)),
    ("center_left",   (0.33, 0.67), (0.00, 0.34)),
    ("center",        (0.33, 0.67), (0.33, 0.67)),
    ("center_right",  (0.33, 0.67), (0.66, 1.00)),
    ("bottom_left",   (0.66, 1.00), (0.00, 0.34)),
    ("bottom_center", (0.66, 1.00), (0.33, 0.67)),
    ("bottom_right",  (0.66, 1.00), (0.66, 1.00)),
]

# ─── 가중치 ───────────────────────────────────────────────────────────────────
_W_EDGE   = 0.40   # edge density          — 복잡한 텍스처 회피
_W_BVAR   = 0.15   # brightness variance   — 균일한 배경 선호
_W_BRIGHT = 0.10   # darkness penalty      — 가독성 저하 구역 회피
_W_ATTN   = 0.35   # attention overlap     — 핵심 피사체 회피 (가장 중요)


# ─── 내부 지표 ────────────────────────────────────────────────────────────────
def _edge_density(region: np.ndarray) -> float:
    """Canny edge density: 0.0(없음) ~ 1.0(꽉 참)"""
    if region.size == 0:
        return 1.0
    edges = cv2.Canny(region, 50, 150)
    return float(np.count_nonzero(edges)) / region.size


def _brightness_variance(region: np.ndarray) -> float:
    """밝기 분산 (표준편차 / 255): 0.0(균일) ~ 1.0(불규칙)"""
    if region.size == 0:
        return 1.0
    return float(np.std(region.astype(np.float32))) / 255.0


def _darkness_penalty(region: np.ndarray) -> float:
    """
    평균 밝기 기반 패널티
    70~180 구간이 텍스트 가독성 최적 (흰색·컬러 텍스트 모두 보임)
    """
    if region.size == 0:
        return 1.0
    mean = float(np.mean(region))
    if 70 <= mean <= 180:
        return 0.0
    elif mean < 70:
        return (70 - mean) / 70.0
    else:
        return (mean - 180) / 75.0


# ─── 메인 함수 ────────────────────────────────────────────────────────────────
def analyze_zones(image_path: str) -> dict:
    """
    이미지를 9구역으로 분할, 텍스트 배치 최적 위치 계산

    Args:
        image_path: 로컬 이미지 파일 경로

    Returns:
        {
            "best_position":   str,
            "confidence":      float,
            "zone_scores":     {name: score},
            "attention_zones": list[dict],
            "heatmap_url":     str | None
        }
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"이미지 로드 실패: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # ── Attention Map (내부 호출) ──────────────────────────────────────────────
    attn_zone_scores = {name: 0.0 for name, _, _ in ZONES}
    attention_zones  = []
    heatmap_url      = None

    try:
        from attention_map import compute_attention, zone_attention_scores
        attn_result      = compute_attention(str(image_path), save_heatmap_flag=True)
        saliency_map     = attn_result["saliency_map"]
        attention_zones  = attn_result.get("attention_zones", [])
        attn_zone_scores = zone_attention_scores(saliency_map, ZONES)

        if attn_result.get("heatmap_path"):
            heatmap_url = f"/heatmaps/{Path(attn_result['heatmap_path']).name}"

    except Exception as e:
        print(f"[auto_layout] Attention Map 계산 실패 — 패널티 없이 진행: {e}")

    # ── 구역별 종합 점수 계산 ──────────────────────────────────────────────────
    zone_scores: dict[str, float] = {}

    for name, (r0, r1), (c0, c1) in ZONES:
        rr0, rr1 = int(h * r0), int(h * r1)
        cc0, cc1 = int(w * c0), int(w * c1)
        region   = gray[rr0:rr1, cc0:cc1]

        ed   = _edge_density(region)
        bv   = _brightness_variance(region)
        dp   = _darkness_penalty(region)
        attn = attn_zone_scores.get(name, 0.0)

        score = ed * _W_EDGE + bv * _W_BVAR + dp * _W_BRIGHT + attn * _W_ATTN
        zone_scores[name] = round(score, 4)

    # ── 최적 위치 선택 ────────────────────────────────────────────────────────
    best  = min(zone_scores, key=lambda k: zone_scores[k])
    worst = max(zone_scores, key=lambda k: zone_scores[k])

    best_score  = zone_scores[best]
    worst_score = zone_scores[worst]

    if worst_score > 0:
        confidence = round(1.0 - best_score / worst_score, 3)
    else:
        confidence = 0.0

    confidence = max(0.0, min(1.0, confidence))

    print(
        f"[auto_layout] 최적 위치: {best} (신뢰도 {confidence:.0%})"
        f" | 점수 {best_score:.3f}"
        f" | 주목영역 {len(attention_zones)}개"
    )

    return {
        "best_position":   best,
        "confidence":      confidence,
        "zone_scores":     zone_scores,
        "attention_zones": attention_zones,
        "heatmap_url":     heatmap_url,
    }
