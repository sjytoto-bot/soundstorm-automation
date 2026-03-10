"""
SOUNDSTORM 음원 길이 자동 추출 스크립트
============================================

이 스크립트는 폴더 내 모든 음원 파일의 길이를 자동으로 추출합니다.

지원 포맷: MP3, WAV, FLAC, M4A, AAC, OGG, WMA
"""

import os
import json
from pathlib import Path

def get_duration_mutagen(filepath):
    """Mutagen 라이브러리로 음원 길이 추출"""
    try:
        from mutagen import File
        audio = File(filepath)
        if audio is not None and audio.info is not None:
            duration_seconds = audio.info.length
            minutes = int(duration_seconds // 60)
            seconds = int(duration_seconds % 60)
            return f"{minutes}:{seconds:02d}"
    except Exception as e:
        return None
    return None

def get_duration_pydub(filepath):
    """Pydub 라이브러리로 음원 길이 추출 (백업)"""
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(filepath)
        duration_ms = len(audio)
        duration_seconds = duration_ms / 1000
        minutes = int(duration_seconds // 60)
        seconds = int(duration_seconds % 60)
        return f"{minutes}:{seconds:02d}"
    except Exception as e:
        return None

def extract_track_number(filename):
    """파일명에서 트랙 번호 추출"""
    import re
    # 패턴: "01", "1.", "Track 01", etc.
    patterns = [
        r'^(\d+)[\s._-]',  # 01 The King's Spirit.wav
        r'[Tt]rack[\s._-]?(\d+)',  # Track 01.wav
        r'\((\d+)\)',  # (01) The King's Spirit.wav
    ]
    
    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            return int(match.group(1))
    
    return None

def scan_audio_files(folder_path):
    """폴더 내 모든 음원 파일 스캔"""
    audio_extensions = {'.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'}
    
    audio_files = []
    folder = Path(folder_path)
    
    for file in folder.rglob('*'):
        if file.is_file() and file.suffix.lower() in audio_extensions:
            audio_files.append(file)
    
    return sorted(audio_files, key=lambda x: x.name)

def main():
    print("=" * 60)
    print("SOUNDSTORM 음원 길이 자동 추출 스크립트")
    print("=" * 60)
    print()
    
    # 라이브러리 체크
    print("📦 필요한 라이브러리 확인 중...")
    try:
        import mutagen
        print("  ✓ mutagen 설치됨")
        use_mutagen = True
    except ImportError:
        print("  ✗ mutagen 없음 (pip install mutagen 실행 필요)")
        use_mutagen = False
    
    try:
        import pydub
        print("  ✓ pydub 설치됨")
        use_pydub = True
    except ImportError:
        print("  ✗ pydub 없음 (pip install pydub 실행 필요)")
        use_pydub = False
    
    if not use_mutagen and not use_pydub:
        print("\n❌ 오류: 최소 하나의 라이브러리가 필요합니다.")
        print("다음 명령어 실행:")
        print("  pip install mutagen")
        print("또는")
        print("  pip install pydub")
        return
    
    print()
    
    # 폴더 경로 입력
    print("📁 음원 파일이 있는 폴더 경로를 입력하세요:")
    print("   (예: C:\\Music\\SOUNDSTORM 또는 /Users/name/Music/SOUNDSTORM)")
    print()
    folder_path = input("폴더 경로: ").strip().strip('"').strip("'")
    
    if not os.path.exists(folder_path):
        print(f"\n❌ 오류: 폴더를 찾을 수 없습니다: {folder_path}")
        return
    
    print()
    print("🔍 음원 파일 검색 중...")
    audio_files = scan_audio_files(folder_path)
    
    if not audio_files:
        print(f"❌ 음원 파일을 찾을 수 없습니다: {folder_path}")
        return
    
    print(f"✓ {len(audio_files)}개 파일 발견")
    print()
    
    # 길이 추출
    print("⏱️  파일 길이 추출 중...")
    print()
    
    results = []
    for i, audio_file in enumerate(audio_files, 1):
        filename = audio_file.name
        
        # 길이 추출 시도
        duration = None
        if use_mutagen:
            duration = get_duration_mutagen(str(audio_file))
        
        if duration is None and use_pydub:
            duration = get_duration_pydub(str(audio_file))
        
        # 트랙 번호 추출
        track_num = extract_track_number(filename)
        
        # 결과 저장
        result = {
            'track_number': track_num,
            'filename': filename,
            'duration': duration if duration else 'ERROR',
            'filepath': str(audio_file)
        }
        results.append(result)
        
        # 진행상황 표시
        status = "✓" if duration else "✗"
        print(f"  {status} [{i:2d}/{len(audio_files)}] {filename[:50]:50s} → {duration if duration else 'ERROR'}")
    
    print()
    print("=" * 60)
    
    # 결과 정렬 (트랙 번호 순)
    results_with_track = [r for r in results if r['track_number'] is not None]
    results_without_track = [r for r in results if r['track_number'] is None]
    
    results_with_track.sort(key=lambda x: x['track_number'])
    results = results_with_track + results_without_track
    
    # CSV 저장
    output_file = os.path.join(folder_path, "SOUNDSTORM_durations.csv")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("Track Number,Filename,Duration,Filepath\n")
        for r in results:
            track = r['track_number'] if r['track_number'] else ''
            f.write(f"{track},{r['filename']},{r['duration']},{r['filepath']}\n")
    
    print(f"✅ 완료!")
    print(f"📄 결과 파일: {output_file}")
    print()
    
    # 통계
    success = sum(1 for r in results if r['duration'] != 'ERROR')
    print(f"📊 통계:")
    print(f"  - 성공: {success}/{len(results)}곡")
    print(f"  - 실패: {len(results) - success}곡")
    
    if len(results) - success > 0:
        print()
        print("⚠️  일부 파일 처리 실패:")
        for r in results:
            if r['duration'] == 'ERROR':
                print(f"  - {r['filename']}")
    
    print()
    print("📤 다음 단계:")
    print(f"  1. {output_file} 파일을 확인하세요")
    print("  2. 이 파일을 Claude에게 업로드하세요")
    print("  3. 메타데이터 시트에 자동으로 입력해드립니다!")
    print()

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
