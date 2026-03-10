import gspread
from google.oauth2.service_account import Credentials
from core.path_config import CREDENTIALS_DIR

SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
CREDENTIALS_PATH = CREDENTIALS_DIR / "service_account.json"

def main():
    print("🔍 [디버그] 영상ID 매핑 원인 규명 스크립트 가동\n")
    
    scopes = ['https://www.googleapis.com/auth/spreadsheets']
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes)
    gc = gspread.authorize(creds)
    ss = gc.open_by_key(SPREADSHEET_ID)
    
    # 1. RawData_Master 헤더 시각화
    print("===============================")
    print("① Raw 시트 헤더 정확 확인")
    print("===============================")
    ws_raw = ss.worksheet('_RawData_Master')
    raw_headers = ws_raw.row_values(1)
    print("실제 추출된 Raw_Headers 리스트:")
    print(raw_headers)
    print(f"\n- 'video_id' 포함 여부: {'video_id' in raw_headers}")
    print(f"- '영상ID' 포함 여부: {'영상ID' in raw_headers}")
    
    # Apps Script의 createMap()과 동일한 로직 모사 (소문자 & 좌우 공백 제거)
    raw_map = {}
    for i, h in enumerate(raw_headers):
        if h:
            raw_map[str(h).lower().strip()] = i
            
    print("\n===============================")
    print("② rawMap 매핑 결과 (소문자/strip 처리됨)")
    print("===============================")
    print("가상 생성된 rawMap:")
    import pprint
    pprint.pprint(raw_map)
    print(f"\n- rawMap['video_id'] 존재 여부: {'video_id' in raw_map}")
    print(f"- rawMap['영상id'] 존재 여부: {'영상id' in raw_map}")

if __name__ == '__main__':
    main()
