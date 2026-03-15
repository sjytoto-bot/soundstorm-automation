#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analytics/video_diagnostics_engine.py

_RawData_Master 의 각 영상을 Channel_CTR_KPI 기준선과 비교하여
자동 진단(diagnosis)을 수행하고 Video_Diagnostics 시트에 기록한다.

진단 규칙:
    THUMBNAIL_WEAK           impressions > median_imp AND ctr < median_ctr * 0.7
    TITLE_DISCOVERY_WEAK     impressions < median_imp AND ctr > median_ctr * 1.2
    CONTENT_RETENTION_WEAK   ctr > median_ctr AND avg_watch_time 낮음 (채널 평균 이하)
    ALGORITHM_DISTRIBUTION_LOW ctr > median_ctr * 1.2 AND views 낮음 (채널 평균 이하)
    NORMAL                   위 조건 없음

사용법:
    from analytics.video_diagnostics_engine import build_video_diagnostics
    build_video_diagnostics(spreadsheet)
"""

from datetime import datetime

import pandas as pd

SOURCE_SHEET  = "_RawData_Master"
KPI_SHEET     = "Channel_CTR_KPI"
TARGET_SHEET  = "Video_Diagnostics"

OUTPUT_COLS = [
    "video_id", "impressions", "views", "ctr",
    "avg_watch_time", "retention_rate",
    "ctr_vs_channel", "impressions_vs_channel",
    "diagnosis", "confidence", "recommendation",
]

RECOMMENDATIONS = {
    "THUMBNAIL_WEAK":              "썸네일 교체 테스트",
    "TITLE_DISCOVERY_WEAK":        "제목 / 키워드 개선",
    "CONTENT_RETENTION_WEAK":      "초반 30초 구조 개선",
    "ALGORITHM_DISTRIBUTION_LOW":  "추천 트래픽 확산 부족 — 공유 / 댓글 유도 강화",
    "NORMAL":                      "—",
}


# ─── 기준선 로드 ───────────────────────────────────────────────────────────────

def _load_kpi_baseline(spreadsheet):
    """
    Channel_CTR_KPI 시트에서 channel_median_ctr / median_impressions 를 읽는다.
    시트가 없으면 None 반환.
    """
    try:
        ws  = spreadsheet.worksheet(KPI_SHEET)
        rows = ws.get_all_values()
    except Exception as e:
        print(f"  ⚠️  {KPI_SHEET} 로드 실패: {e}")
        return None, None

    kpi = {}
    for row in rows[1:]:           # 헤더 행 스킵
        if len(row) >= 2 and row[0].strip():
            try:
                kpi[row[0].strip()] = float(row[1])
            except (ValueError, TypeError):
                pass

    median_ctr = kpi.get("channel_median_ctr")
    median_imp = kpi.get("median_impressions")

    if median_ctr is None or median_imp is None:
        print(f"  ⚠️  {KPI_SHEET} 에서 기준값 미확인 (channel_median_ctr / median_impressions)")
        return None, None

    print(f"  📐 기준선 — median_ctr={median_ctr:.4f}  median_impressions={median_imp:,.0f}")
    return float(median_ctr), float(median_imp)


# ─── 영상 진단 ─────────────────────────────────────────────────────────────────

def _diagnose(row, median_ctr, median_imp, avg_watch_time_ch, avg_views_ch):
    """
    단일 영상 row 를 진단하고 (diagnosis, recommendation) 을 반환한다.

    avg_watch_time_ch: 채널 평균 시청 시간 (초)
    avg_views_ch:      채널 평균 조회수
    """
    imp  = row["impressions"]
    ctr  = row["ctr"]
    awt  = row["avg_watch_time"]   # None 허용
    views = row["views"]

    # ① 썸네일 문제
    if imp > median_imp and ctr < median_ctr * 0.7:
        return "THUMBNAIL_WEAK", RECOMMENDATIONS["THUMBNAIL_WEAK"]

    # ② 제목 / 키워드 문제
    if imp < median_imp and ctr > median_ctr * 1.2:
        return "TITLE_DISCOVERY_WEAK", RECOMMENDATIONS["TITLE_DISCOVERY_WEAK"]

    # ③ 콘텐츠 몰입 문제 (avg_watch_time 있을 때만)
    if awt is not None and avg_watch_time_ch > 0:
        if ctr > median_ctr and awt < avg_watch_time_ch * 0.8:
            return "CONTENT_RETENTION_WEAK", RECOMMENDATIONS["CONTENT_RETENTION_WEAK"]

    # ④ 확산 부족
    if avg_views_ch > 0 and ctr > median_ctr * 1.2 and views < avg_views_ch * 0.6:
        return "ALGORITHM_DISTRIBUTION_LOW", RECOMMENDATIONS["ALGORITHM_DISTRIBUTION_LOW"]

    return "NORMAL", RECOMMENDATIONS["NORMAL"]


# ─── 메인 함수 ─────────────────────────────────────────────────────────────────

def build_video_diagnostics(spreadsheet):
    """
    _RawData_Master 를 읽어 Video_Diagnostics 시트를 생성·갱신한다.

    Args:
        spreadsheet: gspread.Spreadsheet 인스턴스
    """
    print("\n🔬 [Video Diagnostics] Video_Diagnostics 생성 중...")

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

    # ── 3. 타입 변환 ─────────────────────────────────────────────────────
    df["impressions"] = pd.to_numeric(df["impressions"], errors="coerce").fillna(0)
    df["views"]       = pd.to_numeric(df["views"],       errors="coerce").fillna(0)
    df["ctr"]         = pd.to_numeric(df["ctr"],         errors="coerce").fillna(0)

    # avg_watch_time / retention_rate: NULL 허용
    if "avg_watch_time_sec" in df.columns:
        df["avg_watch_time"] = pd.to_numeric(df["avg_watch_time_sec"], errors="coerce")
    elif "avg_watch_time" in df.columns:
        df["avg_watch_time"] = pd.to_numeric(df["avg_watch_time"], errors="coerce")
    else:
        df["avg_watch_time"] = None

    if "retention_rate" in df.columns:
        df["retention_rate"] = pd.to_numeric(df["retention_rate"], errors="coerce")
    else:
        df["retention_rate"] = None

    # ── 4. 기준선 로드 ────────────────────────────────────────────────────
    median_ctr, median_imp = _load_kpi_baseline(spreadsheet)

    if median_ctr is None:
        # Channel_CTR_KPI 없으면 데이터 자체 기준 사용
        valid = df[df["impressions"] > 0]
        median_ctr = float(valid["ctr"].median()) if not valid.empty else 0.05
        median_imp = float(valid["impressions"].median()) if not valid.empty else 1000
        print(f"  ℹ️  자체 기준 사용 — median_ctr={median_ctr:.4f}  median_imp={median_imp:.0f}")

    # ── 5. 채널 평균 (retention / 조회수 진단 기준) ────────────────────────
    valid_df       = df[(df["impressions"] > 0) & (df["ctr"] > 0)]
    awt_series     = valid_df["avg_watch_time"].dropna()
    avg_watch_time_ch = float(awt_series.mean()) if not awt_series.empty else 0
    avg_views_ch      = float(valid_df["views"].mean()) if not valid_df.empty else 0

    print(f"  📊 채널 평균 — avg_watch_time={avg_watch_time_ch:.0f}s  avg_views={avg_views_ch:.0f}")

    # ── 6. 비교 지표 계산 ────────────────────────────────────────────────
    df["ctr_vs_channel"] = (
        df["ctr"].apply(lambda c: round(c / median_ctr, 3) if median_ctr > 0 else None)
    )
    df["impressions_vs_channel"] = (
        df["impressions"].apply(lambda i: round(i / median_imp, 3) if median_imp > 0 else None)
    )

    # ── 7. 영상별 진단 ────────────────────────────────────────────────────
    diagnoses     = []
    recommendations = []

    for _, row in df.iterrows():
        awt = row["avg_watch_time"] if pd.notna(row["avg_watch_time"]) else None
        row_copy = row.copy()
        row_copy["avg_watch_time"] = awt
        d, r = _diagnose(row_copy, median_ctr, median_imp, avg_watch_time_ch, avg_views_ch)
        diagnoses.append(d)
        recommendations.append(r)

    df["diagnosis"]      = diagnoses
    df["recommendation"] = recommendations

    # confidence = max(ctr_gap, impression_gap) — 진단 신뢰도 (0~1+)
    df["confidence"] = df.apply(
        lambda r: round(max(
            abs(r["ctr"] - median_ctr) / median_ctr if median_ctr > 0 else 0,
            abs(r["impressions"] - median_imp) / median_imp if median_imp > 0 else 0,
        ), 3),
        axis=1,
    )

    # 진단 요약 출력
    summary = df["diagnosis"].value_counts()
    print(f"  🩺 진단 결과:")
    for diag, cnt in summary.items():
        print(f"     {diag:<35} {cnt}개")

    # ── 8. 타깃 시트 준비 ─────────────────────────────────────────────────
    try:
        ws = spreadsheet.worksheet(TARGET_SHEET)
        ws.clear()
        print(f"  🔄 기존 {TARGET_SHEET} 시트 초기화")
    except Exception:
        ws = spreadsheet.add_worksheet(TARGET_SHEET, rows=200, cols=12)
        print(f"  🆕 {TARGET_SHEET} 시트 생성")

    # ── 9. 데이터 기록 ────────────────────────────────────────────────────
    # OUTPUT_COLS 중 실제 df에 있는 것만 사용
    out_cols = [c for c in OUTPUT_COLS if c in df.columns]
    out_df   = df[out_cols].copy()

    # None/NaN → 빈 문자열
    out_df = out_df.where(pd.notna(out_df), "")

    rows_to_write = [out_cols] + out_df.values.tolist()
    ws.update(range_name="A1", values=rows_to_write,
              value_input_option="USER_ENTERED")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"  📤 {TARGET_SHEET} 기록 완료 ({len(out_df)}개 영상)  [{now}]")


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

    build_video_diagnostics(ss)
