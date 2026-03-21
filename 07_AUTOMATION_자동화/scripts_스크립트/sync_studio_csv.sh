#!/bin/bash
# sync_studio_csv.sh
# Studio CSV 다운로드 → git 커밋 → 푸시 → GitHub Actions 인제스트 트리거
#
# 동작 방식:
#   - CDP 전용 Chrome을 별도 프로필로 실행 (일반 Chrome과 충돌 없음)
#   - 다운로드 완료 후 CDP Chrome 자동 종료
#   - 프로필 경로: ~/.soundstorm_chrome_cdp (영구, 재부팅 후에도 로그인 유지)
#
# 수동 실행:
#   bash sync_studio_csv.sh
#
# 자동 실행:
#   cron: 0 17 * * * (매일 02:00 KST = 17:00 UTC)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CSV_PATH="$SCRIPT_DIR/../youtube_exports/studio_reach_report.csv"
CSV_REL="07_AUTOMATION_자동화/youtube_exports/studio_reach_report.csv"
TIMESTAMP_FILE="$SCRIPT_DIR/../youtube_exports/last_csv_download.txt"
TIMESTAMP_REL="07_AUTOMATION_자동화/youtube_exports/last_csv_download.txt"
LOG_FILE="/tmp/soundstorm_sync.log"
RUN_AT="$(date '+%Y-%m-%d %H:%M:%S')"
CDP_PROFILE="$HOME/.soundstorm_chrome_cdp"
CDP_CHROME_PID=""

# ── 모드 파싱 ─────────────────────────────────────────────────────────────────
# --mode=recent: 7일 단축 CSV 다운로드만 수행 (commit/push 없음)
MODE="default"
for arg in "$@"; do
  case "$arg" in
    --mode=recent) MODE="recent" ;;
  esac
done

# ── 실패 핸들러 ──────────────────────────────────────────────────────────────
on_error() {
  local step="$1"
  local msg="[SOUNDSTORM] Studio CSV 동기화 실패 — 단계: $step ($RUN_AT)"
  echo "" | tee -a "$LOG_FILE"
  echo "❌ $msg" | tee -a "$LOG_FILE"
  _stop_cdp_chrome

  # Slack Webhook (설정된 경우)
  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      --data "{\"text\":\"$msg\"}" > /dev/null 2>&1
  fi

  exit 1
}

# ── CDP Chrome 시작 ───────────────────────────────────────────────────────────
_start_cdp_chrome() {
  # 이미 9222 포트가 열려있으면 스킵
  if lsof -ti tcp:9222 > /dev/null 2>&1; then
    echo "  ℹ️  CDP 포트 9222 이미 열려있음 — 기존 인스턴스 사용" | tee -a "$LOG_FILE"
    return 0
  fi

  echo "  Chrome CDP 시작 (프로필: $CDP_PROFILE)..." | tee -a "$LOG_FILE"
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$CDP_PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-mode \
    > /tmp/soundstorm_chrome.log 2>&1 &
  CDP_CHROME_PID=$!

  # 포트 열릴 때까지 대기 (최대 15초)
  for i in $(seq 1 15); do
    sleep 1
    if lsof -ti tcp:9222 > /dev/null 2>&1; then
      echo "  ✅ CDP Chrome 실행 완료 (PID: $CDP_CHROME_PID)" | tee -a "$LOG_FILE"
      return 0
    fi
  done

  echo "  ❌ CDP Chrome 실행 실패" | tee -a "$LOG_FILE"
  return 1
}

# ── CDP Chrome 종료 ───────────────────────────────────────────────────────────
_stop_cdp_chrome() {
  if [ -n "$CDP_CHROME_PID" ] && kill -0 "$CDP_CHROME_PID" 2>/dev/null; then
    kill "$CDP_CHROME_PID" 2>/dev/null
    echo "  ✅ CDP Chrome 종료 (PID: $CDP_CHROME_PID)" | tee -a "$LOG_FILE"
    CDP_CHROME_PID=""
  fi
}

echo "==============================" | tee -a "$LOG_FILE"
echo "SOUNDSTORM Studio CSV 동기화 [$RUN_AT] [mode=$MODE]" | tee -a "$LOG_FILE"
echo "==============================" | tee -a "$LOG_FILE"

