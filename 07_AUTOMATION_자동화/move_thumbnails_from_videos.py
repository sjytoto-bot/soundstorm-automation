#!/usr/bin/env python3
"""
영상 폴더 내 썸네일 파일 분리 스크립트
videos_영상 폴더에 있는 PNG/JPG 파일을 thumbnails_썸네일 폴더로 이동
"""

import os
import shutil
from pathlib import Path
from datetime import datetime
import json

# 작업 디렉토리 설정
BASE_DIR = Path(__file__).parent
VIDEOS_DIR = BASE_DIR / "01_YOUTUBE_유튜브자료/01_uploaded_업로드완료/videos_영상"
THUMBNAILS_DIR = BASE_DIR / "01_YOUTUBE_유튜브자료/01_uploaded_업로드완료/thumbnails_썸네일"
LOG_FILE = BASE_DIR / f"move_thumbnails_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

# 이동 기록
move_log = {
    "timestamp": datetime.now().isoformat(),
    "source_folder": str(VIDEOS_DIR),
    "destination_folder": str(THUMBNAILS_DIR),
    "moves": [],
    "errors": [],
    "summary": {}
}


def move_thumbnails():
    """영상 폴더에서 이미지 파일을 썸네일 폴더로 이동"""
    print("=" * 80)
    print("🖼️  영상 폴더 내 썸네일 파일 분리 시작")
    print("=" * 80)
    print(f"📂 소스: {VIDEOS_DIR}")
    print(f"📂 목적지: {THUMBNAILS_DIR}")
    print()
    
    # 썸네일 폴더가 없으면 생성
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    
    # PNG, JPG 파일 찾기
    image_extensions = ['.png', '.jpg', '.jpeg']
    image_files = []
    
    for ext in image_extensions:
        image_files.extend(VIDEOS_DIR.glob(f"*{ext}"))
        image_files.extend(VIDEOS_DIR.glob(f"*{ext.upper()}"))
    
    print(f"🔍 발견된 이미지 파일: {len(image_files)}개\n")
    
    moved_count = 0
    error_count = 0
    
    for image_file in sorted(image_files):
        src = image_file
        dst = THUMBNAILS_DIR / image_file.name
        
        # 대상 파일이 이미 존재하는지 확인
        if dst.exists():
            print(f"⚠️  SKIP: {image_file.name} (이미 존재함)")
            move_log["errors"].append({
                "file": image_file.name,
                "error": "Destination already exists"
            })
            error_count += 1
            continue
        
        try:
            shutil.move(str(src), str(dst))
            file_size = dst.stat().st_size
            move_log["moves"].append({
                "file": image_file.name,
                "size": file_size
            })
            print(f"✅ MOVED: {image_file.name} ({file_size / 1024:.1f} KB)")
            moved_count += 1
        except Exception as e:
            print(f"❌ ERROR: {image_file.name} - {e}")
            move_log["errors"].append({
                "file": image_file.name,
                "error": str(e)
            })
            error_count += 1
    
    # 요약 정보
    move_log["summary"] = {
        "total_found": len(image_files),
        "moved": moved_count,
        "errors": error_count,
        "total_size_moved": sum(m["size"] for m in move_log["moves"])
    }
    
    # 로그 저장
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(move_log, f, ensure_ascii=False, indent=2)
    
    # 결과 출력
    print("\n" + "=" * 80)
    print("✨ 썸네일 분리 완료!")
    print("=" * 80)
    print(f"✅ 이동 완료: {moved_count}개")
    print(f"⚠️  오류/스킵: {error_count}개")
    print(f"📦 총 크기: {move_log['summary']['total_size_moved'] / (1024**2):.2f} MB")
    print(f"\n📝 상세 로그: {LOG_FILE}")
    print("=" * 80)


if __name__ == "__main__":
    move_thumbnails()
