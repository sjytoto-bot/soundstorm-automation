#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 5: 중복 파일 정리 스크립트
안전하게 백업 폴더로 이동
"""

import os
import shutil
from pathlib import Path
from datetime import datetime
import pandas as pd
from core.path_config import PROJECT_ROOT

BASE_DIR = PROJECT_ROOT
BACKUP_DIR = BASE_DIR / "SOUNDSTORM_backup_duplicates"
LOG_FILE = BASE_DIR / "cleanup_log.txt"
REPORT_FILE = BASE_DIR / "SOUNDSTORM_analysis_report_v3.xlsx"

# 제외할 확장자
EXCLUDED_EXTENSIONS = {'.plist'}

def setup_backup_dir():
    """백업 디렉토리 생성"""
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True)
        print(f"✓ 백업 폴더 생성: {BACKUP_DIR}")
    else:
        print(f"✓ 백업 폴더 존재: {BACKUP_DIR}")

def log_action(message):
    """로그 파일에 기록"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] {message}\n")
    print(f"  {message}")

def move_duplicate_file(file_path, original_path):
    """중복 파일을 백업 폴더로 이동 (폴더 구조 유지)"""
    try:
        # 상대 경로 계산
        rel_path = os.path.relpath(file_path, BASE_DIR)
        
        # 백업 위치 (폴더 구조 유지)
        backup_path = BACKUP_DIR / rel_path
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 파일 이동
        shutil.move(file_path, backup_path)
        
        log_action(f"✓ 이동 완료: {rel_path}")
        log_action(f"  → 백업 위치: {backup_path}")
        log_action(f"  → 원본: {os.path.relpath(original_path, BASE_DIR)}")
        
        return True
    except Exception as e:
        log_action(f"✗ 이동 실패: {file_path} - {e}")
        return False

def main():
    """메인 실행"""
    print("=" * 60)
    print("🗂️  Phase 5: 중복 파일 정리")
    print("=" * 60)
    print()
    
    # 로그 파일 초기화
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        f.write(f"=== 중복 파일 정리 로그 ===\n")
        f.write(f"시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    
    # 백업 폴더 생성
    setup_backup_dir()
    print()
    
    # Excel 리포트 읽기
    print("📋 중복 파일 목록 읽기...")
    df = pd.read_excel(REPORT_FILE, sheet_name='중복파일')
    print(f"✓ 총 {len(df)}개 중복 파일 발견\n")
    
    # 확장자별 통계
    print("📊 확장자별 통계:")
    ext_counts = df['중복파일'].apply(lambda x: Path(x).suffix.lower()).value_counts()
    for ext, count in ext_counts.items():
        status = "제외" if ext in EXCLUDED_EXTENSIONS else "이동 예정"
        print(f"  - {ext}: {count}개 ({status})")
    print()
    
    # 필터링: .plist 제외
    df_filtered = df[~df['중복파일'].apply(lambda x: Path(x).suffix.lower() in EXCLUDED_EXTENSIONS)]
    print(f"🎯 정리 대상: {len(df_filtered)}개 파일")
    print(f"   (.plist {len(df) - len(df_filtered)}개 제외)\n")
    
    # 사용자 확인
    print("=" * 60)
    print("⚠️  다음 파일들을 백업 폴더로 이동합니다:")
    print("=" * 60)
    
    # 파일 목록 출력
    for idx, row in df_filtered.iterrows():
        dup_file = row['중복파일']
        dup_path = row['중복경로']
        size_mb = row['파일크기(MB)']
        print(f"\n{idx + 1}. {dup_file}")
        print(f"   경로: {dup_path}")
        print(f"   크기: {size_mb} MB")
    
    print("\n" + "=" * 60)
    response = input("\n계속하시겠습니까? (y/n): ").strip().lower()
    
    if response != 'y':
        print("\n❌ 작업 취소됨")
        log_action("작업 취소됨 (사용자 요청)")
        return
    
    print("\n🚀 파일 이동 시작...\n")
    
    # 파일 이동 실행
    success_count = 0
    fail_count = 0
    
    for idx, row in df_filtered.iterrows():
        dup_file = row['중복파일']
        dup_path = row['중복경로']
        original_path = row['원본경로']
        
        # 전체 경로 구성
        full_path = BASE_DIR / dup_path
        full_original_path = BASE_DIR / original_path
        
        print(f"\n[{idx + 1}/{len(df_filtered)}] {dup_file}")
        
        if full_path.exists():
            if move_duplicate_file(str(full_path), str(full_original_path)):
                success_count += 1
            else:
                fail_count += 1
        else:
            log_action(f"✗ 파일 없음: {dup_path}")
            fail_count += 1
    
    # 완료 로그
    print("\n" + "=" * 60)
    print("✅ 정리 완료!")
    print("=" * 60)
    print(f"✓ 성공: {success_count}개")
    print(f"✗ 실패: {fail_count}개")
    print(f"📁 백업 위치: {BACKUP_DIR}")
    print(f"📝 로그 파일: {LOG_FILE}")
    print("=" * 60)
    
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"\n=== 정리 완료 ===\n")
        f.write(f"종료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"성공: {success_count}개\n")
        f.write(f"실패: {fail_count}개\n")

if __name__ == "__main__":
    main()
