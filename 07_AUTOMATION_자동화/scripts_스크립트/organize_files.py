#!/usr/bin/env python3
"""
SOUNDSTORM 폴더 정리 자동화 스크립트
- 루트 폴더의 파일들을 새로운 폴더 구조로 이동
- 이동 로그 생성
- 안전한 파일 이동 (덮어쓰기 방지)
"""

import os
import shutil
from pathlib import Path
from datetime import datetime
import json

# 작업 디렉토리 설정
BASE_DIR = Path(__file__).parent
LOG_FILE = BASE_DIR / f"organize_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

# 이동 기록
move_log = {
    "timestamp": datetime.now().isoformat(),
    "moves": [],
    "errors": [],
    "summary": {}
}


def safe_move(src, dst, is_folder=False):
    """안전하게 파일/폴더 이동"""
    src_path = BASE_DIR / src
    dst_path = BASE_DIR / dst
    
    # 소스가 존재하지 않으면 스킵
    if not src_path.exists():
        move_log["errors"].append({
            "source": str(src),
            "destination": str(dst),
            "error": "Source does not exist"
        })
        print(f"⚠️  SKIP: {src} (존재하지 않음)")
        return False
    
    # 대상 경로의 부모 디렉토리 생성
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 대상이 이미 존재하면 스킵
    if dst_path.exists():
        move_log["errors"].append({
            "source": str(src),
            "destination": str(dst),
            "error": "Destination already exists"
        })
        print(f"⚠️  SKIP: {src} → {dst} (이미 존재함)")
        return False
    
    try:
        shutil.move(str(src_path), str(dst_path))
        move_log["moves"].append({
            "source": str(src),
            "destination": str(dst),
            "type": "folder" if is_folder else "file",
            "size": get_size(src_path) if src_path.exists() else 0
        })
        print(f"✅ MOVED: {src} → {dst}")
        return True
    except Exception as e:
        move_log["errors"].append({
            "source": str(src),
            "destination": str(dst),
            "error": str(e)
        })
        print(f"❌ ERROR: {src} → {dst} ({e})")
        return False


def get_size(path):
    """파일/폴더 크기 계산 (바이트)"""
    if path.is_file():
        return path.stat().st_size
    elif path.is_dir():
        return sum(f.stat().st_size for f in path.rglob('*') if f.is_file())
    return 0


