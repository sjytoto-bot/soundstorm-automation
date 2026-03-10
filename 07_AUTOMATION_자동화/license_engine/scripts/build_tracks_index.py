#!/usr/bin/env python3
"""
build_tracks_index.py
=====================
Google Drive MASTER_AUDIO 폴더를 스캔하여 tracks.json을 자동 생성하고
GCS(soundstorm-config)에 업로드합니다.

파일명 규칙: SS-번호_YouTubeID11자_곡명.확장자
예: SS-028_abc123xyz89_토벌.mp3

사용법:
    python build_tracks_index.py [--dry-run]

옵션:
    --dry-run   GCS 업로드 없이 결과만 콘솔에 출력
"""

import os
import sys
import re
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# 프로젝트 루트를 PYTHONPATH에 추가
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
_ENGINE_DIR = os.path.dirname(_SCRIPTS_DIR)
_AUTOMATION_DIR = os.path.dirname(_ENGINE_DIR)

for p in [_ENGINE_DIR, _AUTOMATION_DIR]:
    if p not in sys.path:
        sys.path.append(p)

from license_engine.core.drive_manager import drive_manager
from license_engine.config import Config

# GCS 관련 설정
GCS_BUCKET = "soundstorm-config"
GCS_OBJECT = "tracks.json"

# YouTube ID 추출 정규식 (파일명의 두 번째 _구분 토큰)
# 파일명 형식: SS-001_YouTubeID_곡명.ext
_YT_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+-\d+_([A-Za-z0-9_-]{11})_', re.UNICODE)


def scan_drive_files() -> list[dict]:
    """MASTER_AUDIO Drive 폴더 파일 목록을 반환합니다."""
    drive_manager._ensure_service()
    results = drive_manager.service.files().list(
        q=f"'{Config.MASTER_AUDIO_FOLDER_ID}' in parents and trashed=false",
        fields="files(id, name)"
    ).execute()
    return results.get('files', [])


def extract_youtube_id(filename: str) -> str | None:
    """파일명에서 YouTube ID를 추출합니다. 실패하면 None 반환."""
    m = _YT_ID_PATTERN.match(filename)
    return m.group(1) if m else None


def extract_title(filename: str) -> str:
    """파일명에서 곡명(확장자 제외) 추출."""
    stem = os.path.splitext(filename)[0]
    parts = stem.split('_', 2)
    return parts[2] if len(parts) >= 3 else stem


def extract_track_id(filename: str) -> str:
    """파일명에서 SS 번호 추출. 예: SS-028"""
    m = re.match(r'^(SS-\d+)', filename)
    return m.group(1) if m else ""


def build_index(files: list[dict]) -> dict:
    """파일 목록 → tracks.json 인덱스 딕셔너리 생성."""
    index = {}
    skipped = []

    for f in files:
        name = f['name']
        yt_id = extract_youtube_id(name)
        if not yt_id:
            skipped.append(name)
            continue
        index[yt_id] = {
            "file": name,
            "title": extract_title(name),
            "track_id": extract_track_id(name)
        }

    if skipped:
        logging.warning(f"YouTube ID를 추출하지 못한 파일 {len(skipped)}개 (파일명 규칙 불일치):")
        for s in skipped:
            logging.warning(f"  - {s}")

    return index


def upload_to_gcs(index: dict) -> None:
    """tracks.json을 GCS(soundstorm-config)에 업로드합니다."""
    try:
        from google.cloud import storage
        from google.oauth2 import service_account
        from google.oauth2.credentials import Credentials

        # 서비스 계정부터 확인
        sa_path = os.path.join(_ENGINE_DIR, "service_account.json")
        token_path = os.path.join(_ENGINE_DIR, "token.json")
        client = None

        if os.path.exists(sa_path):
            creds = service_account.Credentials.from_service_account_file(sa_path)
            client = storage.Client(credentials=creds, project=creds.project_id)
        elif os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path)
            client = storage.Client(credentials=creds, project="soundstorm-automation")
        else:
            client = storage.Client()

        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob(GCS_OBJECT)
        blob.upload_from_string(
            json.dumps(index, ensure_ascii=False, indent=2),
            content_type="application/json"
        )
        logging.info(f"✅ gs://{GCS_BUCKET}/{GCS_OBJECT} 업로드 완료 ({len(index)}개 항목)")
    except Exception as e:
        logging.error(f"GCS 업로드 실패: {e}")
        raise



def main():
    parser = argparse.ArgumentParser(description="Drive → tracks.json 인덱스 빌더")
    parser.add_argument('--dry-run', action='store_true', help='GCS 업로드 없이 결과만 출력')
    args = parser.parse_args()

    logging.info("📂 Drive MASTER_AUDIO 폴더 스캔 중...")
    files = scan_drive_files()
    logging.info(f"  → 파일 {len(files)}개 발견")

    index = build_index(files)
    logging.info(f"  → YouTube ID 매핑 {len(index)}개 생성")

    if args.dry_run:
        print("\n[DRY RUN] 생성될 tracks.json:")
        print(json.dumps(index, ensure_ascii=False, indent=2))
        return

    upload_to_gcs(index)

    # 로컬 data/tracks.json도 동기화
    local_path = os.path.join(_ENGINE_DIR, 'data', 'tracks.json')
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    logging.info(f"✅ {local_path} 로컬 동기화 완료")


if __name__ == '__main__':
    main()
