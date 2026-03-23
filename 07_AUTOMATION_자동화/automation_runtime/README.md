# Telegram Automation Runtime

PC 또는 텔레그램에서 실행 요청을 받고, 결과를 텔레그램으로 다시 보내는 최소 런타임 골격입니다.

## 구조

1. PC에서 수동 실행 또는 스케줄러가 명령 실행
2. `run_and_notify.py` 가 실제 스크립트를 실행
3. stdout/stderr/성공 여부를 텔레그램으로 전송
4. 사용자는 휴대폰 텔레그램에서 결과 확인

## 환경변수

`.env.example` 기준으로 아래 값을 설정합니다.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_MESSAGE_THREAD_ID` (선택)

## 예시

```bash
cd /Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내\ 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/automation_runtime

export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."

python3 run_and_notify.py \
  --job-name "Studio CSV Sync" \
  --cwd "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/scripts_스크립트" \
  -- bash run_pipeline.sh
```

## 텔레그램 연결 테스트

봇 토큰만 있으면, 휴대폰에서 `/ping` 을 보내고 PC가 `/pong` 으로 응답하는지 바로 확인할 수 있습니다.

```bash
cd /Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내\ 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/automation_runtime

export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."

python3 telegram_command_bridge.py
```

이후 휴대폰 텔레그램에서 해당 봇에게 `/ping` 을 보내면 연결 성공 시 `/pong` 성격의 상태 메시지가 돌아옵니다.

실행 테스트까지 하려면 아래 명령을 사용할 수 있습니다.

- `/status`
- `/run sync`
- `/help`

## 추천 연결 방식

- 수동 실행: Mac/PC 터미널 또는 Codex에서 직접 실행
- 자동 실행: `launchd` 또는 Codex automation에서 `run_and_notify.py` 호출
- 텔레그램에서 실행까지 하고 싶다면:
  - Bot 명령 수신기 하나를 추가
  - 허용 사용자만 명령 실행
  - 명령 종류를 화이트리스트로 제한

현재 포함된 범위는 "실행 결과를 텔레그램으로 보내는 공용 래퍼"까지입니다.

## Discord 중심 최신 영상 Watchdog

텔레그램 없이도 Discord 웹훅만으로 최신 영상 감시 흐름을 돌릴 수 있습니다.

필수 환경변수:

- `DISCORD_WEBHOOK_URL`

실행 예시:

```bash
cd /Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내\ 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/automation_runtime

export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

python3 latest_video_watchdog.py scan --mode safe --notify
python3 latest_video_watchdog.py apply
python3 latest_video_watchdog.py rollback
```

동작:

1. `03_RUNTIME/active_uploads.json` 에서 최신 영상을 선택
2. `_RawData_Master`, `Video_Diagnostics`, `Channel_CTR_KPI` 를 읽어 패키징 이슈 판단
3. `latest_video_watchdog_proposal.json` 에 수정 제안 저장
4. 문제 있으면 Discord 웹훅으로 알림
5. `apply` 시 YouTube 제목/썸네일 자동 반영
6. `rollback` 시 마지막 적용 백업으로 되돌림

주의:

- 제목/썸네일 자동 반영은 `credentials/token.pickle` 이 YouTube 수정 권한 스코프를 포함해야 합니다.
- 썸네일 자동 반영은 `thumbnail_intelligence/uploads/` 에 업로드할 실제 이미지 파일이 있을 때만 실행됩니다.
