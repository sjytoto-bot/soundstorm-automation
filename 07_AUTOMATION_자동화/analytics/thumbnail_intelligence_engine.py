#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analytics/thumbnail_intelligence_engine.py

Thumbnail_Analysis 시트를 기반으로 스타일별 CTR 성능을 분석하고
Thumbnail_Style_Performance 시트에 기록한다.

시트 구조:
    A1:F   style_tag / video_count / avg_ctr / median_ctr /
           weighted_ctr / total_impressions  (weighted_ctr DESC)
    H1~    Top Thumbnail Styles  (video_count>=3, weighted_ctr TOP 5)

사용법:
    from analytics.thumbnail_intelligence_engine import build_thumbnail_style_performance
    build_thumbnail_style_performance(spreadsheet)
"""

from datetime import datetime

import pandas as pd

SOURCE_SHEET = "Thumbnail_Analysis"
TARGET_SHEET = "Thumbnail_Style_Performance"

PERF_COLS  = ["style_tag", "video_count", "avg_ctr", "median_ctr",
              "weighted_ctr", "total_impressions"]
TOP_COLS   = ["style_tag", "weighted_ctr", "video_count"]


# ─── 메인 함수 ─────────────────────────────────────────────────────────────────

def build_thumbnail_style_performance(spreadsheet):
    """
    Thumbnail_Analysis 를 읽어 Thumbnail_Style_Performance 시트를 생성·갱신한다.

    Args:
        spreadsheet: gspread.Spreadsheet 인스턴스
    """
    print("\n🖼️  [Thumbnail Intelligence] Thumbnail_Style_Performance 생성 중...")

    # ── 1. 소스 시트 로드 ───────────────────────────────────────────────────
    try:
        ws_src = spreadsheet.worksheet(SOURCE_SHEET)
    except Exception as e:
        print(f"  ❌ {SOURCE_SHEET} 시트 없음 — 스킵: {e}")
        return

    records = ws_src.get_all_records()
    if not records:
        print(f"  ❌ {SOURCE_SHEET} 데이터 없음 — 스킵")
        return

    df = pd.DataFrame(records)
    print(f"  📥 로드: {len(df)}행")

    # ── 2. 필수 컬럼 확인 ──────────────────────────────────────────────────
    required = {"video_id", "style_tag", "ctr", "impressions"}
    missing  = required - set(df.columns)
    if missing:
        print(f"  ❌ 필수 컬럼 없음: {missing} — 스킵")
        return

    # ── 3. 타입 변환 + 필터링 ────────────────────────────────────────────
    df["impressions"] = pd.to_numeric(df["impressions"], errors="coerce").fillna(0)
    df["ctr"]         = pd.to_numeric(df["ctr"],         errors="coerce")

    df = df[df["impressions"] > 0]
    df = df.dropna(subset=["ctr", "style_tag"])
    df = df[df["style_tag"].astype(str).str.strip() != ""]
    df = df[df["ctr"] > 0]

    if df.empty:
        print("  ⚠️  유효한 Thumbnail 데이터 없음 — 스킵")
        return

    print(f"  ✅ 유효 데이터: {len(df)}행 / 스타일 종류: {df['style_tag'].nunique()}개")

    # ── 4. 클릭수 계산 (weighted CTR 용) ─────────────────────────────────
    df["clicks"] = df["impressions"] * df["ctr"]

    # ── 5. 스타일별 집계 ─────────────────────────────────────────────────
    grp = df.groupby("style_tag", sort=False)

    perf = pd.DataFrame({
        "video_count":       grp["video_id"].count(),
        "avg_ctr":           grp["ctr"].mean().round(6),
        "median_ctr":        grp["ctr"].median().round(6),
        "total_clicks":      grp["clicks"].sum(),
        "total_impressions": grp["impressions"].sum().astype(int),
    }).reset_index()

    perf["weighted_ctr"] = (
        perf["total_clicks"] / perf["total_impressions"]
    ).round(6)

    perf = perf.drop(columns=["total_clicks"])
    perf = perf.sort_values(by="weighted_ctr", ascending=False).reset_index(drop=True)

    # ── 6. Top Thumbnail Styles (video_count >= 3, TOP 5) ────────────────
    top = (
        perf[perf["video_count"] >= 3]
          .sort_values(by="weighted_ctr", ascending=False)
          .head(5)[TOP_COLS]
          .reset_index(drop=True)
    )

    print(f"  📊 스타일 집계: {len(perf)}개 스타일")
    for _, row in perf.iterrows():
        print(f"     {row['style_tag']:<16} videos={int(row['video_count']):>3}  "
              f"weighted_ctr={row['weighted_ctr']:.4f}  "
              f"impressions={int(row['total_impressions']):,}")

    # ── 7. 타깃 시트 준비 ─────────────────────────────────────────────────
    try:
        ws = spreadsheet.worksheet(TARGET_SHEET)
        ws.clear()
        print(f"  🔄 기존 {TARGET_SHEET} 시트 초기화")
    except Exception:
        ws = spreadsheet.add_worksheet(TARGET_SHEET, rows=30, cols=12)
        print(f"  🆕 {TARGET_SHEET} 시트 생성")

    # ── 8. 데이터 기록 ────────────────────────────────────────────────────
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # A1:F — 스타일별 성능 전체
    perf_header = [PERF_COLS]
    perf_data   = perf[PERF_COLS].values.tolist()
    ws.update(range_name="A1", values=perf_header + perf_data,
              value_input_option="USER_ENTERED")

    # H1~ — Top Thumbnail Styles
    top_section = [["Top Thumbnail Styles"], TOP_COLS] + top.values.tolist()
    ws.update(range_name="H1", values=top_section,
              value_input_option="USER_ENTERED")

    # 생성 시각 기록 (H 섹션 아래)
    meta_row = len(top_section) + 2
    ws.update(range_name=f"H{meta_row}", values=[["generated_at", now]],
              value_input_option="USER_ENTERED")

    print(f"  📤 {TARGET_SHEET} 기록 완료")
    if not top.empty:
        best = top.iloc[0]
        print(f"     Best Style: {best['style_tag']} "
              f"(weighted_ctr={best['weighted_ctr']:.4f}, "
              f"videos={int(best['video_count'])})")


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    from pathlib import Path

    import gspread
    from google.oauth2.service_account import Credentials

    _AUTO_ROOT = Path(__file__).parent.parent

    CREDENTIALS_PATH = str(_AUTO_ROOT / "credentials" / "service_account.json")
    SPREADSHEET_ID   = os.environ.get(
        "GOOGLE_SHEETS_ID",
        "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
    )

    creds = Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    gc = gspread.authorize(creds)
    ss = gc.open_by_key(SPREADSHEET_ID)

    build_thumbnail_style_performance(ss)