# ── CDP Chrome 시작 ───────────────────────────────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "[0/3] CDP Chrome 시작 중..." | tee -a "$LOG_FILE"
_start_cdp_chrome || on_error "Chrome 실행"

# ── recent 모드: CSV만 다운로드 후 종료 (commit/push 없음) ────────────────────
if [ "$MODE" = "recent" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "[recent] 7일 단축 CSV 다운로드 중..." | tee -a "$LOG_FILE"
  RECENT_CSV="$SCRIPT_DIR/../youtube_exports/studio_reach_report_recent.csv"
  if python3 "$SCRIPT_DIR/download_studio_csv.py" --mode=recent 2>&1 | tee -a "$LOG_FILE"; then
    echo "  ✅ recent CSV 저장 완료: $RECENT_CSV" | tee -a "$LOG_FILE"
  else
    echo "  ❌ recent CSV 다운로드 실패" | tee -a "$LOG_FILE"
  fi
  _stop_cdp_chrome
  exit 0
fi

# ── 1. CSV 다운로드 (재시도 3회) ─────────────────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "[1/3] CSV 다운로드 중..." | tee -a "$LOG_FILE"

CSV_SUCCESS=false
for attempt in 1 2 3; do
  echo "  ▶ 시도 $attempt / 3" | tee -a "$LOG_FILE"
  if python3 "$SCRIPT_DIR/download_studio_csv.py" 2>&1 | tee -a "$LOG_FILE"; then
    CSV_SUCCESS=true
    break
  fi
  if [ $attempt -lt 3 ]; then
    echo "  ⚠️ 실패 — 10초 후 재시도..." | tee -a "$LOG_FILE"
    sleep 10
  fi
done

if [ "$CSV_SUCCESS" != "true" ] || [ ! -f "$CSV_PATH" ]; then
  on_error "CSV 다운로드 (3회 모두 실패)"
fi
echo "  ✅ CSV 저장 완료: $CSV_PATH" | tee -a "$LOG_FILE"

# ── 1-B. 다운로드 성공 타임스탬프 기록 ────────────────────────────────────────
# GitHub Actions에서 로컬 다운로드 신선도를 감지할 수 있도록 timestamp 파일 push
date -u "+%Y-%m-%dT%H:%M:%SZ" > "$TIMESTAMP_FILE"
echo "  📅 타임스탬프 기록: $(cat "$TIMESTAMP_FILE")" | tee -a "$LOG_FILE"

# ── 2. git 커밋 ───────────────────────────────────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "[2/3] git 커밋 중..." | tee -a "$LOG_FILE"
cd "$REPO_ROOT" || on_error "REPO_ROOT 이동"

git add "$CSV_REL" "$TIMESTAMP_REL" 2>&1 | tee -a "$LOG_FILE" || on_error "git add"

TODAY=$(date +"%Y-%m-%d")
if git diff --cached --quiet; then
  echo "  ℹ️  CSV 변경 없음 — 빈 커밋으로 Actions 트리거 유지" | tee -a "$LOG_FILE"
  git commit --allow-empty -m "chore: daily Actions keepalive ($TODAY)" 2>&1 | tee -a "$LOG_FILE" || on_error "git commit"
else
  git commit -m "data: update studio reach CSV ($TODAY)" 2>&1 | tee -a "$LOG_FILE" || on_error "git commit"
  echo "  ✅ 커밋 완료" | tee -a "$LOG_FILE"
fi

# ── 3. git push ───────────────────────────────────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "[3/3] git push..." | tee -a "$LOG_FILE"
git push 2>&1 | tee -a "$LOG_FILE" || on_error "git push"

# ── CDP Chrome 종료 ───────────────────────────────────────────────────────────
_stop_cdp_chrome

REPO_URL="https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')"
echo "" | tee -a "$LOG_FILE"
echo "==============================" | tee -a "$LOG_FILE"
echo "✅ 완료. GitHub Actions 실행 중" | tee -a "$LOG_FILE"
echo "  $REPO_URL/actions" | tee -a "$LOG_FILE"
echo "  로그: $LOG_FILE" | tee -a "$LOG_FILE"
echo "==============================" | tee -a "$LOG_FILE"
