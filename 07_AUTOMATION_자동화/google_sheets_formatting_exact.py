"""
SOUNDSTORM Google Sheets 서식 적용 코드 (정확한 Excel 포맷 기준)
Antigravity 스크립트에 추가하거나 단독 실행
"""

import gspread
from gspread_formatting import *
from google.oauth2.service_account import Credentials

# ========================================
# 색상 정의 (Excel에서 추출한 정확한 값)
# ========================================
DARK_GREEN = Color(0.10, 0.30, 0.10)  # #194C19 - 마스터 시트 헤더
BRAND_BLUE = Color(0.12, 0.31, 0.47)  # #1F4E78 - 메인 타이틀
BRAND_LIGHT_BLUE = Color(0.27, 0.45, 0.77)  # #4472C4 - 테이블 헤더
ACCENT_BLUE = Color(0, 0.44, 0.75)  # #0070C0 - KPI 값, 액션
LIGHT_GRAY = Color(0.95, 0.95, 0.95)  # #F2F2F2 - KPI 박스
GRAY_TEXT = Color(0.40, 0.40, 0.40)  # #666666 - 서브텍스트
GREEN = Color(0.44, 0.68, 0.28)  # #70AD47 - 긍정 성장률
RED = Color(0.75, 0, 0)  # #C00000 - 부정 성장률
WHITE = Color(1, 1, 1)
BLACK = Color(0, 0, 0)

# ========================================
# 서식 스타일 정의
# ========================================