def organize_files():
    """파일 정리 실행"""
    print("=" * 80)
    print("🚀 SOUNDSTORM 폴더 정리 시작")
    print("=" * 80)
    print()
    
    # ========================================
    # 1️⃣ 01_YOUTUBE_유튜브자료
    # ========================================
    print("\n📁 01_YOUTUBE_유튜브자료 정리 중...")
    
    # 영상 파일
    safe_move("2월5일_흑룡무쌍.mp4", "01_YOUTUBE_유튜브자료/01_uploaded_업로드완료/videos_영상/2월5일_흑룡무쌍.mp4")
    safe_move("토벌_쇼츠.mp4", "01_YOUTUBE_유튜브자료/01_uploaded_업로드완료/videos_영상/토벌_쇼츠.mp4")
    
    # 썸네일 (업로드 완료)
    thumbnails = [
        "심판1.png", "심판2.png", "최후통첩.png",
        "토벌 혼5.png", "토벌 혼6.png",
        "흑룡무쌍2.png", "흑룡무쌍5.jpg", "혈무2.jpg"
    ]
    for thumb in thumbnails:
        safe_move(thumb, f"01_YOUTUBE_유튜브자료/01_uploaded_업로드완료/thumbnails_썸네일/{thumb}")
    
    # 음원 폴더 이동
    safe_move("영상화 기다리는 자료들", "01_YOUTUBE_유튜브자료/02_ready_업로드대기/music_편집완성/영상화 기다리는 자료들", is_folder=True)
    safe_move("올릴 음악 자료 모음", "01_YOUTUBE_유튜브자료/02_ready_업로드대기/music_master_마스터완성/올릴 음악 자료 모음", is_folder=True)
    safe_move("완성본 자료", "01_YOUTUBE_유튜브자료/02_ready_업로드대기/music_master_마스터완성/완성본 자료", is_folder=True)
    
    # 플레이리스트 관련
    safe_move("사운드스톰 플레이리스트.gsheet", "01_YOUTUBE_유튜브자료/03_playlists_월1회플레이리스트/사운드스톰 플레이리스트.gsheet")
    playlist_thumbnails = ["플리 썸네일2.png", "플리 썸네일3.png", "플리 썸네일5.png", "플리 썸네일6.png"]
    for thumb in playlist_thumbnails:
        safe_move(thumb, f"01_YOUTUBE_유튜브자료/03_playlists_월1회플레이리스트/{thumb}")
    
    # 분석 데이터
    safe_move("1월 유튜브 분석자료.pdf", "01_YOUTUBE_유튜브자료/analytics_데이터/1월 유튜브 분석자료.pdf")
    safe_move("soundstorm_youtube_data.csv", "01_YOUTUBE_유튜브자료/analytics_데이터/soundstorm_youtube_data.csv")
    safe_move("full_channel_analysis.json", "01_YOUTUBE_유튜브자료/analytics_데이터/full_channel_analysis.json")
    
    # 미사용 썸네일
    safe_move("영상 이미지 자료", "01_YOUTUBE_유튜브자료/thumbnails_unused_미사용썸네일/영상 이미지 자료", is_folder=True)
    safe_move("심판2.psxprj", "01_YOUTUBE_유튜브자료/thumbnails_unused_미사용썸네일/심판2.psxprj")
    safe_move("혈무1.psxprj", "01_YOUTUBE_유튜브자료/thumbnails_unused_미사용썸네일/혈무1.psxprj")
    
    # ========================================
    # 2️⃣ 02_MUSIC_음원제작중
    # ========================================
    print("\n📁 02_MUSIC_음원제작중 정리 중...")
    
    safe_move("12-1-2 금 후보_동양적임_95bpm.mp3", "02_MUSIC_음원제작중/candidate_후보/12-1-2 금 후보_동양적임_95bpm.mp3")
    safe_move("도륙의 세월_편집.mp3", "02_MUSIC_음원제작중/candidate_후보/도륙의 세월_편집.mp3")
    safe_move("무용음악 스케치", "02_MUSIC_음원제작중/archive_보통편집완료/무용음악 스케치", is_folder=True)
    
    # ========================================
    # 3️⃣ 03_ALBUM_앨범자료
    # ========================================
    print("\n📁 03_ALBUM_앨범자료 정리 중...")
    
    safe_move("앨범 자료", "03_ALBUM_앨범자료/catalog_앨범관리/앨범 자료", is_folder=True)
    
    # ========================================
    # 4️⃣ 04_STORE_스토어
    # ========================================
    print("\n📁 04_STORE_스토어 정리 중...")
    
    safe_move("chuksal_product_page_v2.html", "04_STORE_스토어/html_active_실사용페이지/chuksal_product_page_v2.html")
    safe_move("naver_store_strategy.md", "04_STORE_스토어/reference_참고자료/naver_store_strategy.md")
    safe_move("네이버스토어 자료", "04_STORE_스토어/reference_참고자료/네이버스토어 자료", is_folder=True)
    
    # ========================================
    # 7️⃣ 07_AUTOMATION_자동화
    # ========================================
    print("\n📁 07_AUTOMATION_자동화 정리 중...")
    
    scripts = [
        "soundstorm_analyzer.py",
        "soundstorm_analyzer_v2.py",
        "soundstorm_analyzer_v3.py",
        "analyze_files.py",
        "cleanup_duplicates.py",
        "extract_audio_durations.py",
        "rename_audio_files.py",
        "youtube_data_collector.py",
        "test_filter.py",
        "requirements.txt"
    ]
    for script in scripts:
        safe_move(script, f"07_AUTOMATION_자동화/scripts_스크립트/{script}")
    
    # ========================================
    # 8️⃣ 08_ARCHIVE_보관
    # ========================================
    print("\n📁 08_ARCHIVE_보관 정리 중...")
    
    archive_files = [
        "SOUNDSTORM_analysis_report.xlsx",
        "SOUNDSTORM_analysis_report_v2.xlsx",
        "SOUNDSTORM_analysis_report_v3.xlsx",
        "analysis_result.txt",
        "file_list_raw.txt",
        "cleanup_log.txt",
        "Gemini_Generated_Image_3rmlh83rmlh83rml.png"
    ]
    for file in archive_files:
        safe_move(file, f"08_ARCHIVE_보관/unnamed_미분류/{file}")
    
    safe_move("SOUNDSTORM_backup_duplicates", "08_ARCHIVE_보관/unnamed_미분류/SOUNDSTORM_backup_duplicates", is_folder=True)
    safe_move(".venv", "08_ARCHIVE_보관/unnamed_미분류/.venv", is_folder=True)
    
    # ========================================
    # 요약 정보 생성
    # ========================================
    move_log["summary"] = {
        "total_moves": len(move_log["moves"]),
        "total_errors": len(move_log["errors"]),
        "total_size_moved": sum(m["size"] for m in move_log["moves"]),
        "files_moved": len([m for m in move_log["moves"] if m["type"] == "file"]),
        "folders_moved": len([m for m in move_log["moves"] if m["type"] == "folder"])
    }
    
    # 로그 파일 저장
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(move_log, f, ensure_ascii=False, indent=2)
    
    # ========================================
    # 결과 출력
    # ========================================
    print("\n" + "=" * 80)
    print("✨ 정리 완료!")
    print("=" * 80)
    print(f"✅ 성공: {move_log['summary']['total_moves']}개 항목")
    print(f"   - 파일: {move_log['summary']['files_moved']}개")
    print(f"   - 폴더: {move_log['summary']['folders_moved']}개")
    print(f"   - 총 크기: {move_log['summary']['total_size_moved'] / (1024**3):.2f} GB")
    print(f"⚠️  오류/스킵: {move_log['summary']['total_errors']}개")
    print(f"\n📝 상세 로그: {LOG_FILE}")
    print("=" * 80)


if __name__ == "__main__":
    organize_files()
