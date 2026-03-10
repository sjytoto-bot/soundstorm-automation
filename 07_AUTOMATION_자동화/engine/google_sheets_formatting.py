#!/usr/bin/env python3
"""
📊 SOUNDSTORM Google Sheets 서식 자동 적용 스크립트
주 1회 데이터 업로드 후 실행하여 일관된 서식 유지

사용법:
    python google_sheets_formatting.py

필요 패키지:
    pip install gspread gspread-formatting google-auth
"""

import gspread
from google.oauth2.service_account import Credentials
from gspread_formatting import (
    format_cell_range, set_column_width, set_row_height,
    CellFormat, Color, TextFormat, NumberFormat,
    Borders, Border
)
import os

# ═══════════════════════════════════════════════════════════════
# 설정
# ═══════════════════════════════════════════════════════════════

SPREADSHEET_ID = "1_e7wdFyX_JBZ1qYbL5EZD_W_Ja6zG8eGo3sP2eDLujA"
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), "credentials/service_account.json")

# 색상 코드 (RGB 0-1 범위)
def hex_to_rgb(hex_color):
    """HEX 색상을 RGB (0-1) 범위로 변환"""
    hex_color = hex_color.lstrip('#')
    return {
        'red': int(hex_color[0:2], 16) / 255,
        'green': int(hex_color[2:4], 16) / 255,
        'blue': int(hex_color[4:6], 16) / 255,
    }

# 색상 정의
COLORS = {
    "master_header": hex_to_rgb("#194C19"),      # 진한 녹색
    "analysis_title": hex_to_rgb("#1F4E78"),     # 네이비 블루
    "table_header": hex_to_rgb("#4472C4"),       # 밝은 파란색
    "kpi_value": hex_to_rgb("#0070C0"),          # 액센트 블루
    "growth_positive": hex_to_rgb("#70AD47"),    # 녹색
    "growth_negative": hex_to_rgb("#C00000"),    # 빨강
    "white": hex_to_rgb("#FFFFFF"),
    "light_blue_bg": hex_to_rgb("#D6E9F8"),      # 연한 파란 배경
}

# 시트 이름
SHEETS = {
    "master": "SS_음원마스터_최종",
    "overall": "(종합) 전체기간 분석",
    "recent_30": "(종합) 최근30일 분석",
    "trend": "트렌드분석&인사이트",
}

# ═══════════════════════════════════════════════════════════════
# 서식 적용 함수
# ═══════════════════════════════════════════════════════════════

def apply_master_sheet_format(worksheet):
    """마스터 시트 서식 적용"""
    print(f"  📋 '{worksheet.title}' 서식 적용 중...")
    
    # 헤더 행 (1행) - 진한 녹색 배경, 흰색 글씨
    header_format = CellFormat(
        backgroundColor=Color(**COLORS["master_header"]),
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["white"]),
            fontSize=11
        ),
        horizontalAlignment='CENTER',
        verticalAlignment='MIDDLE',
    )
    format_cell_range(worksheet, 'A1:N1', header_format)
    
    # 데이터 영역 숫자 포맷
    number_format = CellFormat(
        numberFormat=NumberFormat(type='NUMBER', pattern='#,##0')
    )
    format_cell_range(worksheet, 'E2:N500', number_format)
    
    # 행 높이 설정
    set_row_height(worksheet, '1', 30)
    
    print(f"  ✅ '{worksheet.title}' 서식 완료")


