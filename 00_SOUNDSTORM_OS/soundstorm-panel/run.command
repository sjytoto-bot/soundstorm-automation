#!/bin/bash
# Finder 더블클릭 시 .zshrc 미로드 → Homebrew PATH 명시
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")"

# 이미 실행 중인지 확인
if lsof -i:5173 > /dev/null 2>&1; then
  echo "[SOUNDSTORM] 이미 실행 중 — 재시작합니다."
fi

# 포트 기반 정리 (5173~5179 범위 — Vite fallback 포트 포함)
lsof -ti:5173,5174,5175,5176,5177,5178,5179 2>/dev/null | xargs kill -9 2>/dev/null || true
# Electron 프로세스 별도 정리 (포트 미사용)
pkill -f 'soundstorm-panel.*Electron.app' 2>/dev/null || true
sleep 1

npm run electron:dev
