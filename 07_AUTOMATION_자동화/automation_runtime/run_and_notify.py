from __future__ import annotations

import argparse
import os
import platform
import shlex
import subprocess
from datetime import datetime
from pathlib import Path

from telegram_notifier import TelegramConfigError, escape_markdown, send_telegram_message


def build_message(
    *,
    job_name: str,
    command: list[str],
    result: subprocess.CompletedProcess[str],
    started_at: datetime,
    finished_at: datetime,
) -> str:
    status_icon = "✅" if result.returncode == 0 else "❌"
    duration = int((finished_at - started_at).total_seconds())
    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    max_len = 1200

    body_lines = [
        f"{status_icon} *{escape_markdown(job_name)}*",
        f"호스트: `{escape_markdown(platform.node() or 'unknown')}`",
        f"시작: `{escape_markdown(started_at.strftime('%Y-%m-%d %H:%M:%S'))}`",
        f"종료: `{escape_markdown(finished_at.strftime('%Y-%m-%d %H:%M:%S'))}`",
        f"소요: `{duration}s`",
        f"종료코드: `{result.returncode}`",
        f"명령: `{escape_markdown(' '.join(shlex.quote(part) for part in command))}`",
    ]
    if stdout:
        body_lines.append(f"stdout:\n```text\n{escape_markdown(stdout[:max_len])}\n```")
    if stderr:
        body_lines.append(f"stderr:\n```text\n{escape_markdown(stderr[:max_len])}\n```")
    return "\n".join(body_lines)


def normalize_command(command: list[str]) -> list[str]:
    if command and command[0] == "--":
        return command[1:]
    return command


def build_exception_message(
    *,
    job_name: str,
    command: list[str],
    started_at: datetime,
    exc: Exception,
) -> str:
    return "\n".join(
        [
            f"❌ {job_name}",
            f"호스트: {platform.node() or 'unknown'}",
            f"시작: {started_at.strftime('%Y-%m-%d %H:%M:%S')}",
            f"명령: {' '.join(shlex.quote(part) for part in command)}",
            f"실패: {type(exc).__name__}: {exc}",
        ]
    )


def run_job(job_name: str, command: list[str], cwd: str | None) -> int:
    return run_job_with_target(job_name=job_name, command=command, cwd=cwd)


def run_job_with_target(
    *,
    job_name: str,
    command: list[str],
    cwd: str | None,
    chat_id: str | None = None,
    message_thread_id: str | None = None,
) -> int:
    command = normalize_command(command)
    started_at = datetime.now()
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            env=os.environ.copy(),
        )
    except Exception as exc:
        message = build_exception_message(
            job_name=job_name,
            command=command,
            started_at=started_at,
            exc=exc,
        )
        send_telegram_message(
            message,
            chat_id=chat_id,
            message_thread_id=message_thread_id,
        )
        return 1
    finished_at = datetime.now()
    message = build_message(
        job_name=job_name,
        command=command,
        result=result,
        started_at=started_at,
        finished_at=finished_at,
    )
    send_telegram_message(
        message,
        chat_id=chat_id,
        message_thread_id=message_thread_id,
        disable_notification=result.returncode == 0,
    )
    return result.returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a local automation job and push the result to Telegram."
    )
    parser.add_argument("--job-name", required=True, help="Human-friendly job label")
    parser.add_argument(
        "--cwd",
        default=None,
        help="Working directory for the command. Defaults to current directory.",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to execute. Prefix with -- before the command.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    command = normalize_command(args.command)
    if not command:
        raise SystemExit("No command provided. Example: -- python3 script.py")

    cwd = str(Path(args.cwd).expanduser().resolve()) if args.cwd else None
    try:
        return run_job_with_target(job_name=args.job_name, command=command, cwd=cwd)
    except TelegramConfigError as exc:
        raise SystemExit(
            f"{exc} Copy .env.example values into your shell or launchd env first."
        ) from exc


if __name__ == "__main__":
    raise SystemExit(main())