def apply_analysis_sheet_format(worksheet):
    """분석 시트 서식 적용 (전체기간/최근30일)"""
    print(f"  📊 '{worksheet.title}' 서식 적용 중...")
    
    # 섹션 타이틀 스타일 (네이비 블루)
    title_format = CellFormat(
        backgroundColor=Color(**COLORS["analysis_title"]),
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["white"]),
            fontSize=14
        ),
        horizontalAlignment='LEFT',
        verticalAlignment='MIDDLE',
    )
    
    # 테이블 헤더 스타일 (밝은 파란색)
    table_header_format = CellFormat(
        backgroundColor=Color(**COLORS["table_header"]),
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["white"]),
            fontSize=10
        ),
        horizontalAlignment='CENTER',
        verticalAlignment='MIDDLE',
    )
    
    # KPI 값 스타일
    kpi_value_format = CellFormat(
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["kpi_value"]),
            fontSize=18
        ),
        horizontalAlignment='CENTER',
    )
    
    # 숫자 포맷 (천단위 쉼표)
    number_format = CellFormat(
        numberFormat=NumberFormat(type='NUMBER', pattern='#,##0'),
        horizontalAlignment='RIGHT'
    )
    
    # 퍼센트 포맷
    percent_format = CellFormat(
        numberFormat=NumberFormat(type='NUMBER', pattern='0.0"%"'),
        horizontalAlignment='RIGHT'
    )
    
    try:
        # KPI 박스 영역 (B6:I8)
        format_cell_range(worksheet, 'B7', kpi_value_format)
        format_cell_range(worksheet, 'D7', kpi_value_format)
        format_cell_range(worksheet, 'F7', kpi_value_format)
        format_cell_range(worksheet, 'H7', kpi_value_format)
        
        # 섹션 타이틀들
        for row in [10, 24, 38]:  # 인구통계, 검색어, 관련동영상 섹션
            format_cell_range(worksheet, f'B{row}:D{row}', title_format)
            format_cell_range(worksheet, f'F{row}:H{row}', title_format)
        
        # 테이블 헤더들
        for row in [11, 25, 39]:
            format_cell_range(worksheet, f'B{row}:D{row}', table_header_format)
            format_cell_range(worksheet, f'F{row}:H{row}', table_header_format)
        
        # 인구통계 데이터 (숫자)
        format_cell_range(worksheet, 'D12:D22', percent_format)
        
        # 국가 데이터
        format_cell_range(worksheet, 'G12:G22', number_format)
        format_cell_range(worksheet, 'H12:H22', percent_format)
        
        # 검색어 데이터
        format_cell_range(worksheet, 'C26:C36', number_format)
        format_cell_range(worksheet, 'D26:D36', percent_format)
        
        # 기기별 데이터
        format_cell_range(worksheet, 'G26:G30', number_format)
        format_cell_range(worksheet, 'H26:H30', percent_format)
        
        # 관련 동영상 데이터
        format_cell_range(worksheet, 'C40:C50', number_format)
        
        # 외부 유입 데이터
        format_cell_range(worksheet, 'G40:G60', number_format)
        
    except Exception as e:
        print(f"  ⚠️ 일부 셀 범위 서식 적용 실패: {e}")
    
    print(f"  ✅ '{worksheet.title}' 서식 완료")


def apply_trend_sheet_format(worksheet):
    """트렌드 분석 시트 서식 적용"""
    print(f"  📈 '{worksheet.title}' 서식 적용 중...")
    
    # 성장률 양수 스타일 (녹색)
    positive_format = CellFormat(
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["growth_positive"])
        )
    )
    
    # 성장률 음수 스타일 (빨강)
    negative_format = CellFormat(
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["growth_negative"])
        )
    )
    
    # 테이블 헤더
    header_format = CellFormat(
        backgroundColor=Color(**COLORS["table_header"]),
        textFormat=TextFormat(
            bold=True,
            foregroundColor=Color(**COLORS["white"]),
            fontSize=10
        ),
        horizontalAlignment='CENTER',
    )
    
    try:
        # 헤더 행
        format_cell_range(worksheet, 'B3:E3', header_format)
        
        # 성장률 열 (E열) - 조건부 서식은 수동 적용 필요
        # 여기서는 기본 숫자 포맷만
        format_cell_range(worksheet, 'E4:E10', CellFormat(
            numberFormat=NumberFormat(type='NUMBER', pattern='+0.0%;-0.0%'),
            horizontalAlignment='RIGHT'
        ))
        
    except Exception as e:
        print(f"  ⚠️ 일부 서식 적용 실패: {e}")
    
    print(f"  ✅ '{worksheet.title}' 서식 완료")


# ═══════════════════════════════════════════════════════════════
# 메인 실행
# ═══════════════════════════════════════════════════════════════

def apply_all_formatting(spreadsheet_id=None, credentials_path=None):
    """모든 시트에 서식 적용"""
    
    spreadsheet_id = spreadsheet_id or SPREADSHEET_ID
    credentials_path = credentials_path or CREDENTIALS_PATH
    
    print("=" * 60)
    print("📊 SOUNDSTORM Google Sheets 서식 적용 시작")
    print("=" * 60)
    
    # 인증
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    try:
        creds = Credentials.from_service_account_file(credentials_path, scopes=scopes)
        gc = gspread.authorize(creds)
        spreadsheet = gc.open_by_key(spreadsheet_id)
        print(f"✅ 스프레드시트 연결 성공: {spreadsheet.title}")
    except Exception as e:
        print(f"❌ 연결 실패: {e}")
        return False
    
    # 각 시트별 서식 적용
    for sheet_key, sheet_name in SHEETS.items():
        try:
            worksheet = spreadsheet.worksheet(sheet_name)
            
            if sheet_key == "master":
                apply_master_sheet_format(worksheet)
            elif sheet_key in ["overall", "recent_30"]:
                apply_analysis_sheet_format(worksheet)
            elif sheet_key == "trend":
                apply_trend_sheet_format(worksheet)
                
        except gspread.WorksheetNotFound:
            print(f"  ⚠️ 시트 '{sheet_name}' 찾을 수 없음 - 건너뜀")
        except Exception as e:
            print(f"  ❌ '{sheet_name}' 서식 적용 실패: {e}")
    
    print("=" * 60)
    print("✅ 모든 서식 적용 완료!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    apply_all_formatting()
