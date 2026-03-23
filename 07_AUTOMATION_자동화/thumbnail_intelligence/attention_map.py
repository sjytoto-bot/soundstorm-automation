#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/attention_map.py

Attention Map Engine
OpenCV Spectral Residual Saliency 기반 시선 집중 영역 분석

주요 함수:
    compute_attention(image_path) → {attention_zones, saliency_map}
    save_heatmap(saliency_map, output_path) → path
    zone_attention_scores(saliency_map, zones) → {zone_name: score}

saliency 라이브러리:
    opencv-contrib-python >= 4.9.0
    설치: pip install opencv-contrib-python

fallback:
    contrib 없을 경우 Sobel gradient magnitude 기반 근사 saliency 사용
"""

import numpy as np
import cv2
from pathlib import Path

_THIS_DIR   = Path(__file__).parent
HEATMAP_DIR = _THIS_DIR / "output" / "heatmaps"
HEATMAP_DIR.mkdir(parents=True, exist_ok=True)

# 고시선 영역 판단 임계값 (saliency 상위 N% 기준)
_SALIENCY_THRESH_PERCENTILE = 70   # 상위 30%를 주목 영역으로 판단
_MIN_ZONE_AREA_RATIO        = 0.01  # 이미지 면적의 1% 미만 컨투어 무시


# ─── Saliency 계산 ────────────────────────────────────────────────────────────
def _compute_spectral_residual(img_bgr: np.ndarray) -> np.ndarray:
    """
    OpenCV Spectral Residual Saliency (contrib 모듈)
    Returns: float32 saliency map, 0.0 ~ 1.0, H×W
    """
    saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
    ok, sal_map = saliency.computeSaliency(img_bgr)
    if not ok:
        raise RuntimeError("Spectral Residual Saliency 계산 실패")
    return sal_map.astype(np.float32)


def _compute_gradient_saliency(img_bgr: np.ndarray) -> np.ndarray:
    """
    Fallback: Sobel gradient magnitude 기반 근사 saliency
    Returns: float32 saliency map, 0.0 ~ 1.0, H×W
    """
    gray   = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx     = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy     = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag    = cv2.magnitude(gx, gy)
    # Gaussian smoothing으로 점 노이즈 제거
    mag    = cv2.GaussianBlur(mag, (31, 31), 0)
    sal, _ = cv2.normalize(mag, None, 0.0, 1.0, cv2.NORM_MINMAX, cv2.CV_32F)
    return sal


def _get_saliency_map(img_bgr: np.ndarray) -> tuple[np.ndarray, str]:
    """
    contrib 가능 시 Spectral Residual, 아니면 Gradient fallback
    Returns: (saliency_map, method_used)
    """
    if hasattr(cv2, "saliency"):
        try:
            return _compute_spectral_residual(img_bgr), "spectral_residual"
        except Exception as e:
            print(f"[attention_map] SpectralResidual 실패 → gradient fallback: {e}")
    return _compute_gradient_saliency(img_bgr), "gradient"


# ─── Attention Zones ──────────────────────────────────────────────────────────
def _extract_attention_zones(saliency_map: np.ndarray, img_h: int, img_w: int) -> list[dict]:
    """
    Saliency map에서 상위 N% 임계값 적용 → 컨투어 → 바운딩 박스 목록
    """
    sal_u8  = (saliency_map * 255).astype(np.uint8)
    thresh  = int(np.percentile(sal_u8, _SALIENCY_THRESH_PERCENTILE))
    _, binary = cv2.threshold(sal_u8, thresh, 255, cv2.THRESH_BINARY)

    # 형태학적 닫기 연산으로 인접 영역 병합
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area    = img_h * img_w * _MIN_ZONE_AREA_RATIO
    zones       = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        zones.append({
            "x": int(x), "y": int(y),
            "w": int(w), "h": int(h),
            "area_ratio": round(area / (img_h * img_w), 4),
        })

    # 면적 내림차순 정렬
    zones.sort(key=lambda z: z["area_ratio"], reverse=True)
    return zones


# ─── Heatmap 저장 ─────────────────────────────────────────────────────────────
def save_heatmap(saliency_map: np.ndarray, output_path: str,
                 target_size: tuple = (1280, 720)) -> str:
    """
    Saliency float map → JET 컬러맵 이미지 저장
    (파란색=낮음, 녹색=중간, 노란색=높음, 빨간색=최고 주목)
    """
    sal_u8  = (saliency_map * 255).astype(np.uint8)
    heatmap = cv2.applyColorMap(sal_u8, cv2.COLORMAP_JET)
    heatmap = cv2.resize(heatmap, target_size, interpolation=cv2.INTER_LINEAR)
    cv2.imwrite(str(output_path), heatmap)
    return str(output_path)


# ─── Zone Attention Score ─────────────────────────────────────────────────────
def zone_attention_scores(saliency_map: np.ndarray, zones: list) -> dict[str, float]:
    """
    9구역 각각의 평균 saliency score 계산 (높을수록 주목도 높음 → 텍스트 회피)

    Args:
        saliency_map: float32 H×W, 0.0 ~ 1.0
        zones:        auto_layout.ZONES 리스트

    Returns:
        {zone_name: attention_score (0.0 ~ 1.0)}
    """
    h, w   = saliency_map.shape[:2]
    scores = {}

    for name, (r0, r1), (c0, c1) in zones:
        rr0, rr1 = int(h * r0), int(h * r1)
        cc0, cc1 = int(w * c0), int(w * c1)
        region   = saliency_map[rr0:rr1, cc0:cc1]
        scores[name] = float(np.mean(region)) if region.size > 0 else 0.0

    return scores


# ─── 메인 함수 ────────────────────────────────────────────────────────────────
def compute_attention(image_path: str, save_heatmap_flag: bool = True) -> dict:
    """
    이미지 → Attention Map 전체 파이프라인

    Args:
        image_path:        로컬 이미지 경로
        save_heatmap_flag: True이면 heatmap JPEG 저장

    Returns:
        {
            "attention_zones": [{"x","y","w","h","area_ratio"}, ...],
            "saliency_map":    np.ndarray (float32, H×W),
            "heatmap_path":    str | None,
            "method":          "spectral_residual" | "gradient"
        }
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"이미지 로드 실패: {image_path}")

    h, w    = img.shape[:2]
    sal_map, method = _get_saliency_map(img)

    zones = _extract_attention_zones(sal_map, h, w)
    print(f"[attention_map] {method} 완료 | 주목 영역 {len(zones)}개 탐지")

    heatmap_path = None
    if save_heatmap_flag:
        stem         = Path(image_path).stem
        heatmap_file = HEATMAP_DIR / f"heatmap_{stem}.jpg"
        save_heatmap(sal_map, str(heatmap_file))
        heatmap_path = str(heatmap_file)

    return {
        "attention_zones": zones,
        "saliency_map":    sal_map,
        "heatmap_path":    heatmap_path,
        "method":          method,
    }
