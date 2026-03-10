import subprocess
import sys

# Apps Script CLI (clasp)를 이용해 로그를 가져올 수 있다면 그 방식을 쓰거나,
# Python에서 직접 gspread 워크시트에 로그성 메시지를 기록하도록 코드를 심어 로그를 가져오는 방식 등 선택 필요.
# 하지만 현재 가장 빠른건 clasp 명령어 또는 간단한 테스트 데이터 전송 후 수작업 확인입니다.
# 사용자가 직접 Apps Script 에디터에서 실행(▶)하고 로그를 확인하는 편이 확실하므로
# 우리는 api_data_shuttler.py를 한 번 실행해 데이터만 전송해 놓겠습니다.

print(">>> [테스트 1단계] Python 수집기 (api_data_shuttler) 가동")
subprocess.run([sys.executable, "scripts_스크립트/api_data_shuttler.py"])

print("==========================================================================")
print("✅ Python 전송 완료. 이제 구글 시트에서 [🎵 SOUNDSTORM] -> [전체 지표 재계산]을 실행하세요.")
print("==========================================================================")
