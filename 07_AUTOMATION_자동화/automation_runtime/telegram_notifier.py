from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional


class TelegramConfigError(RuntimeError):
    """Raised when Telegram environment variables are missing."""


@dataclass(frozen=True)
class TelegramConfig:
    bot_token: str
    chat_id: Optional[str] = None
    message_thread_id: Optional[str] = None

    @classmethod
    def from_env(cls) -> "TelegramConfig":
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip() or None
        message_thread_id = os.getenv("TELEGRAM_MESSAGE_THREAD_ID", "").strip() or None
        if not bot_token:
            raise TelegramConfigError("TELEGRAM_BOT_TOKEN must be set.")
        return cls(
            bot_token=bot_token,
            chat_id=chat_id,
            message_thread_id=message_thread_id,
        )


def escape_markdown(text: str) -> str:
    special_chars = r"_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{char}" if char in special_chars else char for char in text)


def send_telegram_message(
    text: str,
    *,
    chat_id: Optional[str] = None,
    disable_notification: bool = False,
    message_thread_id: Optional[str] = None,
    parse_mode: Optional[str] = None,
) -> dict:
    config = TelegramConfig.from_env()
    target_chat_id = chat_id or config.chat_id
    target_thread_id = message_thread_id or config.message_thread_id
    if not target_chat_id:
        raise TelegramConfigError(
            "TELEGRAM_CHAT_ID must be set, or chat_id must be passed explicitly."
        )
    payload = {
        "chat_id": target_chat_id,
        "text": text,
        "disable_notification": disable_notification,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if target_thread_id:
        payload["message_thread_id"] = target_thread_id

    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url=f"https://api.telegram.org/bot{config.bot_token}/sendMessage",
        data=encoded,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Telegram API error: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Telegram request failed: {exc}") from exc
