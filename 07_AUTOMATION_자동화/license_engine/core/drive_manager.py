import os
import json
import logging
from functools import lru_cache
from datetime import datetime
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError
from license_engine.config import Config
import io

class DriveManagerError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(self.message)

class DriveManager:
    SCOPES = ['https://www.googleapis.com/auth/drive']

    def __init__(self):
        try:
            creds = Credentials.from_service_account_file(
                Config.SERVICE_ACCOUNT_FILE, scopes=self.SCOPES)
            self.service = build('drive', 'v3', credentials=creds)
        except Exception as e:
            # 런타임에 서비스 계정 키패일 에러 등은 처리 시점에 구체화
            self.service = None

    def _ensure_service(self):
        if not self.service:
            try:
                creds = Credentials.from_service_account_file(
                    Config.SERVICE_ACCOUNT_FILE, scopes=self.SCOPES)
                self.service = build('drive', 'v3', credentials=creds)
            except Exception as e:
                raise DriveManagerError("ERR003", f"Drive 계정 인증 실패: {str(e)}")

    def _get_or_create_folder(self, folder_name: str, parent_id: str) -> str:
        """이름과 부모 ID로 폴더를 찾거나 없으면 생성합니다."""
        query = f"name='{folder_name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = self.service.files().list(q=query, fields="files(id, name)").execute()
        files = results.get('files', [])
        
        if files:
            return files[0]['id']
            
        file_metadata = {
            'name': folder_name,
            'parents': [parent_id],
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = self.service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')
        
    def _delete_file_or_folder(self, file_id: str):
        """실패 시 롤백을 위해 파일이나 폴더를 삭제합니다."""
        try:
            self.service.files().delete(fileId=file_id).execute()
        except Exception:
            pass 

    @lru_cache(maxsize=1)
    def _load_tracks_index(self) -> dict:
        """
        tracks.json 로드 순서:
          1단계: GCS (gs://soundstorm-config/tracks.json) — Cloud Run 환경
          2단계: 로컬 data/tracks.json — 로컬/스탠드얼론 환경 fallback
        """
        # 1단계: GCS
        try:
            from google.cloud import storage
            client = storage.Client()
            blob = client.bucket("soundstorm-config").blob("tracks.json")
            if blob.exists():
                data = json.loads(blob.download_as_text())
                logging.info("[tracks] GCS에서 로드 완료 (%d개)", len(data))
                return {k: v for k, v in data.items() if not k.startswith('_')}
        except Exception as e:
            logging.warning("[tracks] GCS 로드 실패, 로컬 fallback: %s", e)

        # 2단계: 로컬 파일
        tracks_path = os.path.join(Config.BASE_DIR, 'data', 'tracks.json')
        try:
            with open(tracks_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logging.info("[tracks] 로컬 파일에서 로드 (%d개)", len(data))
            return {k: v for k, v in data.items() if not k.startswith('_')}
        except (FileNotFoundError, json.JSONDecodeError):
            logging.warning("[tracks] 로컬 tracks.json 없음 → Drive 전체 스캔 원본fallback")
            return {}

    def _find_files_by_youtube_id(self, youtube_id: str, folder_id: str) -> list:
        """youtube_id를 포함하는 모든 파일을 반환합니다 (.wav, .mp3 등 두 가지 모두 지원)."""
        # Drive API의 name contains 쿼리 사용
        query = f"name contains '{youtube_id}' and '{folder_id}' in parents and trashed=false"
        results = self.service.files().list(q=query, fields="files(id, name)").execute()
        files = results.get('files', [])
        
        if files:
            logging.info("[Drive 검색] %s → %d개 파일 매칭됨", youtube_id, len(files))
            return files

        # 2단계: 폴더 전체 스캔 fallback (API 쿼리 실패 시 대비)
        logging.warning("[Drive 검색] %s 매핑 없음 → Drive 전체 스캔 fallback", youtube_id)
        results = self.service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="files(id, name)",
            pageSize=1000
        ).execute()
        
        fallback_files = []
        for f in results.get('files', []):
            if youtube_id in f['name']:
                logging.info("[Drive scan] %s → %s 매칭", youtube_id, f['name'])
                fallback_files.append(f)
                
        return fallback_files

    def download_files(self, youtube_id: str, target_folder_id: str, save_dir: str) -> list[str]:
        """Drive 폴더 내에서 YouTube ID가 파일명에 포함된 모든 파일(.wav, .mp3)을 찾아 로컬로 다운로드합니다."""
        self._ensure_service()
        try:
            matched_files = self._find_files_by_youtube_id(youtube_id, target_folder_id)
            
            if not matched_files:
                raise DriveManagerError("DRV005", f"YouTube ID [{youtube_id}]가 포함된 음원 파일을 Drive에서 찾지 못했습니다.")

            downloaded_paths = []
            for matched in matched_files:
                file_id = matched['id']
                file_name = matched['name']
                save_path = os.path.join(save_dir, file_name)
                
                request = self.service.files().get_media(fileId=file_id)
                fh = io.FileIO(save_path, 'wb')
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while done is False:
                    status, done = downloader.next_chunk()
                    
                downloaded_paths.append(save_path)
                
            return downloaded_paths
        except Exception as e:
            if isinstance(e, DriveManagerError):
                raise
            raise DriveManagerError("DRV006", f"Drive 파일 다운로드 실패: {str(e)}")

    def create_license_package(self, license_number: str, track_id: str, pdf_path: str, buyer_email: str) -> str:
        """
        Drive 연도 폴더 확인/생성 -> 복사/업로드 -> 권한 부여 -> 링크 반환
        Drive 폴더 생성 실패 시 ValueError 발생
        업로드 실패 시 생성된 하위 폴더 삭제 (롤백)
        """
        self._ensure_service()
        year_str = datetime.now().strftime("%Y")
        
        # 1. 연도 폴더 확인 또는 생성
        try:
            year_folder_id = self._get_or_create_folder(year_str, Config.DRIVE_ROOT_FOLDER_ID)
        except Exception as e:
            raise DriveManagerError("ERR003", f"Drive 연도 폴더 생성/확인 실패: {str(e)}")
            
        # 2. 라이선스 전용 폴더 생성
        try:
            license_folder_id = self._get_or_create_folder(license_number, year_folder_id)
        except Exception as e:
            raise DriveManagerError("ERR003", f"Drive 라이선스 폴더 생성 실패: {str(e)}")
            
        # 3, 4, 5 업로드 로직 (실패 시 롤백 수행)
        try:
            # 3. 마스터 오디오 WAV 복사 (YouTube ID로 파일 매칭)
            matched = self._find_file_by_youtube_id(track_id, Config.MASTER_AUDIO_FOLDER_ID)
            
            if not matched:
                raise Exception(f"YouTube ID [{track_id}]가 포함된 음원 파일을 찾지 못함")

            self.service.files().copy(
                fileId=matched['id'],
                body={'parents': [license_folder_id], 'name': matched['name']}
            ).execute()
            
            # 4. 생성된 PDF 업로드
            pdf_filename = os.path.basename(pdf_path)
            file_metadata = {'name': pdf_filename, 'parents': [license_folder_id]}
            media = MediaFileUpload(pdf_path, mimetype='application/pdf')
            self.service.files().create(body=file_metadata, media_body=media, fields='id').execute()
            
            # 5. 권한 부여 (구매자 접근 가능)
            permission = {
                'type': 'user',
                'role': 'reader',
                'emailAddress': buyer_email
            }
            self.service.permissions().create(
                fileId=license_folder_id,
                body=permission,
                fields='id'
            ).execute()
            
            # 6. 다운로드 링크 리턴
            folder = self.service.files().get(fileId=license_folder_id, fields='webViewLink').execute()
            return folder.get('webViewLink')
            
        except Exception as e:
            # 트랜잭션 롤백: 방금 만든 라이선스 폴더 삭제
            self._delete_file_or_folder(license_folder_id)
            raise DriveManagerError("ERR003", f"Drive 파일 처리 중 오류 발생 (롤백됨): {str(e)}")

drive_manager = DriveManager()
