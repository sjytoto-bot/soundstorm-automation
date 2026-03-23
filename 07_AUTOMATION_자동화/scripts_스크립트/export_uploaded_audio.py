import os
import re
import pandas as pd
from pydub import AudioSegment
import logging

# 스크립트 실행 위치 기준 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/01_YOUTUBE_유튜브자료/01_uploaded_업로드완료"

MUSIC_DIR = os.path.join(BASE, "music_음원")
VIDEO_DIR = os.path.join(BASE, "videos_영상")
EXPORT_DIR = os.path.join(BASE, "EXPORT_AUDIO")

# 로그 및 실행 Lock 설정
LOG_DIR = os.path.join(SCRIPT_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "export_audio.log")

LOCK_FILE = os.path.join(SCRIPT_DIR, "export.lock")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

def log_msg(msg):
    # 콘솔 출력과 동시에 로그 파일에 작성 (배치 환경 안정성을 위함)
    print(msg)
    logging.info(msg)


def normalize_title(text):
    """
    제목 정규화 (파일 탐색 매칭용)
    1. Mac의 NFD(초/중/종성 분리) 처리 문제를 해결하기 위해 우선 NFC로 변환
    2. 괄호와 그 안의 내용 제거 (예: (Siren) -> )
    3. 특수문자 제거 (알파벳, 숫자, 한글만 남김)
    4. 공백 제거
    5. 소문자 변환
    """
    import unicodedata
    if pd.isna(text):
        return ""
    text = str(text)
    
    # 1. Mac 환경을 위한 NFC 유니코드 정규화 (가-힣 범위 탐색을 위해 선행 필수)
    text = unicodedata.normalize('NFC', text)
    
    # 2. 괄호 내용 삭제
    text = re.sub(r'\([^)]*\)', '', text)
    text = re.sub(r'\[[^]]*\]', '', text)
    
    # 3. 특수문자 제거
    text = re.sub(r'[^a-zA-Z0-9가-힣\s]', '', text)
    
    # 4. 공백 제거
    text = re.sub(r'\s+', '', text)
    
    # 5. 소문자 변환
    text = text.lower()
    return text


def process_exports():
    os.makedirs(EXPORT_DIR, exist_ok=True)

    # 1. track_list.csv 경로 설정
    csv_path = os.path.join(SCRIPT_DIR, "track_list.csv")
    if not os.path.exists(csv_path):
        csv_path = os.path.join(BASE, "track_list.csv")
        
    try:
        sheet = pd.read_csv(csv_path)
        # 만약 'SS_음원마스터_최종.csv' 포맷처럼 첫 줄이 메타데이터고 두 번째 줄(index 1)이 헤더라면 다시 읽기
        if 'product_id' not in sheet.columns and '상품ID' not in sheet.columns:
            sheet = pd.read_csv(csv_path, header=1)
            
        # 한글 컬럼명이 존재한다면 영문 컬럼명으로 통일되도록 매핑
        rename_map = {
            '상품ID': 'product_id',
            '영상ID': 'video_id',
            '곡명': 'title'
        }
        sheet = sheet.rename(columns=rename_map)
        
    except FileNotFoundError:
        log_msg(f"[ERROR] '{csv_path}' 시트 파일을 찾을 수 없습니다.")
        return

    # 필수 컬럼 존재 여부 체크
    if "product_id" not in sheet.columns or "video_id" not in sheet.columns or "title" not in sheet.columns:
        log_msg("[ERROR] 시트에 필수 컬럼(product_id, video_id, title)이 누락되었습니다.")
        return

    audio_ext = [".wav", ".flac", ".aiff", ".mp3"]
    video_ext = [".mp4", ".mov", ".mkv"]

    # --- 파일 인덱스 생성 (성능 개선 O(n)) ---
    music_index = {}
    if os.path.exists(MUSIC_DIR):
        for filename in os.listdir(MUSIC_DIR):
            name, ext = os.path.splitext(filename)
            if ext.lower() in audio_ext:
                key = normalize_title(name)
                music_index[key] = os.path.join(MUSIC_DIR, filename)

    video_index = {}
    if os.path.exists(VIDEO_DIR):
        for filename in os.listdir(VIDEO_DIR):
            name, ext = os.path.splitext(filename)
            if ext.lower() in video_ext:
                key = normalize_title(name)
                video_index[key] = os.path.join(VIDEO_DIR, filename)

    # 2. 시트 반복 처리 진행
    for _, row in sheet.iterrows():
        try:
            product_id = str(row["product_id"]).strip()
            video_id = str(row["video_id"]).strip()
            raw_title = str(row["title"]).strip()
            
            if pd.isna(raw_title) or not raw_title or str(raw_title).lower() == 'nan':
                continue
                
            # 3. 정규화된 최종 export 파일명 조합 (출력용은 대소문자 유지형)
            display_title = re.sub(r'\([^)]*\)', '', raw_title)    
            display_title = re.sub(r'\[[^]]*\]', '', display_title) 
            display_title = re.sub(r'[^a-zA-Z0-9가-힣]', '', display_title) 

            base_name = f"{product_id}_{video_id}_{display_title}"
            
            wav_out = os.path.join(EXPORT_DIR, base_name + ".wav")
            mp3_out = os.path.join(EXPORT_DIR, base_name + ".mp3")

            # --- 이미 Export된 파일 자동 Skip (성능/I/O 최적화) ---
            if os.path.exists(wav_out) and os.path.exists(mp3_out):
                log_msg(f"[SKIP EXIST] {base_name}")
                continue

            # 4. 곡 제목(title) 기준으로 인덱스 탐색 (1순위: 음원 폴더, 2순위: 영상 폴더)
            key = normalize_title(raw_title)
            
            # [1] 정확하게 일치하는지 탐색
            source_path = music_index.get(key)
            if source_path is None:
                source_path = video_index.get(key)

            # [2] 포함하는 단어(부분 일치)로 탐색 (실제 파일명들이 '2월8일_군주.mp4' 와 같이 되어있는 경우 대비)
            if source_path is None and key:
                for idx_key, path in music_index.items():
                    if key in idx_key:
                        source_path = path
                        break
                        
            if source_path is None and key:
                for idx_key, path in video_index.items():
                    if key in idx_key:
                        source_path = path
                        break

            # 모두 없을 경우 SKIP
            if source_path is None:
                log_msg(f"[NOT FOUND] {raw_title}")
                continue

            # 5. 오디오 추출
            audio = AudioSegment.from_file(source_path)

            # 6. 저장
            audio.export(wav_out, format="wav")
            audio.export(mp3_out, format="mp3", bitrate="320k")

            log_msg(f"[OK] {base_name}")
            
        except Exception as e:
            # 예외가 발생하더라도 루프를 종료하지 않고 다음 곡을 처리
            log_msg(f"[ERROR] {raw_title} 처리 중 에러 발생: {e}")
            continue


def main():
    if os.path.exists(LOCK_FILE):
        print("[LOCK] Script already running")
        return
        
    # Lock 파일 생성
    open(LOCK_FILE, "w").close()
    
    try:
        log_msg("[START]")
        process_exports()
    finally:
        log_msg("[END]\n")
        # 스크립트 종료 시 Lock 해제
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)

if __name__ == "__main__":
    main()
