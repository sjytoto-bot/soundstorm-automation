#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Sheets 연동 스크립트
CSV 데이터를 Google Sheets로 업로드하고 실시간 동기화
"""

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import pandas as pd
from pathlib import Path
import json

# ============================================================
# 설정
# ============================================================

BASE_DIR = Path(__file__).parent
ANALYTICS_DIR = BASE_DIR.parent.parent / '01_YOUTUBE_유튜브자료' / 'analytics_데이터'

# CSV 파일
INPUT_CSV = ANALYTICS_DIR / 'SS_음원마스터_최종.csv'
OUTPUT_CSV = ANALYTICS_DIR / 'SS_음원마스터_최종.csv'

# Google Sheets 설정
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 
          'https://www.googleapis.com/auth/drive']

# 서비스 계정 키 파일 경로 (사용자가 설정해야 함)
SERVICE_ACCOUNT_FILE = BASE_DIR / 'credentials' / 'service_account.json'

# Google Sheets ID (생성 후 설정)
SPREADSHEET_ID = None  # 첫 실행 시 자동 생성

# ============================================================
# Google Sheets API 함수
# ============================================================

def get_credentials():
    """
    Google Sheets API 인증
    """
    try:
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        return credentials
    except Exception as e:
        print(f"❌ 인증 실패: {e}")
        print(f"\n📝 서비스 계정 키 파일이 필요합니다:")
        print(f"   1. Google Cloud Console에서 서비스 계정 생성")
        print(f"   2. JSON 키 다운로드")
        print(f"   3. {SERVICE_ACCOUNT_FILE} 경로에 저장")
        return None


def create_spreadsheet(service, title="SS_음원마스터"):
    """
    새 Google Sheets 생성
    """
    try:
        spreadsheet = {
            'properties': {
                'title': title
            }
        }
        spreadsheet = service.spreadsheets().create(
            body=spreadsheet,
            fields='spreadsheetId,spreadsheetUrl'
        ).execute()
        
        print(f"✅ 스프레드시트 생성 완료!")
        print(f"   ID: {spreadsheet.get('spreadsheetId')}")
        print(f"   URL: {spreadsheet.get('spreadsheetUrl')}")
        
        return spreadsheet.get('spreadsheetId')
    
    except HttpError as error:
        print(f"❌ 스프레드시트 생성 실패: {error}")
        return None


def upload_to_sheets(service, spreadsheet_id, df, sheet_name="SS_음원마스터_최종"):
    """
    DataFrame을 Google Sheets에 업로드
    """
    try:
        # DataFrame의 NaN 값을 빈 문자열로 변환
        df = df.fillna('')
        
        # DataFrame을 리스트로 변환
        values = [df.columns.tolist()] + df.values.tolist()
        
        # 기존 시트 클리어
        service.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1:ZZ"
        ).execute()
        
        # 데이터 업로드
        body = {
            'values': values
        }
        
        result = service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_name}!A1",
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"✅ 데이터 업로드 완료!")
        print(f"   업데이트된 셀: {result.get('updatedCells')}")
        print(f"   업데이트된 행: {result.get('updatedRows')}")
        print(f"   업데이트된 열: {result.get('updatedColumns')}")
        
        return True
    
    except HttpError as error:
        print(f"❌ 데이터 업로드 실패: {error}")
        return False


def format_sheet(service, spreadsheet_id, sheet_id=0):
    """
    시트 포맷팅 (헤더 고정, 색상 등)
    """
    try:
        requests = [
            # 헤더 행 고정
            {
                'updateSheetProperties': {
                    'properties': {
                        'sheetId': sheet_id,
                        'gridProperties': {
                            'frozenRowCount': 1
                        }
                    },
                    'fields': 'gridProperties.frozenRowCount'
                }
            },
            # 헤더 행 배경색 (파란색)
            {
                'repeatCell': {
                    'range': {
                        'sheetId': sheet_id,
                        'startRowIndex': 0,
                        'endRowIndex': 1
                    },
                    'cell': {
                        'userEnteredFormat': {
                            'backgroundColor': {
                                'red': 0.2,
                                'green': 0.4,
                                'blue': 0.8
                            },
                            'textFormat': {
                                'foregroundColor': {
                                    'red': 1.0,
                                    'green': 1.0,
                                    'blue': 1.0
                                },
                                'bold': True
                            }
                        }
                    },
                    'fields': 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            # 자동 열 너비 조정
            {
                'autoResizeDimensions': {
                    'dimensions': {
                        'sheetId': sheet_id,
                        'dimension': 'COLUMNS',
                        'startIndex': 0,
                        'endIndex': 30
                    }
                }
            }
        ]
        
        body = {
            'requests': requests
        }
        
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body=body
        ).execute()
        
        print(f"✅ 시트 포맷팅 완료!")
        
        return True
    
    except HttpError as error:
        print(f"❌ 포맷팅 실패: {error}")
        return False


def download_from_sheets(service, spreadsheet_id, sheet_name="SS_음원마스터_최종"):
    """
    Google Sheets에서 데이터 다운로드 (사용자 레이아웃: 1행 메타데이터, 2행 헤더 대응)
    """
    try:
        # 시트의 모든 데이터 가져오기 (A1부터 시작하여 전체 범위)
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:ZZ"
        ).execute()
        
        values = result.get('values', [])
        
        if len(values) < 2:
            print('  ❌ 시트에 유효한 데이터나 헤더가 없습니다.')
            return None
        
        # 사용자 레이아웃 분석: 1행(B1)은 수집기간, 2행이 실제 데이터 헤더
        # 데이터가 3행부터 시작되므로 values[2:]를 데이터로, values[1]을 헤더로 사용
        headers = values[1]
        data = values[2:] if len(values) > 2 else []
        
        # DataFrame으로 변환
        df = pd.DataFrame(data, columns=headers)
        
        # 'Unnamed' 또는 빈 컬럼명 제거 (데이터 클리닝)
        df = df.loc[:, ~df.columns.str.startswith('Unnamed:')]
        df = df.loc[:, df.columns != '']
        
        print(f"  ✓ 시트 데이터 다운로드 완료 (레이아웃 보정 적용)!")
        print(f"    행: {len(df)}, 열: {len(df.columns)}")
        
        return df
    
    except HttpError as error:
        print(f"  ❌ 데이터 다운로드 실패: {error}")
        return None


def backup_csv(file_path):
    """
    [v12.5] CSV 파일 백업 - 운영 안정화 버전
    - 연도별 archive 구조 (archive/YYYY/)
    - 일 단위 백업 (YYYYMMDD_backup.csv)
    - Atomic Write 적용 (temp write -> replace)
    """
    import shutil
    import os
    from datetime import datetime

    if not file_path.exists():
        return None

    try:
        now = datetime.now()
        year_str = now.strftime('%Y')
        date_str = now.strftime('%Y%m%d')

        # 1. 연도별 하위 폴더 자동 생성 (archive/YYYY/)
        archive_dir = file_path.parent / 'archive' / year_str
        archive_dir.mkdir(parents=True, exist_ok=True)

        # 2. 일 단위 파일명
        backup_filename = f"{date_str}_backup.csv"
        backup_path = archive_dir / backup_filename

        # 3. Atomic Write
        temp_path = backup_path.with_suffix('.tmp')
        shutil.copy2(file_path, temp_path)
        os.replace(temp_path, backup_path)

        print(f"  ✓ 아카이브 백업 완료: {backup_path}")
        return backup_path

    except Exception as e:
        print(f"  ❌ 백업 중 오류 발생: {e}")
        return None


# ============================================================
# 메인 동기화 로직
# ============================================================

def sync_data(mode='push'):
    """
    데이터 동기화 실행
    mode: 'push' (CSV -> Sheets), 'pull' (Sheets -> CSV)
    """
    print("\n" + "="*60)
    print(f"Google Sheets 동기화 시작 (모드: {mode.upper()})")
    print("="*60)
    
    # 1. 인증
    print("\n1️⃣ Google API 인증 중...")
    credentials = get_credentials()
    
    if not credentials:
        print("\n⚠️  서비스 계정 설정이 필요합니다. GOOGLE_SHEETS_가이드.md를 참고하세요.")
        return False
    
    try:
        service = build('sheets', 'v4', credentials=credentials)
        print("  ✓ 인증 성공!")
    except Exception as e:
        print(f"  ❌ 서비스 생성 실패: {e}")
        return False
    
    # 2. 스프레드시트 ID 확인
    print("\n2️⃣ 스프레드시트 정보 확인 중...")
    global SPREADSHEET_ID
    config_file = BASE_DIR / 'google_sheets_config.json'
    
    if config_file.exists():
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
            SPREADSHEET_ID = config.get('spreadsheet_id')
    
    if not SPREADSHEET_ID:
        if mode == 'pull':
            print("  ❌ 기존 스프레드시트 ID가 없습니다. 먼저 --push를 실행하세요.")
            return False
        
        print("  ✓ 새 스프레드시트 생성 중...")
        SPREADSHEET_ID = create_spreadsheet(service)
        if SPREADSHEET_ID:
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump({'spreadsheet_id': SPREADSHEET_ID}, f)
    
    if not SPREADSHEET_ID:
        print("  ❌ 스프레드시트 ID 확인 실패")
        return False
    
    print(f"  ✓ ID: {SPREADSHEET_ID}")
    
    # 3. 데이터 동기화
    if mode == 'push':
        print("\n3️⃣ CSV -> Google Sheets 업로드 중...")
        if not INPUT_CSV.exists():
            print(f"  ❌ CSV 파일이 없습니다: {INPUT_CSV}")
            return False
            
        df = pd.read_csv(INPUT_CSV)
        print(f"  ✓ 로컬 CSV 로드 완료 ({len(df)}행)")
        
        if upload_to_sheets(service, SPREADSHEET_ID, df):
            format_sheet(service, SPREADSHEET_ID)
            print("\n✅ 업로드 완료!")
            print(f"🔗 시트 주소: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit")
            return True
            
    elif mode == 'pull':
        print("\n3️⃣ Google Sheets -> CSV 다운로드 중...")
        df_sheets = download_from_sheets(service, SPREADSHEET_ID)
        
        if df_sheets is not None:
            # 기존 CSV 백업
            backup_csv(OUTPUT_CSV)
            
            # CSV 저장
            df_sheets.to_csv(OUTPUT_CSV, index=False, encoding='utf-8-sig')
            print(f"\n✅ 다운로드 및 CSV 업데이트 완료!")
            print(f"📁 업데이트된 파일: {OUTPUT_CSV}")
            return True
            
    return False


if __name__ == '__main__':
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description='SOUNDSTORM Google Sheets 동기화 도구')
    parser.add_argument('--push', action='store_true', help='로컬 CSV 데이터를 구글 시트로 업로드')
    parser.add_argument('--pull', action='store_true', help='구글 시트의 수정 내용을 로컬 CSV로 가져옴')
    
    args = parser.parse_args()
    
    if args.push:
        sync_data('push')
    elif args.pull:
        sync_data('pull')
    else:
        # 기본값은 가이드 출력
        print("\n💡 사용법:")
        print("   python3 sync_to_google_sheets.py --push  (로컬 -> 시트)")
        print("   python3 sync_to_google_sheets.py --pull  (시트 -> 로컬)")
        
        # 인자 없이 실행 시 push 모드로 실행할지 물어보는 대신 가이드만 출력하거나 기본 동작 수행
        # 사용자의 편의를 위해 만약 인자가 없으면 push를 기본으로 할 수도 있음
        # sync_data('push') 
