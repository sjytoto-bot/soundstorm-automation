#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analytics/reference_engine.py

Video_Diagnostics + Channel_CTR_KPI 기준선을 바탕으로
"성공 영상"을 자동 추출하고 Reference_Videos 시트에 기록한다.

선정 조건:
    ctr >= median_ctr * 1.2
    AND diagnosis == "NORMAL"
    AND impressions > median_impressions

reference_score = (ctr / median_ctr) * log10(impressions)

사용법:
    from analytics.reference_engine import build_reference_videos
    build_reference_videos(spreadsheet)
"""

import math
from datetime import datetime

import numpy as np
import pandas as pd

SOURCE_SHEET = "Video_Diagnostics"
KPI_SHEET    = "Channel_CTR_KPI"
TARGET_SHEET = "Reference_Videos"

OUTPUT_COLS = ["video_id", "ctr", "impressions", "views", "reference_score"]


# ─── 기준선 로드 ───────────────────────────────────────────────────────────────

def _load_kpi_baseline(spreadsheet):
    """Channel_CTR_KPI 에서 channel_median_ctr / median_impressions 를 읽는다."""
    try:
        ws   = spreadsheet.worksheet(KPI_SHEET)
        rows = ws.get_all_values()
    except Exception as e:
        print(f"  ⚠️  {KPI_SHEET} 로드 실패: {e}")
        return None, None

    kpi = {}
    for row in rows[1:]:
        if len(row) >= 2 and row[0].strip():
            try:
                kpi[row[0].strip()] = float(row[1])
            except (ValueError, TypeError):
                pass

    median_ctr = kpi.get("channel_median_ctr")
    median_imp = kpi.get("median_impressions")

    if median_ctr is None or median_imp is None:
        print(f"  ⚠️  {KPI_SHEET} 기준값 미확인")
        return None, None

    print(f"  📐 기준선 — median_ctr={median_ctr:.4f}  median_impressions={median_imp:,.0f}")
    return float(median_ctr), float(median_imp)


# ─── 메인 함수 ─────────────────────────────────────────────────────────────────

def build_reference_videos(spreadsheet):
    """
    Video_Diagnostics 를 읽어 Reference_Videos 시트를 생성·갱신한다.

    Args:
        spreadsheet: gspread.Spreadsheet 인스턴스
    """
    print("\n⭐ [Reference Engine] Reference_Videos 생성 중...")

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
    required = {"video_id", "ctr", "impressions", "views", "diagnosis"}
    missing  = required - set(df.columns)
    if missing:
        print(f"  ❌ 필수 컬럼 없음: {missing} — 스킵")
        return

    # ── 3. 타입 변환 ─────────────────────────────────────────────────────
    df["ctr"]         = pd.to_numeric(df["ctr"],         errors="coerce").fillna(0)
    df["impressions"] = pd.to_numeric(df["impressions"], errors="coerce").fillna(0)
    df["views"]       = pd.to_numeric(df["views"],       errors="coerce").fillna(0)

    # ── 4. 기준선 로드 ────────────────────────────────────────────────────
    median_ctr, median_imp = _load_kpi_baseline(spreadsheet)

    if median_ctr is None:
        valid = df[df["impressions"] > 0]
        median_ctr = float(valid["ctr"].median()) if not valid.empty else 0.05
        median_imp = float(valid["impressions"].median()) if not valid.empty else 1000
        print(f"  ℹ️  자체 기준 사용 — median_ctr={median_ctr:.4f}  median_imp={median_imp:.0f}")

    # ── 5. 성공 영상 필터 ─────────────────────────────────────────────────
    df_ref = df[
        (df["diagnosis"] == "NORMAL") &
        (df["ctr"] >= median_ctr * 1.2) &
        (df["impressions"] > median_imp)
    ].copy()

    print(f"  🔍 필터 결과: {len(df_ref)}개 (NORMAL + ctr≥{median_ctr*1.2:.4f} + imp>{median_imp:.0f})")

    if df_ref.empty:
        print("  ⚠️  조건을 만족하는 Reference 영상 없음")
        # 빈 시트라도 생성
        _write_sheet(spreadsheet, pd.DataFrame(columns=OUTPUT_COLS))
        return

    # ── 6. reference_score 계산 ───────────────────────────────────────────
    df_ref["reference_score"] = (
        (df_ref["ctr"] / median_ctr) * np.log10(df_ref["impressions"])
    ).round(4)

    # ── 7. TOP 10 정렬 ────────────────────────────────────────────────────
    top10 = (
        df_ref.sort_values(by="reference_score", ascending=False)
              .head(10)[OUTPUT_COLS]
              .reset_index(drop=True)
    )

    print(f"  🏆 TOP {len(top10)} Reference Videos:")
    for _, row in top10.iterrows():
        print(f"     {row['video_id']:<16} ctr={row['ctr']:.4f}  "
              f"imp={int(row['impressions']):,}  score={row['reference_score']:.3f}")

    # ── 8. 시트 기록 ──────────────────────────────────────────────────────
    _write_sheet(spreadsheet, top10)


def _write_sheet(spreadsheet, df):
    try:
        ws = spreadsheet.worksheet(TARGET_SHEET)
        ws.clear()
        print(f"  🔄 기존 {TARGET_SHEET} 시트 초기화")
    except Exception:
        ws = spreadsheet.add_worksheet(TARGET_SHEET, rows=20, cols=6)
        print(f"  🆕 {TARGET_SHEET} 시트 생성")

    now  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = [OUTPUT_COLS] + df.values.tolist()
    ws.update(range_name="A1", values=rows, value_input_option="USER_ENTERED")

    # 생성 시각
    ws.update(range_name=f"A{len(rows)+2}", values=[["generated_at", now]],
              value_input_option="RAW")

    print(f"  📤 {TARGET_SHEET} 기록 완료 ({len(df)}개 영상)  [{now}]")


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

    build_reference_videos(ss)
