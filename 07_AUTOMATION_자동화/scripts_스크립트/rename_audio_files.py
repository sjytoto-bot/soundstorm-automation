"""
SOUNDSTORM 음원 파일명 일괄 변경 스크립트
==========================================

한글 제목 → 최적화된 영문 제목으로 자동 변경
백업 폴더 자동 생성으로 원본 보존
"""

import os
import shutil
from pathlib import Path

# 35곡 제목 매칭 테이블 (최적화 버전)
TITLE_MAPPING = {
    # 한글 키워드로 매칭 (번호 무관)
    '어명': 'The King\'s Spirit',
    '혼': 'The King\'s Spirit',
    '대취타': 'Daechwita',
    '격살': 'The Final Strike',
    '척살 2': 'Slaughter II Extinction',
    '척살 ii': 'Slaughter II Extinction',
    '척살2': 'Slaughter II Extinction',
    '멸': 'Slaughter II Extinction',
    '토벌': 'The Conquest',
    '멸살': 'Annihilation',
    '혈전': 'Blood Battle',
    '척살 1': 'Slaughter I',
    '척살 i': 'Slaughter I',
    '척살1': 'Slaughter I',
    '척살': 'Slaughter I',  # 번호 없으면 I로 가정
    '추살': 'The Chase',
    '흑현': 'Black Strings',
    '천하일검': 'The Unrivaled Blade',
    '검무': 'Geommu',
    '명부': 'Abyssal Gates',
    '저승': 'Underworld',
    '적설': 'Silent Snowfall',
    '진주성': 'Jinju Fortress',
    '천명': 'Heavenly Mandate',
    '도륙': 'Carnage',
    '광풍': 'Raging Storm',
    '비검': 'Blade of Lament',
    '위대한 전쟁': 'The Great War',
    '전쟁': 'The Great War',
    '방랑자': 'The Wanderer',
    '승전보': 'Victory Herald',
    '마지막 결의': 'The Last Resolve',
    '결의': 'The Last Resolve',
    '다크네스': 'Darkness',
    'darkness': 'Darkness',
    '초대받지': 'Uninvited',
    '최후의 생존자': 'Survivor',
    '생존자': 'Survivor',
    '거짓된 평화': 'False Peace',
    '평화': 'Blade of Benevolence',  # 평화의 검과 구분 필요
    '고독한 칼날': 'The Lonesome Blade',
    '칼날': 'The Lonesome Blade',
    '폭풍전야': 'Before the Storm',
    '전야': 'Before the Storm',
    '전장의 그림자': 'Shadows of War',
    '그림자': 'Shadows of War',
    '황혼': 'Twilight',
    '시작의 땅': 'Place of Beginnings',
    '시작': 'Place of Beginnings',
    '평화의 검': 'Blade of Benevolence',
    '사막': 'Gilded Sands',
}

# 번호별 정확한 매칭 (우선순위 높음)
TRACK_NUMBER_MAPPING = {
    1: 'The King\'s Spirit',
    2: 'Daechwita',
    3: 'The Final Strike',
    4: 'Slaughter II Extinction',
    5: 'The Conquest',
    6: 'Annihilation',
    7: 'Blood Battle',
    8: 'Slaughter I',
    9: 'The Chase',
    10: 'Black Strings',
    11: 'The Unrivaled Blade',
    12: 'Geommu',
    13: 'Abyssal Gates',
    14: 'Underworld',
    15: 'Silent Snowfall',
    16: 'Jinju Fortress',
    17: 'Heavenly Mandate',
    18: 'Carnage',
    19: 'Raging Storm',
    20: 'Blade of Lament',
    21: 'The Great War',
    22: 'The Wanderer',
    23: 'Victory Herald',
    24: 'The Last Resolve',
    25: 'Darkness',
    26: 'Uninvited',
    27: 'Survivor',
    28: 'False Peace',
    29: 'The Lonesome Blade',
    30: 'Before the Storm',
    31: 'Shadows of War',
    32: 'Twilight',
    33: 'Place of Beginnings',
    34: 'Blade of Benevolence',
    35: 'Gilded Sands',
}

