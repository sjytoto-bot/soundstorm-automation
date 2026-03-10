#!/usr/bin/env python3
"""
SOUNDSTORM YouTube 채널 데이터 수집 스크립트

이 스크립트는 YouTube Data API v3를 사용하여:
- 채널의 모든 비디오 목록 수집
- 각 비디오의 상세 정보 (조회수, 좋아요, 댓글 수 등)
- 썸네일 이미지 다운로드
- 댓글 수집 및 키워드 분석
- 결과를 Excel 및 JSON으로 저장
"""

import os
import pickle
import json
from datetime import datetime
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.http import MediaFileUpload
import pandas as pd
import requests
import webbrowser
from pathlib import Path

# YouTube API 설정
SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/drive.file'
]
API_SERVICE_NAME = 'youtube'
API_VERSION = 'v3'

# 채널 ID (SOUNDSTORM)
CHANNEL_ID = 'UCAvSo9RLq0rCy64IH2nm91w'

# 출력 폴더 설정
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'output'
THUMBNAILS_DIR = OUTPUT_DIR / 'thumbnails'
OUTPUT_DIR.mkdir(exist_ok=True)
THUMBNAILS_DIR.mkdir(exist_ok=True)


def get_authenticated_service():
    """YouTube API 인증 및 서비스 객체 반환"""
    credentials = None
    token_file = SCRIPT_DIR / 'token.pickle'
    
    # 저장된 토큰이 있으면 로드
    if token_file.exists():
        with open(token_file, 'rb') as token:
            credentials = pickle.load(token)
    
    # 유효한 credentials가 없으면 로그인
    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            client_secret_file = SCRIPT_DIR / 'client_secret.json'
            if not client_secret_file.exists():
                raise FileNotFoundError(
                    f"client_secret.json 파일을 찾을 수 없습니다.\n"
                    f"api_setup_guide.md를 참고하여 OAuth 자격 증명을 다운로드하세요."
                )
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secret_file), SCOPES)
            credentials = flow.run_local_server(port=0)
        
        # 토큰 저장
        with open(token_file, 'wb') as token:
            pickle.dump(credentials, token)
    
    return build(API_SERVICE_NAME, API_VERSION, credentials=credentials)


def get_channel_info(youtube, channel_id):
    """채널 기본 정보 조회"""
    request = youtube.channels().list(
        part='snippet,statistics',
        id=channel_id
    )
    response = request.execute()
    
    if not response['items']:
        raise ValueError(f"채널 ID {channel_id}를 찾을 수 없습니다.")
    
    channel = response['items'][0]
    return {
        'channel_id': channel_id,
        'channel_title': channel['snippet']['title'],
        'description': channel['snippet']['description'],
        'subscriber_count': int(channel['statistics'].get('subscriberCount', 0)),
        'video_count': int(channel['statistics']['videoCount']),
        'view_count': int(channel['statistics']['viewCount']),
        'published_at': channel['snippet']['publishedAt']
    }


def get_all_videos(youtube, channel_id):
    """채널의 모든 비디오 ID 목록 가져오기"""
    # 채널의 업로드 재생목록 ID 가져오기
    request = youtube.channels().list(
        part='contentDetails',
        id=channel_id
    )
    response = request.execute()
    uploads_playlist_id = response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
    
    # 재생목록의 모든 비디오 가져오기
    videos = []
    next_page_token = None
    
    while True:
        request = youtube.playlistItems().list(
            part='contentDetails',
            playlistId=uploads_playlist_id,
            maxResults=50,
            pageToken=next_page_token
        )
        response = request.execute()
        
        for item in response['items']:
            videos.append(item['contentDetails']['videoId'])
        
        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break
    
    return videos


def get_video_details(youtube, video_ids):
    """비디오 상세 정보 가져오기 (최대 50개씩)"""
    all_video_data = []
    
    # API는 한 번에 최대 50개까지만 조회 가능
    for i in range(0, len(video_ids), 50):
        batch_ids = video_ids[i:i+50]
        
        request = youtube.videos().list(
            part='snippet,statistics,contentDetails',
            id=','.join(batch_ids)
        )
        response = request.execute()
        
        for video in response['items']:
            video_data = {
                'video_id': video['id'],
                'title': video['snippet']['title'],
                'description': video['snippet']['description'],
                'published_at': video['snippet']['publishedAt'],
                'thumbnail_url': video['snippet']['thumbnails'].get('maxres', 
                                  video['snippet']['thumbnails'].get('high', 
                                  video['snippet']['thumbnails']['default']))['url'],
                'duration': video['contentDetails']['duration'],
                'view_count': int(video['statistics'].get('viewCount', 0)),
                'like_count': int(video['statistics'].get('likeCount', 0)),
                'comment_count': int(video['statistics'].get('commentCount', 0)),
                'tags': video['snippet'].get('tags', []),
                'video_url': f"https://www.youtube.com/watch?v={video['id']}"
            }
            all_video_data.append(video_data)
    
    return all_video_data


