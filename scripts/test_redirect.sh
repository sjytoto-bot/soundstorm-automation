#!/bin/bash
# SOUNDSTORM Redirect Tracker — 동작 테스트 스크립트
# 실행: bash scripts/test_redirect.sh [port]
# 사전 조건: start_redirect.sh 로 서버가 실행 중이어야 함

PORT="${1:-8080}"
BASE="http://localhost:$PORT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SOUNDSTORM Redirect Tracker — Test Suite"
echo "  Target: $BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 헬스 체크
echo ""
echo "[1] Health check"
curl -s "$BASE/health" | python3 -m json.tool

# 2. 링크 목록 조회
echo ""
echo "[2] Link list (GET /api/links)"
curl -s "$BASE/api/links" | python3 -m json.tool

# 3. 테스트 클릭 (assassin slug — video가 비어 있으면 404 정상)
echo ""
echo "[3] Redirect test — /r/assassin (video 미설정 시 404 예상)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE/r/assassin"

# 4. 로그 조회
echo ""
echo "[4] Click logs (GET /api/logs)"
curl -s "$BASE/api/logs" | python3 -m json.tool

# 5. 집계 통계
echo ""
echo "[5] Campaign stats (GET /api/stats)"
curl -s "$BASE/api/stats" | python3 -m json.tool

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  테스트 완료"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
