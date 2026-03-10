import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.core.drive_manager import drive_manager
from license_engine.config import Config

def list_master_audio():
    drive_manager._ensure_service()
    query = f"'{Config.MASTER_AUDIO_FOLDER_ID}' in parents and trashed=false"
    results = drive_manager.service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    print("Files in MASTER AUDIO FOLDER:")
    for f in files:
        print(f.get('name'))

if __name__ == '__main__':
    list_master_audio()
