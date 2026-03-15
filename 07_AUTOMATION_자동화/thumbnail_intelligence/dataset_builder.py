#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/dataset_builder.py

_RawData_Master 시트에서 썸네일 분석용 dataset 구성

데이터 소스:
    스프레드시트: SS_음원마스터_최종_분석추가
    ID: 12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y
    시트: _RawData_Master

    실제 컬럼:
        video_id, views, upload_date, avg_watch_time_sec,
        썸네일URL, track_name, youtube_title

    CTR: 현재 시스템에서 미수집 → ctr=0 기본값 사용

사용법:
    python3 dataset_builder.py
"""

import os
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent
_AUTO_ROOT = _THIS_DIR.parent

CREDENTIALS_PATH = _AUTO_ROOT / "credentials" / "service_account.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# ─── 설정 (환경변수로 오버라이드 가능) ───────────────────────────────────────
SPREADSHEET_ID = os.environ.get(
    "MASTER_SPREADSHEET_ID",
    "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
)
WORKSHEET_NAME = os.environ.get("MASTER_WORKSHEET_NAME", "_RawData_Master")

# _RawData_Master 실제 컬럼명 → 내부 키 매핑
COLUMN_MAP = {
    "video_id":          "video_id",
    "track_name":        "title",
    "youtube_title":     "youtube_title",
    "views":             "views",
    "avg_watch_time_sec":"avg_watch_time",
    "upload_date":       "upload_date",
    "썸네일URL":          "thumbnail_url",
    "impressions":       "impressions",   # studio_csv_ingestor 가 채움
    "ctr":               "ctr",           # studio_csv_ingestor 가 채움 (0~1 소수)
}


# ─── 인증 ─────────────────────────────────────────────────────────────────────
def get_client():
    if not CREDENTIALS_PATH.exists():
        raise FileNotFoundError(
            f"service_account.json 없음\n"
            f"경로: {CREDENTIALS_PATH}\n"
            "07_AUTOMATION_자동화/credentials/ 에 배치하세요."
        )
    creds = Credentials.from_service_account_file(str(CREDENTIALS_PATH), scopes=SCOPES)
    return gspread.authorize(creds)


# ─── 메인 함수 ────────────────────────────────────────────────────────────────
def build_dataset(spreadsheet_id=None, worksheet_name=None):
    """
    _RawData_Master 시트에서 썸네일 분석용 dataset 반환

    Returns:
        list of dicts — video_id, title, thumbnail_url, views,
                        avg_watch_time, upload_date, ctr(=0)
    """
    sid   = spreadsheet_id or SPREADSHEET_ID
    wname = worksheet_name or WORKSHEET_NAME

    print(f"[dataset_builder] 연결 중 → {sid} / {wname}")
    client  = get_client()
    sh      = client.open_by_key(sid)
    ws      = sh.worksheet(wname)
    records = ws.get_all_records()

    dataset = []
    for row in records:
        item = {}
        for sheet_col, key in COLUMN_MAP.items():
            item[key] = row.get(sheet_col, "")

        # title 우선순위: track_name → youtube_title → video_id
        if not item.get("title"):
            item["title"] = item.get("youtube_title") or item.get("video_id", "")

        # thumbnail_url 없으면 video_id로 자동 구성
        if not item.get("thumbnail_url") and item.get("video_id"):
            vid = item["video_id"]
            item["thumbnail_url"] = f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"

        dataset.append(item)

    # video_id + thumbnail_url 필수 필터
    valid = [d for d in dataset if d.get("video_id") and d.get("thumbnail_url")]
    print(f"[dataset_builder] {len(valid)}개 유효 row 로드 완료 (전체 {len(dataset)}개)")
    return valid


# ─── CLI 테스트 ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    data = build_dataset()
    for row in data[:5]:
        print(json.dumps(row, ensure_ascii=False))
