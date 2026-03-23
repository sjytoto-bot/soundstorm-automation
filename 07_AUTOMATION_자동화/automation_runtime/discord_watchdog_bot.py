from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any


_KST = timezone(timedelta(hours=9))
AUTOMATION_RUNTIME_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = AUTOMATION_RUNTIME_DIR.parent / "03_RUNTIME"
OUTPUT_DIR = RUNTIME_DIR / "discord_watchdog_outputs"
COMMAND_LOG_PATH = RUNTIME_DIR / "discord_watchdog_command_log.json"
LOCK_PATH = RUNTIME_DIR / "discord_watchdog.lock"
WATCHDOG_SCRIPT = AUTOMATION_RUNTIME_DIR / "latest_video_watchdog.py"
LATEST_PROPOSAL_PATH = RUNTIME_DIR / "latest_video_watchdog_proposal.json"
SCAN_LOG_PATH = RUNTIME_DIR / "latest_video_scan_log.json"
APPLY_LOG_PATH = RUNTIME_DIR / "latest_video_apply_log.json"

SCAN_TIMEOUT_SEC = int(os.getenv("WATCHDOG_SCAN_TIMEOUT_SEC", "120"))
APPLY_TIMEOUT_SEC = int(os.getenv("WATCHDOG_APPLY_TIMEOUT_SEC", "180"))
ROLLBACK_TIMEOUT_SEC = int(os.getenv("WATCHDOG_ROLLBACK_TIMEOUT_SEC", "180"))


@dataclass(frozen=True)
class BotAccessConfig:
    token: str
    guild_id: int | None
    allowed_user_ids: set[int]
    allowed_role_ids: set[int]
    admin_user_ids: set[int]
    admin_role_ids: set[int]


def now_kst() -> datetime:
    return datetime.now(_KST)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_command_log(entry: dict[str, Any]) -> None:
    logs = load_json(COMMAND_LOG_PATH, [])
    logs.append(entry)
    save_json(COMMAND_LOG_PATH, logs)


def parse_int_set(env_name: str) -> set[int]:
    raw = os.getenv(env_name, "").strip()
    result: set[int] = set()
    if not raw:
        return result
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            result.add(int(item))
        except ValueError:
            continue
    return result


def load_access_config() -> BotAccessConfig:
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("DISCORD_BOT_TOKEN must be set.")

    guild_raw = os.getenv("DISCORD_GUILD_ID", "").strip()
    guild_id = int(guild_raw) if guild_raw else None

    return BotAccessConfig(
        token=token,
        guild_id=guild_id,
        allowed_user_ids=parse_int_set("DISCORD_ALLOWED_USER_IDS"),
        allowed_role_ids=parse_int_set("DISCORD_ALLOWED_ROLE_IDS"),
        admin_user_ids=parse_int_set("DISCORD_ADMIN_USER_IDS"),
        admin_role_ids=parse_int_set("DISCORD_ADMIN_ROLE_IDS"),
    )


def summarize_text(text: str, *, limit: int = 1500) -> str:
    text = (text or "").strip()
    if not text:
        return "(no output)"
    if len(text) <= limit:
        return text
    return text[:limit] + "\n... [truncated]"


def save_command_output(command_name: str, stdout: str, stderr: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = now_kst().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"{command_name}_{ts}.json"
    save_json(
        path,
        {
            "saved_at": now_kst().isoformat(),
            "command": command_name,
            "stdout": stdout,
            "stderr": stderr,
        },
    )
    return path


@contextmanager
def exclusive_lock(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError("이미 다른 watchdog 명령이 실행 중입니다.")

    try:
        payload = f"{os.getpid()} {now_kst().isoformat()}\n"
        os.write(fd, payload.encode("utf-8"))
        yield
    finally:
        try:
            os.close(fd)
        except Exception:
            pass
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


def latest_apply_entry() -> dict[str, Any] | None:
    logs = load_json(APPLY_LOG_PATH, [])
    for entry in reversed(logs):
        if not isinstance(entry, dict):
            continue
        if entry.get("rollback"):
            continue
        return entry
    return None


def latest_scan_entry() -> dict[str, Any] | None:
    logs = load_json(SCAN_LOG_PATH, [])
    if not logs:
        return None
    return logs[-1]


def latest_proposal() -> dict[str, Any]:
    return load_json(LATEST_PROPOSAL_PATH, {})


def require_access(interaction: Any, config: BotAccessConfig, *, admin_only: bool = False) -> str | None:
    user_id = int(interaction.user.id)
    role_ids = {int(role.id) for role in getattr(interaction.user, "roles", [])}

    allowed = False
    if user_id in config.allowed_user_ids or user_id in config.admin_user_ids:
        allowed = True
    if config.allowed_role_ids & role_ids:
        allowed = True
    if config.admin_role_ids & role_ids:
        allowed = True

    if admin_only:
        admin_allowed = user_id in config.admin_user_ids or bool(config.admin_role_ids & role_ids)
        if not admin_allowed:
            return "이 명령은 관리자만 실행할 수 있습니다."

    if not allowed and (config.allowed_user_ids or config.allowed_role_ids or config.admin_user_ids or config.admin_role_ids):
        return "허용된 사용자 또는 역할만 실행할 수 있습니다."
    return None


def run_watchdog_subprocess(command_name: str, args: list[str], *, timeout_sec: int) -> dict[str, Any]:
    full_cmd = [sys.executable, str(WATCHDOG_SCRIPT), *args]
    started_at = now_kst()
    try:
        with exclusive_lock(LOCK_PATH):
            completed = subprocess.run(
                full_cmd,
                cwd=str(AUTOMATION_RUNTIME_DIR),
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )
    except subprocess.TimeoutExpired as exc:
        output_path = save_command_output(command_name, exc.stdout or "", exc.stderr or "")
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or f"timeout after {timeout_sec}s",
            "output_path": str(output_path),
            "started_at": started_at.isoformat(),
            "finished_at": now_kst().isoformat(),
            "command": full_cmd,
        }

    output_path = save_command_output(command_name, completed.stdout or "", completed.stderr or "")
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout or "",
        "stderr": completed.stderr or "",
        "output_path": str(output_path),
        "started_at": started_at.isoformat(),
        "finished_at": now_kst().isoformat(),
        "command": full_cmd,
    }