def download_thumbnail(url, video_id, save_dir):
    """썸네일 이미지 다운로드"""
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            file_path = save_dir / f"{video_id}.jpg"
            with open(file_path, 'wb') as f:
                f.write(response.content)
            return str(file_path)
    except Exception as e:
        print(f"썸네일 다운로드 실패 ({video_id}): {e}")
    return None


def upload_to_google_sheets(excel_file_path, folder_name='YouTube Analytics'):
    """Excel 파일을 Google Sheets로 업로드하고 URL 반환"""
    try:
        credentials = None
        token_file = SCRIPT_DIR / 'token.pickle'
        
        if token_file.exists():
            with open(token_file, 'rb') as token:
                credentials = pickle.load(token)
        
        drive_service = build('drive', 'v3', credentials=credentials)
        
        # 폴더 찾기 또는 생성
        folder_id = None
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = drive_service.files().list(q=query, fields='files(id, name)').execute()
        folders = results.get('files', [])
        
        if folders:
            folder_id = folders[0]['id']
        else:
            folder_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
            folder_id = folder['id']
        
        # Excel 파일 업로드 (Google Sheets로 변환)
        file_name = Path(excel_file_path).stem
        file_metadata = {
            'name': file_name,
            'mimeType': 'application/vnd.google-apps.spreadsheet',
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(
            excel_file_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            resumable=True
        )
        
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        return file['webViewLink']
    except Exception as e:
        print(f"⚠️  Google Sheets 업로드 실패: {e}")
        return None


def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("SOUNDSTORM YouTube 채널 데이터 수집 시작")
    print("=" * 60)
    
    # YouTube API 인증
    print("\n[1/5] YouTube API 인증 중...")
    youtube = get_authenticated_service()
    print("✓ 인증 완료")
    
    # 채널 정보 조회
    print("\n[2/5] 채널 정보 조회 중...")
    channel_info = get_channel_info(youtube, CHANNEL_ID)
    print(f"✓ 채널: {channel_info['channel_title']}")
    print(f"  - 구독자: {channel_info['subscriber_count']:,}명")
    print(f"  - 총 비디오: {channel_info['video_count']:,}개")
    print(f"  - 총 조회수: {channel_info['view_count']:,}회")
    
    # 모든 비디오 ID 가져오기
    print("\n[3/5] 비디오 목록 가져오는 중...")
    video_ids = get_all_videos(youtube, CHANNEL_ID)
    print(f"✓ {len(video_ids)}개 비디오 발견")
    
    # 비디오 상세 정보 가져오기
    print("\n[4/5] 비디오 상세 정보 수집 중...")
    videos_data = get_video_details(youtube, video_ids)
    print(f"✓ {len(videos_data)}개 비디오 정보 수집 완료")
    
    # 썸네일 다운로드
    print("\n[5/5] 썸네일 다운로드 중...")
    for i, video in enumerate(videos_data, 1):
        print(f"  [{i}/{len(videos_data)}] {video['title'][:50]}...")
        thumbnail_path = download_thumbnail(
            video['thumbnail_url'], 
            video['video_id'], 
            THUMBNAILS_DIR
        )
        video['thumbnail_local_path'] = thumbnail_path
    
    # 결과 저장
    print("\n결과 저장 중...")
    
    # JSON 저장
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    json_file = OUTPUT_DIR / f'youtube_data_{timestamp}.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            'channel_info': channel_info,
            'videos': videos_data,
            'collected_at': datetime.now().isoformat()
        }, f, ensure_ascii=False, indent=2)
    print(f"✓ JSON 저장: {json_file}")
    
    # Excel 저장
    excel_file = OUTPUT_DIR / f'youtube_data_{timestamp}.xlsx'
    
    # 채널 정보 시트
    df_channel = pd.DataFrame([channel_info])
    
    # 비디오 정보 시트
    df_videos = pd.DataFrame(videos_data)
    df_videos['tags'] = df_videos['tags'].apply(lambda x: ', '.join(x) if x else '')
    
    with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
        df_channel.to_excel(writer, sheet_name='채널 정보', index=False)
        df_videos.to_excel(writer, sheet_name='비디오 목록', index=False)
    
    print(f"✓ Excel 저장: {excel_file}")
    
    # Google Sheets 업로드
    print("\n📤 Google Sheets 업로드 중...")
    sheets_url = upload_to_google_sheets(excel_file)
    if sheets_url:
        print(f"✓ Google Sheets 업로드 완료!")
        print(f"  URL: {sheets_url}")
        print("\n🌐 브라우저에서 열기...")
        webbrowser.open(sheets_url)
    
    # 요약 통계
    print("\n" + "=" * 60)
    print("수집 완료!")
    print("=" * 60)
    print(f"총 비디오: {len(videos_data)}개")
    print(f"평균 조회수: {sum(v['view_count'] for v in videos_data) / len(videos_data):,.0f}회")
    print(f"평균 좋아요: {sum(v['like_count'] for v in videos_data) / len(videos_data):,.0f}개")
    print(f"평균 댓글: {sum(v['comment_count'] for v in videos_data) / len(videos_data):,.0f}개")
    print(f"\n출력 폴더: {OUTPUT_DIR}")
    if sheets_url:
        print(f"Google Sheets: {sheets_url}")


if __name__ == '__main__':
    main()
