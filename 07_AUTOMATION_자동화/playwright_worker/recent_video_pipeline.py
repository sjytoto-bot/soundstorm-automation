from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

SOURCE_PRIORITY = {
    "official_csv": 4,
    "worker": 3,
    "local_cdp": 2,
    "inferred_csv": 1,
}

DEFAULT_STATUSES = {
    "ok",
    "partial",
    "not_found",
    "auth_expired",
    "rate_limited",
    "stale",
    "metric_not_ready",
    "studio_layout_changed",
    "video_not_found",
}

KST = timezone(timedelta(hours=9))


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def coerce_ctr(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    try:
        text = str(value).replace("%", "").strip()
        if not text:
            return None
        ctr = float(text)
        if ctr > 1:
            ctr /= 100.0
        return round(ctr, 6)
    except Exception:
        return None


def coerce_impressions(value: Any) -> int | None:
    if value in (None, "", "None"):
        return None
    try:
        return int(float(str(value).replace(",", "").strip()))
    except Exception:
        return None


def make_metric_result(
    *,
    status: str,
    video_id: str,
    source: str,
    metric_window: str = "since_publish",
    impressions: Any = None,
    ctr: Any = None,
    captured_at: str | None = None,
    video_published_at: str | None = None,
    observed_in_studio: bool = False,
    reason: str | None = None,
) -> dict[str, Any]:
    normalized_status = status if status in DEFAULT_STATUSES else "partial"
    return {
        "status": normalized_status,
        "video_id": video_id,
        "metric_window": metric_window,
        "impressions": coerce_impressions(impressions),
        "ctr": coerce_ctr(ctr),
        "source": source,
        "captured_at": captured_at or now_utc_iso(),
        "video_published_at": video_published_at,
        "observed_in_studio": bool(observed_in_studio),
        "reason": reason,
    }


def normalize_metric_result(raw: dict[str, Any] | None, *, default_video_id: str = "", default_source: str = "inferred_csv") -> dict[str, Any]:
    raw = raw or {}
    return make_metric_result(
        status=str(raw.get("status") or "partial"),
        video_id=str(raw.get("video_id") or default_video_id),
        source=str(raw.get("source") or default_source),
        metric_window=str(raw.get("metric_window") or "since_publish"),
        impressions=raw.get("impressions"),
        ctr=raw.get("ctr"),
        captured_at=raw.get("captured_at"),
        video_published_at=raw.get("video_published_at"),
        observed_in_studio=raw.get("observed_in_studio", False),
        reason=raw.get("reason"),
    )