# 마스터 시트 헤더 (진한 녹색)
master_header_format = CellFormat(
    backgroundColor=DARK_GREEN,
    textFormat=TextFormat(bold=True, foregroundColor=WHITE, fontSize=10, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# 분석 시트 타이틀
title_format = CellFormat(
    textFormat=TextFormat(bold=True, fontSize=16, foregroundColor=BRAND_BLUE, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 서브타이틀
subtitle_format = CellFormat(
    textFormat=TextFormat(fontSize=10, foregroundColor=GRAY_TEXT, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 섹션 타이틀
section_format = CellFormat(
    textFormat=TextFormat(bold=True, fontSize=11, foregroundColor=BRAND_BLUE, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 테이블 헤더 (파란색)
table_header_format = CellFormat(
    backgroundColor=BRAND_LIGHT_BLUE,
    textFormat=TextFormat(bold=True, foregroundColor=WHITE, fontSize=10, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# KPI 레이블
kpi_label_format = CellFormat(
    backgroundColor=LIGHT_GRAY,
    textFormat=TextFormat(bold=True, fontSize=10, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# KPI 값
kpi_value_format = CellFormat(
    backgroundColor=LIGHT_GRAY,
    textFormat=TextFormat(bold=True, fontSize=14, foregroundColor=ACCENT_BLUE, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# KPI 서브텍스트
kpi_sub_format = CellFormat(
    backgroundColor=LIGHT_GRAY,
    textFormat=TextFormat(fontSize=8, foregroundColor=GRAY_TEXT, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# 일반 데이터 (중앙 정렬)
data_center_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='CENTER',
    verticalAlignment='MIDDLE'
)

# 일반 데이터 (왼쪽 정렬)
data_left_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='LEFT',
    verticalAlignment='MIDDLE'
)

# 숫자 데이터 (오른쪽 정렬, 천단위 쉼표)
number_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='RIGHT',
    verticalAlignment='MIDDLE',
    numberFormat=NumberFormat(type='NUMBER', pattern='#,##0')
)

# 소수점 1자리
decimal_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='RIGHT',
    verticalAlignment='MIDDLE',
    numberFormat=NumberFormat(type='NUMBER', pattern='0.0')
)

# 퍼센트 소수점 1자리
percent_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='RIGHT',
    verticalAlignment='MIDDLE',
    numberFormat=NumberFormat(type='NUMBER', pattern='0.0"%"')
)

# 액션 플랜 텍스트
action_format = CellFormat(
    textFormat=TextFormat(fontSize=9, foregroundColor=ACCENT_BLUE, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 인사이트 텍스트
insight_format = CellFormat(
    textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 인사이트 섹션 타이틀
insight_section_format = CellFormat(
    textFormat=TextFormat(bold=True, fontSize=10, foregroundColor=BRAND_BLUE, fontFamily='Arial'),
    horizontalAlignment='LEFT'
)

# 긍정 성장률 (녹색)
positive_growth_format = CellFormat(
    textFormat=TextFormat(bold=True, fontSize=9, foregroundColor=GREEN, fontFamily='Arial'),
    horizontalAlignment='RIGHT',
    verticalAlignment='MIDDLE'
)

# 부정 성장률 (빨강)
negative_growth_format = CellFormat(
    textFormat=TextFormat(bold=True, fontSize=9, foregroundColor=RED, fontFamily='Arial'),
    horizontalAlignment='RIGHT',
    verticalAlignment='MIDDLE'
)


# ========================================
# 서식 적용 함수
# ========================================

def format_master_sheet(worksheet):
    """SS_음원마스터_최종 시트 서식 적용"""
    
    print("   🎵 음원 마스터 서식 적용 중...")
    
    # 데이터 수집 기간 (B1)
    format_cell_range(worksheet, 'B1', subtitle_format)
    
    # 헤더 행 (A2:I2) - 진한 녹색
    format_cell_range(worksheet, 'A2:I2', master_header_format)
    
    # 데이터 영역
    last_row = len(worksheet.col_values(1))  # A열 기준
    if last_row > 2:
        # 텍스트 컬럼 (A, B, C) - 중앙 정렬
        format_cell_range(worksheet, f'A3:C{last_row}', data_center_format)
        
        # 숫자 컬럼 (D, E, F, H, I) - 오른쪽 정렬, 숫자 포맷
        for col in ['D', 'E', 'F', 'H', 'I']:
            format_cell_range(worksheet, f'{col}3:{col}{last_row}', number_format)
        
        # 좋아요율 (G) - 소수점 4자리
        format_cell_range(worksheet, f'G3:G{last_row}', CellFormat(
            textFormat=TextFormat(fontSize=9, fontFamily='Arial'),
            horizontalAlignment='RIGHT',
            verticalAlignment='MIDDLE',
            numberFormat=NumberFormat(type='NUMBER', pattern='0.0000')
        ))
    
    # 컬럼 너비
    set_column_width(worksheet, 'A', 100)  # 상품ID
    set_column_width(worksheet, 'B', 250)  # 곡명
    set_column_width(worksheet, 'C', 200)  # 앨범명
    set_column_width(worksheet, 'D', 100)  # 조회수
    set_column_width(worksheet, 'E', 100)  # 좋아요
    set_column_width(worksheet, 'F', 100)  # 댓글
    set_column_width(worksheet, 'G', 100)  # 좋아요율
    set_column_width(worksheet, 'H', 120)  # 총시청시간
    set_column_width(worksheet, 'I', 120)  # 평균시청시간
    
    print("   ✅ 음원 마스터 완료")


def format_analysis_sheet(worksheet, sheet_name="전체기간"):
    """분석 시트 서식 적용 (전체기간/최근30일 공통)"""
    
    print(f"   📈 {sheet_name} 분석 서식 적용 중...")
    
    # 타이틀 (B2)
    format_cell_range(worksheet, 'B2:H2', title_format)
    
    # 서브타이틀 (B3)
    format_cell_range(worksheet, 'B3:H3', subtitle_format)
    
    # KPI 섹션 타이틀 (B5)
    format_cell_range(worksheet, 'B5:H5', section_format)
    
    # KPI 박스들
    kpi_positions = [
        ('B6', 'C6'),  # 조회수 레이블
        ('B7', 'C7'),  # 조회수 값
        ('B8', 'C8'),  # 조회수 서브
        ('D6', 'E6'),  # 좋아요 레이블
        ('D7', 'E7'),  # 좋아요 값
        ('D8', 'E8'),  # 좋아요 서브
        ('F6', 'G6'),  # 시청시간 레이블
        ('F7', 'G7'),  # 시청시간 값
        ('F8', 'G8'),  # 시청시간 서브
        ('H6', 'H6'),  # 평균시청 레이블
        ('H7', 'H7'),  # 평균시청 값
        ('H8', 'H8'),  # 평균시청 서브
    ]
    
    for idx, (start, end) in enumerate(kpi_positions):
        row_num = int(start[1:])
        if row_num == 6:
            format_cell_range(worksheet, f'{start}:{end}', kpi_label_format)
        elif row_num == 7:
            format_cell_range(worksheet, f'{start}:{end}', kpi_value_format)
        elif row_num == 8:
            format_cell_range(worksheet, f'{start}:{end}', kpi_sub_format)
    
    # 인구통계 섹션 (B11)
    format_cell_range(worksheet, 'B11:E11', section_format)
    format_cell_range(worksheet, 'B12:D12', table_header_format)
    
    # 인구통계 데이터 (B13:D22)
    format_cell_range(worksheet, 'B13:C22', data_center_format)
    format_cell_range(worksheet, 'D13:D22', decimal_format)
    
    # 국가 섹션 (F11)
    format_cell_range(worksheet, 'F11:H11', section_format)
    format_cell_range(worksheet, 'F12:H12', table_header_format)
    
    # 국가 데이터 (F13:H22)
    format_cell_range(worksheet, 'F13:F22', data_left_format)
    format_cell_range(worksheet, 'G13:G22', number_format)
    format_cell_range(worksheet, 'H13:H22', data_left_format)  # 이미 % 포함된 텍스트
    
    # 검색어 섹션 (B25)
    format_cell_range(worksheet, 'B25:D25', section_format)
    format_cell_range(worksheet, 'B26:D26', table_header_format)
    
    # 검색어 데이터 (B27:D36)
    format_cell_range(worksheet, 'B27:B36', data_left_format)
    format_cell_range(worksheet, 'C27:C36', number_format)
    format_cell_range(worksheet, 'D27:D36', decimal_format)
    
    # 기기 섹션 (F25)
    format_cell_range(worksheet, 'F25:H25', section_format)
    format_cell_range(worksheet, 'F26:H26', table_header_format)
    
    # 기기 데이터 (F27:H30)
    format_cell_range(worksheet, 'F27:F30', data_left_format)
    format_cell_range(worksheet, 'G27:G30', number_format)
    format_cell_range(worksheet, 'H27:H30', data_left_format)
    
    # 관련 동영상 섹션 (B39)
    format_cell_range(worksheet, 'B39:D39', section_format)
    format_cell_range(worksheet, 'B40:D40', table_header_format)
    
    # 관련 동영상 데이터 (B41:D50)
    format_cell_range(worksheet, 'B41:B50', data_left_format)
    format_cell_range(worksheet, 'C41:C50', number_format)
    format_cell_range(worksheet, 'D41:D50', data_left_format)
    
    # 외부 유입 섹션 (F39)
    format_cell_range(worksheet, 'F39:G39', section_format)
    format_cell_range(worksheet, 'F40:G40', table_header_format)
    
    # 외부 유입 데이터 (F41:G60) - 전체
    format_cell_range(worksheet, 'F41:F60', data_left_format)
    format_cell_range(worksheet, 'G41:G60', number_format)
    
    # 컬럼 너비
    for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H']:
        set_column_width(worksheet, col, 200)
    
    print(f"   ✅ {sheet_name} 분석 완료")


def format_trend_sheet(worksheet):
    """트렌드&인사이트 시트 서식 적용"""
    
    print("   🔍 트렌드&패턴 서식 적용 중...")
    
    # 타이틀 (B2)
    format_cell_range(worksheet, 'B2:H2', title_format)
    
    # 서브타이틀 (B3)
    format_cell_range(worksheet, 'B3:H3', subtitle_format)
    
    # 성장률 섹션 타이틀 (B5)
    format_cell_range(worksheet, 'B5:H5', section_format)
    
    # 성장률 헤더 (B6:E6)
    format_cell_range(worksheet, 'B6:E6', table_header_format)
    
    # 성장률 데이터 (B7:E10)
    format_cell_range(worksheet, 'B7:B10', data_left_format)
    format_cell_range(worksheet, 'C7:D10', data_left_format)
    
    # 성장률 값 - 조건부 서식 (E7:E10)
    # 긍정: E9 (+13.7%)
    format_cell_range(worksheet, 'E9', positive_growth_format)
    # 부정: E7, E8, E10
    format_cell_range(worksheet, 'E7', negative_growth_format)
    format_cell_range(worksheet, 'E8', negative_growth_format)
    format_cell_range(worksheet, 'E10', negative_growth_format)
    
    # 핵심 인사이트 타이틀 (B13)
    format_cell_range(worksheet, 'B13:H13', section_format)
    
    # 인사이트 항목 (B14:B17)
    format_cell_range(worksheet, 'B14:H14', insight_format)
    format_cell_range(worksheet, 'B15:H15', insight_format)
    format_cell_range(worksheet, 'B16:H16', insight_format)
    format_cell_range(worksheet, 'B17:H17', insight_format)
    
    # 추천 액션 타이틀 (B19)
    format_cell_range(worksheet, 'B19:H19', section_format)
    
    # 액션 항목 (B20:B23)
    format_cell_range(worksheet, 'B20:H20', action_format)
    format_cell_range(worksheet, 'B21:H21', action_format)
    format_cell_range(worksheet, 'B22:H22', action_format)
    format_cell_range(worksheet, 'B23:H23', action_format)
    
    # 확장 인사이트 타이틀 (B25)
    format_cell_range(worksheet, 'B25:H25', section_format)
    
    # 인사이트 섹션들 (B27부터)
    # 📊 시청자 타겟팅
    format_cell_range(worksheet, 'B27:H27', insight_section_format)
    format_cell_range(worksheet, 'B28:H30', insight_format)
    
    # 컬럼 너비
    for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H']:
        set_column_width(worksheet, col, 200)
    
    print("   ✅ 트렌드&패턴 완료")


# ========================================
# 메인 실행 함수
# ========================================

def apply_all_formatting(spreadsheet_id, credentials_path='credentials.json'):
    """
    모든 시트에 서식 적용
    
    Args:
        spreadsheet_id: Google Sheets ID
        credentials_path: OAuth credentials 파일 경로
    """
    
    print("🎨 Google Sheets 서식 적용 시작...\n")
    
    # Google Sheets 인증
    scope = [
        'https://spreadsheets.google.com/feeds',
        'https://www.googleapis.com/auth/drive'
    ]
    
    creds = Credentials.from_service_account_file(credentials_path, scopes=scope)
    client = gspread.authorize(creds)
    
    # 스프레드시트 열기
    spreadsheet = client.open_by_key(spreadsheet_id)
    
    # 각 시트 서식 적용
    try:
        master_sheet = spreadsheet.worksheet('SS_음원마스터_최종')
        format_master_sheet(master_sheet)
    except Exception as e:
        print(f"   ⚠️  음원 마스터 서식 실패: {e}")
    
    try:
        full_sheet = spreadsheet.worksheet('(종합) 전체기간 분석')
        format_analysis_sheet(full_sheet, "전체기간")
    except Exception as e:
        print(f"   ⚠️ 전체기간 분석 서식 실패: {e}")
    
    try:
        recent_sheet = spreadsheet.worksheet('최근 30일 분석')
        format_analysis_sheet(recent_sheet, "최근30일")
    except Exception as e:
        print(f"   ⚠️ 최근30일 분석 서식 실패: {e}")
    
    try:
        trend_sheet = spreadsheet.worksheet('트랜드분석&인사이트')
        format_trend_sheet(trend_sheet)
    except Exception as e:
        print(f"   ⚠️ 트렌드&패턴 서식 실패: {e}")
    
    print("\n✅ 모든 시트 서식 적용 완료!")


# ========================================
# 사용 예시
# ========================================

if __name__ == "__main__":
    # Google Sheets ID
    SPREADSHEET_ID = "14tMYUoCFovag-DKRXEkpSI458tYfWmMmr4iR3MF9YEM"
    
    # 실행
    apply_all_formatting(SPREADSHEET_ID)
