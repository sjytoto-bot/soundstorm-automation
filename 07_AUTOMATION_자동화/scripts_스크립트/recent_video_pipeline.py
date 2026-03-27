"""
recent_video_pipeline.py

최근 업로드 1개 보강용 공통 파이프라인:
collector -> normalizer -> resolver -> writer
"""

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


def parse_datetime_like(value: Any) -> datetime | None:
    if value in (None, "", "None"):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        if "T" in text:
            dt = datetime.fromisoformat(text)
            return dt if dt.tzinfo else dt.replace(tzinfo=KST)
        return datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=KST)
    except Exception:
        return None


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


def is_low_quality_metric(result: dict[str, Any]) -> bool:
    impressions = result.get("impressions")
    ctr = result.get("ctr")
    return (impressions in (None, 0)) and ctr in (None, 0, 0.0)


def source_priority(source: str | None) -> int:
    return SOURCE_PRIORITY.get(str(source or "").strip(), 0)


def resolve_metric_candidates(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = [normalize_metric_result(candidate) for candidate in candidates if candidate]
    if not normalized:
        return make_metric_result(
            status="not_found",
            video_id="",
            source="inferred_csv",
            reason="No recent-video candidates available",
        )

    valid = [r for r in normalized if r.get("status") in {"ok", "partial"} and not is_low_quality_metric(r)]
    pool = valid or normalized

    def _sort_key(item: dict[str, Any]):
        captured = parse_datetime_like(item.get("captured_at")) or datetime.min.replace(tzinfo=timezone.utc)
        return (
            source_priority(item.get("source")),
            1 if item.get("observed_in_studio") else 0,
            1 if item.get("status") == "ok" else 0,
            captured.timestamp(),
            item.get("impressions") or 0,
        )

    return sorted(pool, key=_sort_key, reverse=True)[0]


def select_recent_video_candidate(records: list[dict[str, Any]], *, max_age_hours: int = 72) -> dict[str, Any]:
    now = datetime.now(KST)
    candidates: list[tuple[datetime, dict[str, Any], list[str]]] = []
    for row in records:
        video_id = str(row.get("video_id", "")).strip()
        if len(video_id) != 11:
            continue

        published_at = row.get("published_at") or row.get("upload_date") or row.get("data_fetched_at")
        published_dt = parse_datetime_like(published_at)
        if not published_dt:
            continue

        reasons: list[str] = []
        visibility = str(row.get("visibility") or row.get("privacy_status") or "").strip().lower()
        if visibility and visibility != "public":
            continue
        if not visibility:
            reasons.append("visibility metadata unavailable; upload_date fallback used")

        title = str(row.get("title") or row.get("youtube_title") or row.get("track_name") or "").strip()
        try:
            runtime_sec = int(float(row.get("runtime_sec") or 0))
        except Exception:
            runtime_sec = 0
        is_short = str(row.get("is_short") or "").strip().lower() in {"true", "1", "y", "yes"}
        live_flag = str(row.get("live_broadcast_content") or "").strip().lower()
        if is_short or "#shorts" in title.lower():
            continue
        if live_flag in {"live", "upcoming", "completed"}:
            continue
        if runtime_sec and runtime_sec <= 180:
            reasons.append("shorts heuristic unavailable; runtime-only heuristic retained")

        age_hours = (now - published_dt.astimezone(KST)).total_seconds() / 3600
        if age_hours > max_age_hours:
            continue

        candidates.append((published_dt, row, reasons))

    if not candidates:
        return {
            "status": "not_found",
            "video_id": "",
            "video_published_at": None,
            "reason": f"No public VOD candidate within {max_age_hours}h",
        }

    candidates.sort(key=lambda item: item[0], reverse=True)
    published_dt, row, reasons = candidates[0]
    return {
        "status": "ok",
        "video_id": str(row.get("video_id", "")).strip(),
        "video_published_at": published_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reason": "; ".join(reasons) if reasons else "Selected latest public VOD within freshness window",
    }


def should_write_metric(existing: dict[str, Any], incoming: dict[str, Any]) -> tuple[bool, str]:
    incoming = normalize_metric_result(incoming)
    if incoming.get("status") not in {"ok", "partial"}:
        return False, f"skip non-writable status={incoming.get('status')}"
    if is_low_quality_metric(incoming):
        return False, "skip low-quality metric payload"

    current_imp = coerce_impressions(existing.get("impressions"))
    current_ctr = coerce_ctr(existing.get("ctr"))
    current_source = str(existing.get("ctr_source") or existing.get("impressions_source") or "")
    current_updated = parse_datetime_like(existing.get("ctr_updated_at"))
    incoming_updated = parse_datetime_like(incoming.get("captured_at"))

    current_empty = current_imp in (None, 0) and current_ctr in (None, 0, 0.0)
    if current_empty:
        return True, "write empty target"

    if incoming_updated and current_updated and incoming_updated <= current_updated:
        return False, "skip older or equal metric payload"
    if source_priority(incoming.get("source")) < source_priority(current_source):
        return False, f"skip lower-priority source ({incoming.get('source')} < {current_source})"
    if incoming_updated and not current_updated:
        return True, "write newer payload with timestamp"
    if incoming_updated and current_updated and incoming_updated > current_updated:
        return True, "write newer payload"
    if source_priority(incoming.get("source")) > source_priority(current_source):
        return True, "write higher-priority source"
    return False, "skip no better than existing metric"


def write_metric_result(gc, spreadsheet_id: str, sheet_name: str, result: dict[str, Any]) -> dict[str, Any]:
    sh = gc.open_by_key(spreadsheet_id)
    ws = sh.worksheet(sheet_name)
    headers = ws.row_values(1)

    def _col(name: str) -> int | None:
        try:
            return headers.index(name) + 1
        except ValueError:
            return None

    vid_col = _col("video_id")
    imp_col = _col("impressions")
    ctr_col = _col("ctr")
    src_col = _col("ctr_source")
    upd_col = _col("ctr_updated_at")
    if not all([vid_col, imp_col, ctr_col]):
        raise RuntimeError(f"필수 컬럼 없음 (video_id/impressions/ctr). headers: {headers[:12]}")

    video_id = result.get("video_id", "")
    col_vals = ws.col_values(vid_col)
    try:
        row_idx = col_vals.index(video_id) + 1
    except ValueError as exc:
        raise RuntimeError(f"video_id '{video_id}' not found in {sheet_name}") from exc

    row_values = ws.row_values(row_idx)
    existing = {
        "impressions": row_values[imp_col - 1] if len(row_values) >= imp_col else None,
        "ctr": row_values[ctr_col - 1] if len(row_values) >= ctr_col else None,
        "ctr_source": row_values[src_col - 1] if src_col and len(row_values) >= src_col else None,
        "ctr_updated_at": row_values[upd_col - 1] if upd_col and len(row_values) >= upd_col else None,
    }

    should_write, write_reason = should_write_metric(existing, result)
    summary = {"video_id": video_id, "wrote": False, "reason": write_reason, "row_idx": row_idx}
    if not should_write:
        return summary

    ws.update_cell(row_idx, imp_col, result["impressions"])
    ws.update_cell(row_idx, ctr_col, result["ctr"])
    if src_col:
        ws.update_cell(row_idx, src_col, result["source"])
    if upd_col:
        ws.update_cell(row_idx, upd_col, result["captured_at"])
    summary["wrote"] = True
    return summary
