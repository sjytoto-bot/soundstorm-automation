#!/usr/bin/env python3
"""
build_rename_table.py
=====================
CSV에서 (SS번호, 곡명, YouTubeID)를 추출하고
Drive MASTER_AUDIO 폴더의 현재 파일명과 매칭하여
리네임 테이블을 출력합니다.

사용법:
    python3 build_rename_table.py            # 매칭 테이블만 출력
    python3 build_rename_table.py --execute  # 실제 Drive 리네임 실행
"""

import sys
import os
import re
import csv
import json
import argparse

# ── 설정 ───────────────────────────────────────────────────────
CSV_PATH = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/00_WORKSPACE/SS_음원마스터_최종_분석추가 - SS_음원마스터_최종.csv"
MASTER_AUDIO_FOLDER_ID = "1ehBylNmWYHWOiLqOXHhfNUU0YsQ-P-wH"

# Gmail OAuth token을 사용 (로컬 환경)
TOKEN_PATH = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/license_engine/token.json"
CREDENTIALS_PATH = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/license_engine/credentials.json"

# ── 파일명 금지 문자 정리 ─────────────────────────────────────
_FORBIDDEN = re.compile(r'[\\/:*?"<>|]')

def sanitize(s: str) -> str:
    return _FORBIDDEN.sub('_', s).strip()


def load_csv_index(csv_path: str) -> dict:
    """CSV → {ss_number: {youtube_id, title}} 딕셔너리 반환."""
    index = {}
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = None
        for row in reader:
            if not row:
                continue
            if row[0] == '상품ID':
                header = row
                continue
            if header is None:
                continue
            ss_id = row[0].strip()
            if not ss_id.startswith('SS-'):
                continue
            title_raw = row[1].strip()
            youtube_id = row[23].strip() if len(row) > 23 else ""
            if not youtube_id or len(youtube_id) != 11:
                continue
            index[ss_id] = {
                "youtube_id": youtube_id,
                "title": sanitize(title_raw)
            }
    return index


