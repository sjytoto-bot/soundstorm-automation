#!/usr/bin/env python3
import os
from pathlib import Path
from core.path_config import PROJECT_ROOT

BASE_DIR = PROJECT_ROOT

INCLUDED_FOLDERS = {
    '네이버스토어 자료',
    '앨범 자료',
    '영상 이미지 자료',
    '영상화 기다리는 자료들',
    '올릴 음악 자료 모음',
    '완성본 자료',
}

EXCLUDED_FOLDERS = {
    'Audio Files',
    '__pycache__',
    '.venv',
    'venv',
    'site-packages',
    'node_modules',
    '.git',
    '.DS_Store',
}

def test_folder(folder_path):
    folder_name = os.path.basename(folder_path)
    rel_path = os.path.relpath(folder_path, BASE_DIR)
    path_parts = Path(rel_path).parts
    
    print(f"\n테스트: {folder_name}")
    print(f"  상대 경로: {rel_path}")
    print(f"  경로 parts: {path_parts}")
    print(f"  parts 길이: {len(path_parts)}")
    
    # 제외 폴더 체크
    if folder_name in EXCLUDED_FOLDERS:
        print(f"  ❌ 제외 (EXCLUDED_FOLDERS에 있음)")
        return False
    
    # 포함 폴더 체크
    if folder_name in INCLUDED_FOLDERS:
        print(f"  ✅ 포함 (INCLUDED_FOLDERS에 있음)")
        return True
    
    # 루트 레벨 체크
    if len(path_parts) == 1:
        if folder_name not in INCLUDED_FOLDERS and folder_name != '무용음악 스케치':
            print(f"  ❌ 제외 (루트 레벨이지만 포함 목록에 없음)")
            return False
    
    print(f"  ✅ 포함 (기본)")
    return True

# 테스트
test_folders = [
    os.path.join(BASE_DIR, '네이버스토어 자료'),
    os.path.join(BASE_DIR, '앨범 자료'),
    os.path.join(BASE_DIR, '.venv'),
    os.path.join(BASE_DIR, '무용음악 스케치'),
]

for folder in test_folders:
    test_folder(folder)
