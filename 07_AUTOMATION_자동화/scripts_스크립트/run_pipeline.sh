#!/bin/bash
# run_pipeline.sh
# SOUNDSTORM 자동화 파이프라인 런너
#
# LaunchAgent(com.soundstorm.studio-sync)에서 이 스크립트를 실행
# PATH를 명시적으로 설정해 launchd 환경 문제 완전 차단
# 나중에 파이프라인 추가 시 이 파일에만 append하면 됨
#
# 수동 실행:
#   bash run_pipeline.sh

export PATH=/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin:/usr/bin:/bin:/usr/sbin:/sbin

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[run_pipeline] $(date '+%Y-%m-%d %H:%M:%S') 파이프라인 시작"

# ── 1. Studio CSV 동기화 (→ git push → GitHub Actions → Sheets 업데이트) ──
bash "$SCRIPT_DIR/sync_studio_csv.sh"

echo "[run_pipeline] $(date '+%Y-%m-%d %H:%M:%S') 파이프라인 완료"