def get_drive_service():
    """Drive API 서비스 생성. OAuth 토큰 우선, 없으면 서비스 계정 시도."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    SCOPES = ['https://www.googleapis.com/auth/drive']

    creds = None
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if creds and creds.valid:
        return build('drive', 'v3', credentials=creds)

    raise RuntimeError(f"Drive 인증 실패. token.json을 확인하세요: {TOKEN_PATH}")


def get_drive_files(service, folder_id: str) -> list:
    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name)",
        pageSize=300
    ).execute()
    return results.get("files", [])


def match_file_to_ss(filename: str) -> str | None:
    m = re.match(r'^(SS-\d+)', filename)
    if m:
        return m.group(1)
    
    # 하드코딩된 예외 파일 매칭 (SS번호가 없는 파일들)
    hardcoded = {
        "12월15일 음폭검무_마스터.mp3": "SS-029",
        "2월20일 흑검_마스터.wav": "SS-045",
        "2월24일_마스터_최종.wav": "SS-046", # 혈서
        "3월1일_잠행_마스터.wav": "SS-047",
        "3월5일 출정_마스터2.wav": "SS-048",
        "종언_마스터_bpm75-103.wav": "SS-044",
    }
    return hardcoded.get(filename)


def build_rename_plan(drive_files: list, csv_index: dict) -> list:
    plan = []
    matched_ss = set()

    for f in drive_files:
        old_name = f["name"]
        file_id = f["id"]
        ext = os.path.splitext(old_name)[1].lower()
        ss_key = match_file_to_ss(old_name)

        if ss_key and ss_key in csv_index:
            entry = csv_index[ss_key]
            new_name = f"{ss_key}_{entry['youtube_id']}_{entry['title']}{ext}"
            matched_ss.add(ss_key)
            status = "SKIP" if old_name == new_name else "RENAME"
            plan.append({
                "file_id": file_id, "old_name": old_name,
                "new_name": new_name, "status": status, "ss_key": ss_key
            })
        else:
            plan.append({
                "file_id": file_id, "old_name": old_name,
                "new_name": "—", "status": "NO_MATCH", "ss_key": None
            })

    for ss_key, entry in csv_index.items():
        if ss_key not in matched_ss:
            plan.append({
                "file_id": None, "old_name": "—",
                "new_name": f"{ss_key}_{entry['youtube_id']}_{entry['title']}.wav",
                "status": "CSV_ONLY", "ss_key": ss_key
            })

    return sorted(plan, key=lambda x: (x.get("ss_key") or "ZZZ", x["old_name"]))


def print_table(plan: list):
    rename_count = sum(1 for p in plan if p["status"] == "RENAME")
    skip_count   = sum(1 for p in plan if p["status"] == "SKIP")
    no_match     = sum(1 for p in plan if p["status"] == "NO_MATCH")
    csv_only     = sum(1 for p in plan if p["status"] == "CSV_ONLY")

    sep = "=" * 110
    print(f"\n{sep}")
    print(f"  Drive 음원 파일 리네임 계획표")
    print(f"  RENAME: {rename_count}개  |  SKIP(동일): {skip_count}개  |  NO_MATCH: {no_match}개  |  CSV_ONLY(Drive없음): {csv_only}개")
    print(f"{sep}\n")

    print("【 RENAME 대상 】")
    if rename_count:
        print(f"  {'SS번호':<12} {'현재 파일명':<55} →  변경 파일명")
        print(f"  {'-'*12} {'-'*55} {'-'*60}")
        for p in plan:
            if p["status"] == "RENAME":
                key = p['ss_key'] or ''
                print(f"  {key:<12} {p['old_name']:<55} →  {p['new_name']}")
    else:
        print("  없음\n")

    print("\n【 SKIP (이미 올바른 형식) 】")
    for p in plan:
        if p["status"] == "SKIP":
            print(f"  {p['ss_key']:<12} {p['old_name']}")
    if not skip_count:
        print("  없음")

    print("\n【 NO_MATCH (SS번호 없는 파일 — 수동 확인 필요) 】")
    for p in plan:
        if p["status"] == "NO_MATCH":
            print(f"  {p['old_name']}")
    if not no_match:
        print("  없음")

    print("\n【 CSV_ONLY (Drive에 파일 없음 — 업로드 필요) 】")
    for p in plan:
        if p["status"] == "CSV_ONLY":
            print(f"  {p['ss_key']:<12} →  {p['new_name']}")
    if not csv_only:
        print("  없음")

    print(f"\n{sep}")


def execute_rename(service, plan: list):
    rename_items = [p for p in plan if p["status"] == "RENAME"]
    print(f"\n🚀 {len(rename_items)}개 파일 리네임 시작...\n")
    for i, p in enumerate(rename_items, 1):
        try:
            service.files().update(
                fileId=p["file_id"],
                body={"name": p["new_name"]}
            ).execute()
            print(f"  [{i}/{len(rename_items)}] ✅ {p['old_name']}")
            print(f"               → {p['new_name']}")
        except Exception as e:
            print(f"  [{i}/{len(rename_items)}] ❌ {p['old_name']} — 오류: {e}")
    print(f"\n✅ 리네임 완료!")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true', help='실제 Drive 파일명 변경 실행')
    args = parser.parse_args()

    print("📄 CSV 로드 중...")
    csv_index = load_csv_index(CSV_PATH)
    print(f"   → SS 항목 {len(csv_index)}개 파싱 완료")

    print("🔐 Drive 인증 중...")
    service = get_drive_service()
    print("   → 인증 성공")

    print("📂 Drive MASTER_AUDIO 폴더 스캔 중...")
    drive_files = get_drive_files(service, MASTER_AUDIO_FOLDER_ID)
    print(f"   → 파일 {len(drive_files)}개 발견")

    plan = build_rename_plan(drive_files, csv_index)
    print_table(plan)

    if args.execute:
        confirm = input("\n위 계획대로 Drive 파일명을 변경하시겠습니까? (yes 입력): ")
        if confirm.strip().lower() == "yes":
            execute_rename(service, plan)
        else:
            print("❌ 취소됨.")
    else:
        print("\n※ 실제 리네임 실행하려면 --execute 옵션을 추가하세요.")
        print("   python3 build_rename_table.py --execute")


if __name__ == "__main__":
    main()