def extract_track_number(filename):
    """파일명에서 트랙 번호 추출"""
    import re
    patterns = [
        r'^0?(\d+)[._\s-]',  # 01. 또는 1.
        r'[Tt]rack\s*0?(\d+)',
        r'\(0?(\d+)\)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            return int(match.group(1))
    return None

def find_new_title(filename, track_num=None):
    """파일명에서 새 제목 찾기"""
    filename_lower = filename.lower()
    
    # 1순위: 트랙 번호로 정확히 매칭
    if track_num and track_num in TRACK_NUMBER_MAPPING:
        return TRACK_NUMBER_MAPPING[track_num]
    
    # 2순위: 한글 키워드 매칭
    for korean, english in TITLE_MAPPING.items():
        if korean in filename:
            return english
    
    # 3순위: 이미 영문인 경우 그대로
    if filename.replace('.mp3', '').replace('.m4a', '').replace('.wav', '').replace('.flac', '').strip().isascii():
        return None  # 변경 불필요
    
    return None

def rename_audio_files(folder_path, dry_run=True):
    """음원 파일명 일괄 변경"""
    audio_extensions = {'.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.wma'}
    folder = Path(folder_path)
    
    # 백업 폴더 생성
    backup_folder = folder / '_backup_originals'
    if not dry_run and not backup_folder.exists():
        backup_folder.mkdir()
        print(f"📁 백업 폴더 생성: {backup_folder}")
    
    changes = []
    skipped = []
    
    # 파일 스캔
    files = sorted([f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in audio_extensions])
    
    if not files:
        print("❌ 음원 파일을 찾을 수 없습니다.")
        return
    
    print(f"🔍 {len(files)}개 파일 발견\n")
    
    for audio_file in files:
        filename = audio_file.name
        track_num = extract_track_number(filename)
        new_title = find_new_title(filename, track_num)
        
        if new_title:
            # 새 파일명 생성
            extension = audio_file.suffix
            if track_num:
                new_filename = f"{track_num:02d}. {new_title}{extension}"
            else:
                new_filename = f"{new_title}{extension}"
            
            new_path = audio_file.parent / new_filename
            
            # 이미 존재하는 파일명이면 스킵
            if new_path.exists() and new_path != audio_file:
                skipped.append((filename, f"이미 존재: {new_filename}"))
                continue
            
            changes.append({
                'old': audio_file,
                'new': new_path,
                'old_name': filename,
                'new_name': new_filename,
                'track_num': track_num
            })
        else:
            skipped.append((filename, "매칭되는 제목 없음"))
    
    # 결과 출력
    if changes:
        print("✅ 변경될 파일:")
        print("-" * 80)
        for change in changes:
            track_str = f"[{change['track_num']:02d}]" if change['track_num'] else "[--]"
            print(f"{track_str} {change['old_name']}")
            print(f"     → {change['new_name']}")
            print()
    
    if skipped:
        print("\n⚠️  변경되지 않는 파일:")
        print("-" * 80)
        for old_name, reason in skipped:
            print(f"  • {old_name}")
            print(f"    이유: {reason}")
        print()
    
    # 실행 확인
    if dry_run:
        print("=" * 80)
        print("🔍 시뮬레이션 모드 (실제 변경 안 됨)")
        print(f"✓ 변경 예정: {len(changes)}개")
        print(f"✓ 스킵: {len(skipped)}개")
        print()
        print("실제로 변경하려면 스크립트를 다시 실행하세요.")
        return changes
    else:
        print("=" * 80)
        print(f"📝 {len(changes)}개 파일을 변경하시겠습니까?")
        print("   원본은 '_backup_originals' 폴더에 백업됩니다.")
        print()
        confirm = input("계속하려면 'yes' 입력: ").strip().lower()
        
        if confirm != 'yes':
            print("❌ 취소되었습니다.")
            return
        
        # 백업 및 변경 실행
        success = 0
        for change in changes:
            try:
                # 백업
                backup_path = backup_folder / change['old_name']
                shutil.copy2(change['old'], backup_path)
                
                # 이름 변경
                change['old'].rename(change['new'])
                success += 1
                print(f"✓ {change['new_name']}")
            except Exception as e:
                print(f"✗ {change['old_name']} - 오류: {e}")
        
        print()
        print("=" * 80)
        print(f"✅ 완료! {success}/{len(changes)}개 파일 변경됨")
        print(f"📁 백업 위치: {backup_folder}")

def main():
    print("=" * 80)
    print("SOUNDSTORM 음원 파일명 일괄 변경")
    print("=" * 80)
    print()
    print("이 스크립트는 한글 제목을 최적화된 영문 제목으로 변경합니다.")
    print("원본 파일은 자동으로 백업됩니다.")
    print()
    
    # 폴더 경로 입력
    folder_path = input("📁 음원 폴더 경로: ").strip().strip('"').strip("'")
    
    if not os.path.exists(folder_path):
        print(f"❌ 폴더를 찾을 수 없습니다: {folder_path}")
        return
    
    print()
    print("🔍 먼저 시뮬레이션을 실행합니다...")
    print()
    
    # 시뮬레이션 실행
    changes = rename_audio_files(folder_path, dry_run=True)
    
    if not changes:
        print("\n변경할 파일이 없습니다.")
        return
    
    print()
    proceed = input("실제로 변경하시겠습니까? (yes/no): ").strip().lower()
    
    if proceed == 'yes':
        print()
        rename_audio_files(folder_path, dry_run=False)
    else:
        print("취소되었습니다.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  사용자가 중단했습니다.")
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
    
    input("\n계속하려면 Enter를 누르세요...")
