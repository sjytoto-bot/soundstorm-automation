#!/usr/bin/env python3
"""
🔄 SOUNDSTORM 주간 데이터 동기화 + 서식 적용 통합 스크립트
주 1회 실행하여 YouTube Analytics 데이터를 Google Sheets에 업로드하고 서식 적용

사용법:
    python weekly_sync.py

crontab 설정 (매주 월요일 오전 9시):
    0 9 * * 1 cd /path/to/SOUNDSTORM/04_STORE_스토어 && python weekly_sync.py >> logs/weekly_sync.log 2>&1
"""

import os
import sys
from datetime import datetime

# 현재 디렉토리를 경로에 추가
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

# ═══════════════════════════════════════════════════════════════
# 설정
# ═══════════════════════════════════════════════════════════════

SPREADSHEET_ID = "1_e7wdFyX_JBZ1qYbL5EZD_W_Ja6zG8eGo3sP2eDLujA"
CREDENTIALS_PATH = os.path.join(SCRIPT_DIR, "credentials/service_account.json")

# 로그 디렉토리 생성
LOG_DIR = os.path.join(SCRIPT_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)


def log(message):
    """타임스탬프와 함께 로그 출력"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def step_0_snapshot_drafts():
    """Step 0: 모든 팀 가이드 문서의 Snapshot Draft 생성"""
    log("📸 Step 0: Snapshot Draft 생성 시작...")
    
    try:
        from snapshot_engine import run_draft, VAULT_DIR
        
        if not VAULT_DIR.exists():
            log(f"⚠️ Vault 디렉토리를 찾을 수 없음: {VAULT_DIR}")
            return True
            
        # 모든 마크다운 파일 탐색 (vX.X 패턴 포함)
        guide_files = list(VAULT_DIR.glob("*.md"))
        log(f"🔍 {len(guide_files)}개의 가이드 문서 발견")
        
        for file in guide_files:
            # 팀명 추출 (예: 운영팀_개발_v2.10.md -> 운영팀_개발)
            # '_v' 이전의 문자열을 팀명으로 간주
            team_name = file.stem.split('_v')[0]
            try:
                run_draft(team_name)
            except Exception as e:
                log(f"  ❌ {team_name} Draft 생성 실패: {e}")
        
        log("✅ Step 0 완료: Snapshot Draft 생성 프로세스 종료")
        return True
    except ImportError:
        log("⚠️ snapshot_engine.py 모듈 없음 - 건너뜀")
        return True
    except Exception as e:
        log(f"❌ Step 0 실패: {e}")
        return False


def step_1_update_data():
    """Step 1: Excel 데이터를 Google Sheets에 업로드"""
    log("📥 Step 1: 데이터 업로드 시작...")
    
    try:
        from update_single_sheet import main as update_sheets
        update_sheets()
        log("✅ Step 1 완료: 데이터 업로드 성공")
        return True
    except ImportError:
        log("⚠️ update_single_sheet.py 모듈 없음 - 건너뜀")
        return True
    except Exception as e:
        log(f"❌ Step 1 실패: {e}")
        return False


def step_2_apply_formatting():
    """Step 2: Google Sheets 서식 적용"""
    log("🎨 Step 2: 서식 적용 시작...")
    
    try:
        from google_sheets_formatting import apply_all_formatting
        result = apply_all_formatting(SPREADSHEET_ID, CREDENTIALS_PATH)
        if result:
            log("✅ Step 2 완료: 서식 적용 성공")
        return result
    except ImportError as e:
        log(f"⚠️ 필요 패키지 미설치: {e}")
        log("   pip install gspread gspread-formatting google-auth 실행 필요")
        return False
    except Exception as e:
        log(f"❌ Step 2 실패: {e}")
        return False


def step_3_generate_html_dashboard():
    """Step 3: HTML 대시보드 업데이트 (선택사항)"""
    log("📊 Step 3: HTML 대시보드 생성 (선택사항)...")
    
    # 이 단계는 수동으로 실행하거나 별도 스크립트로 분리
    log("ℹ️ HTML 대시보드는 youtube_full_dashboard.html에서 확인")
    return True


def main():
    """주간 동기화 메인 실행"""
    log("=" * 60)
    log("🚀 SOUNDSTORM 주간 데이터 동기화 시작")
    log("=" * 60)
    
    start_time = datetime.now()
    
    # Step 0: Snapshot Draft
    if not step_0_snapshot_drafts():
        log("⚠️ Snapshot Draft 생성 중 오류 발생 (계속 진행)")
    
    # Step 1: 데이터 업로드
    if not step_1_update_data():
        log("❌ 데이터 업로드 실패 - 중단")
        return False
    
    # Step 2: 서식 적용
    if not step_2_apply_formatting():
        log("⚠️ 서식 적용 실패 - 계속 진행")
    
    # Step 3: HTML 대시보드
    step_3_generate_html_dashboard()
    
    # 완료
    elapsed = datetime.now() - start_time
    log("=" * 60)
    log(f"✅ 주간 동기화 완료! (소요 시간: {elapsed})")
    log("=" * 60)
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
