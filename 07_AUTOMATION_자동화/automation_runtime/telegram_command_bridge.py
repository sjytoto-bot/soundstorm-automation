from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from telegram_notifier import TelegramConfig, escape_markdown, send_telegram_message


POLL_TIMEOUT_SECONDS = 30
AUTOMATION_ROOT = Path(__file__).resolve().parent
SCRIPTS_ROOT = AUTOMATION_ROOT.parent / "scripts_스크립트"
RUN_AND_NOTIFY_PATH = AUTOMATION_ROOT / "run_and_notify.py"

COMMAND_REGISTRY = {
    "sync": {
        "job_name": "SOUNDSTORM Pipeline",
        "cwd": str(SCRIPTS_ROOT),
        "command": ["bash", str(SCRIPTS_ROOT / "run_pipeline.sh")],
        "description": "Studio CSV sync + downstream pipeline",
    },
}


def telegram_api(method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    config = TelegramConfig.from_env()
    data = None
    if payload:
        data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url=f"https://api.telegram.org/bot{config.bot_token}/{method}",
        data=data,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=POLL_TIMEOUT_SECONDS + 10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Telegram API error on {method}: {detail}") from exc


def format_pong() -> str:
    return "\n".join(
        [
            "✅ *SOUNDSTORM Telegram Bridge 연결됨*",
            f"호스트: `{escape_markdown(socket.gethostname())}`",
            f"시간: `{escape_markdown(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))}`",
            "상태: `/ping` 수신 후 `/pong` 응답 성공",
        ]
    )


def extract_message(update: dict[str, Any]) -> dict[str, Any] | None:
    return update.get("message") or update.get("edited_message")


def format_help() -> str:
    return "\n".join(
        [
            "사용 가능한 명령:",
            "`/ping`",
            "`/status`",
            "`/run sync`",
        ]
    )


def launch_job(command_key: str, chat_id: str, thread_id: str | None) -> subprocess.Popen[bytes]:
    spec = COMMAND_REGISTRY[command_key]
    env = os.environ.copy()
    env["TELEGRAM_CHAT_ID"] = chat_id
    if thread_id:
        env["TELEGRAM_MESSAGE_THREAD_ID"] = thread_id

    launcher = [
        sys.executable,
        str(RUN_AND_NOTIFY_PATH),
        "--job-name",
        spec["job_name"],
        "--cwd",
        spec["cwd"],
        "--",
        *spec["command"],
    ]
    return subprocess.Popen(
        launcher,
        cwd=spec["cwd"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def format_job_started(command_key: str) -> str:
    spec = COMMAND_REGISTRY[command_key]
    return "\n".join(
        [
            f"🚀 *작업 시작*: `{escape_markdown(command_key)}`",
            f"설명: {escape_markdown(spec['description'])}",
            "완료되면 결과를 이 채팅으로 다시 보냅니다.",
        ]
    )


def format_status(active_jobs: dict[str, subprocess.Popen[bytes]]) -> str:
    if not active_jobs:
        return "현재 실행 중인 작업이 없습니다."
    lines = ["현재 실행 중인 작업:"]
    for command_key, process in active_jobs.items():
        lines.append(f"`{escape_markdown(command_key)}` pid={process.pid}")
    return "\n".join(lines)


def main() -> int:
    config = TelegramConfig.from_env()
    allowed_chat_id = os.getenv("TELEGRAM_ALLOWED_CHAT_ID", "").strip() or None
    offset = 0
    active_jobs: dict[str, subprocess.Popen[bytes]] = {}

    print("Telegram command bridge started. Send /ping from Telegram to test.")

    while True:
        finished_keys = [key for key, process in active_jobs.items() if process.poll() is not None]
        for key in finished_keys:
            active_jobs.pop(key, None)

        response = telegram_api(
            "getUpdates",
            {
                "timeout": POLL_TIMEOUT_SECONDS,
                "offset": offset,
                "allowed_updates": json.dumps(["message", "edited_message"]),
            },
        )
        for update in response.get("result", []):
            offset = update["update_id"] + 1
            message = extract_message(update)
            if not message:
                continue

            chat_id = str(message.get("chat", {}).get("id", "")).strip()
            thread_id = (
                str(message.get("message_thread_id", "")).strip() or None
            )
            text = (message.get("text") or "").strip()
            if not chat_id:
                continue
            if allowed_chat_id and chat_id != allowed_chat_id:
                continue

            if text == "/ping":
                send_telegram_message(format_pong(), chat_id=chat_id, message_thread_id=thread_id)
            elif text == "/status":
                send_telegram_message(
                    format_status(active_jobs),
                    chat_id=chat_id,
                    message_thread_id=thread_id,
                    disable_notification=True,
                )
            elif text.startswith("/run "):
                command_key = text.split(maxsplit=1)[1].strip().lower()
                if command_key not in COMMAND_REGISTRY:
                    send_telegram_message(
                        "허용되지 않은 작업입니다.\n" + format_help(),
                        chat_id=chat_id,
                        message_thread_id=thread_id,
                    )
                    continue
                if command_key in active_jobs:
                    send_telegram_message(
                        f"`{escape_markdown(command_key)}` 작업은 이미 실행 중입니다.",
                        chat_id=chat_id,
                        message_thread_id=thread_id,
                        disable_notification=True,
                    )
                    continue
                active_jobs[command_key] = launch_job(command_key, chat_id, thread_id)
                send_telegram_message(
                    format_job_started(command_key),
                    chat_id=chat_id,
                    message_thread_id=thread_id,
                    disable_notification=True,
                )
            elif text == "/help":
                send_telegram_message(
                    format_help(),
                    chat_id=chat_id,
                    message_thread_id=thread_id,
                    disable_notification=True,
                )

        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
