import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from license_engine.core.drive_manager import drive_manager
from license_engine.config import Config
from googleapiclient.http import MediaFileUpload

def upload_dummy_wav():
    drive_manager._ensure_service()
    
    with open("SS014.wav", "wb") as f:
        f.write(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00")
    
    file_metadata = {'name': 'SS014.wav', 'parents': [Config.MASTER_AUDIO_FOLDER_ID]}
    media = MediaFileUpload('SS014.wav', mimetype='audio/wav')
    drive_manager.service.files().create(body=file_metadata, media_body=media, fields='id').execute()
    print("Dummy SS014.wav uploaded to MASTER AUDIO FOLDER.")

if __name__ == '__main__':
    upload_dummy_wav()