def build_status_message() -> str:
    proposal = latest_proposal()
    scan = latest_scan_entry()
    apply = latest_apply_entry()

    lines = ["Latest Watchdog Status"]

    if proposal:
        lines.append(
            f"proposal: {proposal.get('proposal_id', '-')}"
            f" | action: {proposal.get('action_label', proposal.get('action', '-'))}"
            f" | auto: {proposal.get('auto_eligible', False)}"
        )
        lines.append(
            f"video: {proposal.get('video_id', '-')} | ctr: {proposal.get('ctr')} | impressions: {proposal.get('impressions')}"
        )
    else:
        lines.append("proposal: 없음")

    if scan:
        lines.append(
            f"last scan: {scan.get('scanned_at', '-')}"
            f" | action: {scan.get('action_label', scan.get('action', '-'))}"
        )
    else:
        lines.append("last scan: 없음")

    if apply:
        changes = apply.get("applied_changes", {})
        title_change = changes.get("title") or "없음"
        thumb_change = changes.get("thumbnail_upload_path") or "없음"
        lines.append(
            f"last apply: {apply.get('applied_at', '-')}"
            f" | title: {title_change}"
            f" | thumb: {thumb_change}"
        )
    else:
        lines.append("last apply: 없음")

    return "\n".join(lines)


def build_command_response(command_name: str, result: dict[str, Any]) -> str:
    stdout_summary = summarize_text(result.get("stdout", ""))
    stderr_summary = summarize_text(result.get("stderr", ""))
    return textwrap.dedent(
        f"""
        command: {command_name}
        ok: {result.get('ok')}
        returncode: {result.get('returncode')}
        output_file: {result.get('output_path')}

        stdout:
        {stdout_summary}

        stderr:
        {stderr_summary}
        """
    ).strip()


def validate_apply_request(proposal_id: str, apply_key: str) -> str | None:
    proposal = latest_proposal()
    if not proposal:
        return "최근 proposal 이 없습니다."
    if proposal.get("proposal_id") != proposal_id:
        return "proposal_id 가 현재 최신 proposal 과 일치하지 않습니다."
    if proposal.get("apply_key") != apply_key:
        return "apply_key 가 일치하지 않습니다."
    return None


def validate_rollback_request() -> str | None:
    apply_entry = latest_apply_entry()
    if not apply_entry:
        return "rollback 할 최근 apply 이력이 없습니다."

    logs = load_json(APPLY_LOG_PATH, [])
    rollback_count = 0
    for entry in reversed(logs):
        if not isinstance(entry, dict):
            continue
        rollback = entry.get("rollback")
        if rollback and rollback.get("video_id") == apply_entry.get("video_id"):
            rollback_count += 1
            break
    if rollback_count:
        return "이 영상은 이미 최근 apply 에 대해 rollback 이 한 번 실행되었습니다."
    return None


def append_discord_command_result(command_name: str, interaction: Any, result: dict[str, Any], params: dict[str, Any]) -> None:
    append_command_log(
        {
            "ran_at": now_kst().isoformat(),
            "command_name": command_name,
            "discord_user_id": int(interaction.user.id),
            "discord_user_name": str(interaction.user),
            "params": params,
            "ok": result.get("ok"),
            "returncode": result.get("returncode"),
            "output_path": result.get("output_path"),
        }
    )


