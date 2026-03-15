#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analytics/channel_ctr_engine.py

_RawData_Master 를 기반으로 채널 CTR KPI 를 계산하고
Channel_CTR_KPI 시트에 기록한다.

시트 구조:
    A1:B   metric / value       — 채널 요약 KPI 4종
    D1~    Top CTR Videos 10개  — ctr DESC
    J1~    Low CTR Videos 10개  — ctr ASC

사용법:
    from analytics.channel_ctr_engine import build_channel_ctr_kpi
    build_channel_ctr_kpi(spreadsheet)
"""

import statistics
from datetime import datetime

import pandas as pd

SOURCE_SHEET = "_RawData_Master"
TARGET_SHEET = "Channel_CTR_KPI"


# ─── 메인 함수 ─────────────────────────────────────────────────────────────────

def build_channel_ctr_kpi(spreadsheet):
    """
    _RawData_Master 를 읽어 Channel_CTR_KPI 시트를 생성·갱신한다.

    Args:
        spreadsheet: gspread.Spreadsheet 인스턴스 (이미 열려있는 객체)
    """
    print("\n📊 [CTR KPI] Channel_CTR_KPI 생성 중...")

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
    required = {"video_id", "impressions", "views", "ctr"}
    missing  = required - set(df.columns)
    if missing:
        print(f"  ❌ 필수 컬럼 없음: {missing} — 스킵")
        return

    # ── 3. 타입 변환 + 필터링 ────────────────────────────────────────────
    df["impressions"] = pd.to_numeric(df["impressions"], errors="coerce").fillna(0)
    df["views"]       = pd.to_numeric(df["views"],       errors="coerce").fillna(0)
    df["ctr"]         = pd.to_numeric(df["ctr"],         errors="coerce")

    df = df[df["impressions"] > 0]          # impressions 0 제거
    df = df.dropna(subset=["ctr"])          # CTR NaN 제거
    df = df[df["ctr"] > 0]                 # CTR 0도 제외 (미수집 데이터)

    if df.empty:
        print("  ⚠️  유효한 CTR 데이터 없음 — 스킵")
        return

    print(f"  ✅ 유효 데이터: {len(df)}행 (impressions>0, ctr>0)")

    # ── 4. KPI 계산 ────────────────────────────────────────────────────────
    channel_avg_ctr           = round(df["ctr"].mean(),   6)
    channel_median_ctr        = round(df["ctr"].median(), 6)
    channel_total_impressions = int(df["impressions"].sum())
    channel_total_views       = int(df["views"].sum())

    # weighted CTR = sum(clicks) / sum(impressions)  (노출 가중 CTR)
    df["clicks"]          = df["impressions"] * df["ctr"]
    total_clicks          = df["clicks"].sum()
    channel_weighted_ctr  = round(total_clicks / channel_total_impressions, 6) \
                            if channel_total_impressions > 0 else 0.0

    # median impressions (Video Diagnostics Engine 기준선)
    median_impressions = round(df["impressions"].median(), 2)

    print(f"  avg_ctr={channel_avg_ctr:.4f}  median_ctr={channel_median_ctr:.4f}  weighted_ctr={channel_weighted_ctr:.4f}")
    print(f"  total_impressions={channel_total_impressions:,}  total_views={channel_total_views:,}  median_imp={median_impressions:,.0f}")

    # ── 5. Top / Low CTR 영상 ─────────────────────────────────────────────
    RANK_COLS = ["video_id", "ctr", "impressions", "views"]

    top_df = (
        df.sort_values(by="ctr", ascending=False)
          .head(10)[RANK_COLS]
          .reset_index(drop=True)
    )
    low_df = (
        df.sort_values(by="ctr", ascending=True)
          .head(10)[RANK_COLS]
          .reset_index(drop=True)
    )

    # ── 6. 타깃 시트 준비 ─────────────────────────────────────────────────
    try:
        ws = spreadsheet.worksheet(TARGET_SHEET)
        ws.clear()
        print(f"  🔄 기존 {TARGET_SHEET} 시트 초기화")
    except Exception:
        ws = spreadsheet.add_worksheet(TARGET_SHEET, rows=30, cols=16)
        print(f"  🆕 {TARGET_SHEET} 시트 생성")

    # ── 7. 데이터 기록 ────────────────────────────────────────────────────
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # A1:B — 채널 요약 KPI
    summary_rows = [
        ["metric",                    "value"],
        ["channel_avg_ctr",           channel_avg_ctr],
        ["channel_median_ctr",        channel_median_ctr],
        ["channel_weighted_ctr",      channel_weighted_ctr],
        ["channel_total_impressions", channel_total_impressions],
        ["channel_total_views",       channel_total_views],
        ["median_impressions",        str(int(median_impressions))],
        ["valid_video_count",         len(df)],
        ["generated_at",              now],
    ]
    ws.update(range_name="A1", values=summary_rows, value_input_option="RAW")

    # D1~ — Top CTR Videos
    top_header = [["Top CTR Videos"]]
    top_cols   = [RANK_COLS]
    top_data   = top_df.values.tolist()
    ws.update(range_name="D1", values=top_header,          value_input_option="USER_ENTERED")
    ws.update(range_name="D2", values=top_cols + top_data, value_input_option="USER_ENTERED")

    # J1~ — Low CTR Videos
    low_header = [["Low CTR Videos"]]
    low_cols   = [RANK_COLS]
    low_data   = low_df.values.tolist()
    ws.update(range_name="J1", values=low_header,          value_input_option="USER_ENTERED")
    ws.update(range_name="J2", values=low_cols + low_data, value_input_option="USER_ENTERED")

    print(f"  📤 {TARGET_SHEET} 기록 완료")
    print(f"     Top CTR: {top_df.iloc[0]['video_id']} ({top_df.iloc[0]['ctr']:.4f})")
    print(f"     Low CTR: {low_df.iloc[0]['video_id']} ({low_df.iloc[0]['ctr']:.4f})")


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    import sys
    from pathlib import Path

    _THIS_DIR  = Path(__file__).parent
    _AUTO_ROOT = _THIS_DIR.parent

    import gspread
    from google.oauth2.service_account import Credentials

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

    build_channel_ctr_kpi(ss)
