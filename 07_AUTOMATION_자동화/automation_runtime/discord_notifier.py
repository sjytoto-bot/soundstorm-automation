from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


class DiscordConfigError(RuntimeError):
    """Raised when Discord webhook settings are missing."""


def get_discord_webhook_url() -> str:
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook_url:
        raise DiscordConfigError("DISCORD_WEBHOOK_URL must be set.")
    return webhook_url


def send_discord_message(
    content: str,
    *,
    username: str = "SOUNDSTORM Watchdog",
    embeds: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    webhook_url = get_discord_webhook_url()
    payload: dict[str, Any] = {
        "content": content[:2000],
        "username": username[:80],
    }
    if embeds:
        payload["embeds"] = embeds[:10]

    encoded = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=webhook_url,
        data=encoded,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8", errors="replace").strip()
            if not raw:
                return {"ok": True}
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Discord webhook error: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Discord request failed: {exc}") from exc