def main() -> int:
    try:
        import discord
        from discord import app_commands
    except Exception as exc:
        raise SystemExit(
            "discord.py 가 필요합니다. `pip install discord.py` 후 다시 실행하세요.\n"
            f"detail: {exc}"
        ) from exc

    config = load_access_config()
    intents = discord.Intents.default()
    intents.guilds = True
    intents.members = True

    class WatchdogBot(discord.Client):
        def __init__(self) -> None:
            super().__init__(intents=intents)
            self.tree = app_commands.CommandTree(self)

        async def setup_hook(self) -> None:
            if config.guild_id:
                guild_obj = discord.Object(id=config.guild_id)
                await self.tree.sync(guild=guild_obj)
            else:
                await self.tree.sync()

    client = WatchdogBot()

    watchdog_group = app_commands.Group(name="watchdog", description="SOUNDSTORM latest video watchdog")

    @watchdog_group.command(name="scan", description="최신 영상 분석 실행")
    @app_commands.describe(mode="safe 또는 auto", notify="Discord 웹훅 알림 여부")
    async def watchdog_scan(interaction: discord.Interaction, mode: str = "safe", notify: bool = True) -> None:
        error = require_access(interaction, config, admin_only=False)
        if error:
            await interaction.response.send_message(error, ephemeral=True)
            return
        if mode not in {"safe", "auto"}:
            await interaction.response.send_message("mode 는 safe 또는 auto 만 가능합니다.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True, thinking=True)
        args = ["scan", "--mode", mode]
        if notify:
            args.append("--notify")
        result = run_watchdog_subprocess("scan", args, timeout_sec=SCAN_TIMEOUT_SEC)
        append_discord_command_result("scan", interaction, result, {"mode": mode, "notify": notify})
        await interaction.followup.send(build_command_response("scan", result), ephemeral=True)

    @watchdog_group.command(name="status", description="최근 watchdog 상태 조회")
    async def watchdog_status(interaction: discord.Interaction) -> None:
        error = require_access(interaction, config, admin_only=False)
        if error:
            await interaction.response.send_message(error, ephemeral=True)
            return
        append_command_log(
            {
                "ran_at": now_kst().isoformat(),
                "command_name": "status",
                "discord_user_id": int(interaction.user.id),
                "discord_user_name": str(interaction.user),
                "params": {},
                "ok": True,
                "returncode": 0,
                "output_path": None,
            }
        )
        await interaction.response.send_message(build_status_message(), ephemeral=True)

    @watchdog_group.command(name="apply", description="최근 proposal 적용")
    @app_commands.describe(proposal_id="적용할 proposal id", apply_key="proposal 에 포함된 apply key", confirm="true 여야 실행")
    async def watchdog_apply(
        interaction: discord.Interaction,
        proposal_id: str,
        apply_key: str,
        confirm: bool = False,
    ) -> None:
        error = require_access(interaction, config, admin_only=True)
        if error:
            await interaction.response.send_message(error, ephemeral=True)
            return
        validation_error = validate_apply_request(proposal_id, apply_key)
        if validation_error:
            await interaction.response.send_message(validation_error, ephemeral=True)
            return
        if not confirm:
            await interaction.response.send_message(
                "apply 전 확인이 필요합니다. 동일 명령을 `confirm:true` 로 다시 실행하세요.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)
        result = run_watchdog_subprocess("apply", ["apply"], timeout_sec=APPLY_TIMEOUT_SEC)
        append_discord_command_result(
            "apply",
            interaction,
            result,
            {"proposal_id": proposal_id, "apply_key": apply_key, "confirm": confirm},
        )
        await interaction.followup.send(build_command_response("apply", result), ephemeral=True)

    @watchdog_group.command(name="rollback", description="가장 최근 적용 롤백")
    @app_commands.describe(confirm="true 여야 실행")
    async def watchdog_rollback(interaction: discord.Interaction, confirm: bool = False) -> None:
        error = require_access(interaction, config, admin_only=True)
        if error:
            await interaction.response.send_message(error, ephemeral=True)
            return
        validation_error = validate_rollback_request()
        if validation_error:
            await interaction.response.send_message(validation_error, ephemeral=True)
            return
        if not confirm:
            await interaction.response.send_message(
                "rollback 전 확인이 필요합니다. 동일 명령을 `confirm:true` 로 다시 실행하세요.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True, thinking=True)
        result = run_watchdog_subprocess("rollback", ["rollback"], timeout_sec=ROLLBACK_TIMEOUT_SEC)
        append_discord_command_result(
            "rollback",
            interaction,
            result,
            {"confirm": confirm},
        )
        await interaction.followup.send(build_command_response("rollback", result), ephemeral=True)

    if config.guild_id:
        client.tree.add_command(watchdog_group, guild=discord.Object(id=config.guild_id))
    else:
        client.tree.add_command(watchdog_group)
    client.run(config.token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
