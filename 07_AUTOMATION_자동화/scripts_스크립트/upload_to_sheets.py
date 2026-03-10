#!/usr/bin/env python3
"""
Google Sheets 업로드 헬퍼 스크립트

Excel 파일을 Google Sheets로 업로드하고 브라우저에서 자동으로 엽니다.
"""

import os
import pickle
from pathlib import Path
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.http import MediaFileUpload
import webbrowser

# Google Drive API 설정
SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/drive.file'
]

SCRIPT_DIR = Path(__file__).parent


def get_authenticated_service():
    """Google API 인증"""
    credentials = None
    token_file = SCRIPT_DIR / 'token.pickle'
    
    if token_file.exists():
        with open(token_file, 'rb') as token:
            credentials = pickle.load(token)
    
    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            client_secret_file = SCRIPT_DIR / 'client_secret.json'
            if not client_secret_file.exists():
                raise FileNotFoundError("client_secret.json 파일을 찾을 수 없습니다.")
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secret_file), SCOPES)
            credentials = flow.run_local_server(port=0)
        
        with open(token_file, 'wb') as token:
            pickle.dump(credentials, token)
    
    return build('drive', 'v3', credentials=credentials)


def upload_to_google_sheets(excel_file_path, folder_name='YouTube Analytics'):
    """
    Excel 파일을 Google Sheets로 업로드
    
    Args:
        excel_file_path: 업로드할 Excel 파일 경로
        folder_name: Google Drive 폴더 이름 (없으면 생성)
    
    Returns:
        Google Sheets URL
    """
    drive_service = get_authenticated_service()
    
    # 폴더 찾기 또는 생성
    folder_id = None
    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = drive_service.files().list(q=query, fields='files(id, name)').execute()
    folders = results.get('files', [])
    
    if folders:
        folder_id = folders[0]['id']
        print(f"✓ 기존 폴더 사용: {folder_name}")
    else:
        # 폴더 생성
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
        folder_id = folder['id']
        print(f"✓ 새 폴더 생성: {folder_name}")
    
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
    
    file_id = file['id']
    web_view_link = file['webViewLink']
    
    print(f"✓ Google Sheets 업로드 완료: {file_name}")
    print(f"  URL: {web_view_link}")
    
    return web_view_link


def open_in_browser(url):
    """브라우저에서 URL 열기"""
    webbrowser.open(url)
    print(f"✓ 브라우저에서 열기: {url}")


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("사용법: python3 upload_to_sheets.py <excel_file_path>")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    
    if not Path(excel_file).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {excel_file}")
        sys.exit(1)
    
    print(f"\n📤 Google Sheets 업로드 중: {Path(excel_file).name}")
    url = upload_to_google_sheets(excel_file)
    open_in_browser(url)
