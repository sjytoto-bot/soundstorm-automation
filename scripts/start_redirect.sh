#!/bin/bash
# SOUNDSTORM Redirect Tracker — 서버 시작 스크립트
# 실행: bash scripts/start_redirect.sh [port]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TRACKER_DIR="$PROJECT_ROOT/07_AUTOMATION_자동화/redirect_tracker"
PANEL_CONFIG_DIR="$PROJECT_ROOT/00_SOUNDSTORM_OS/soundstorm-panel/config"
PORT="${1:-8080}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SOUNDSTORM Redirect Tracker"
echo "  Port: $PORT"
echo "  Log : $PANEL_CONFIG_DIR/redirect_logs.csv"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# soundstorm-panel config 디렉토리가 없으면 생성
mkdir -p "$PANEL_CONFIG_DIR"

# Flask 서버 실행 (로그 파일 경로를 soundstorm-panel config 폴더로 지정)
cd "$TRACKER_DIR"
REDIRECT_LOG_PATH="$PANEL_CONFIG_DIR/redirect_logs.csv" \
REDIRECT_PORT="$PORT" \
python3 redirect_server.py --port "$PORT"
