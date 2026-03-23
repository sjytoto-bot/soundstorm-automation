"""
generate_active_uploads.py
SOUNDSTORM Active Upload Monitor v2.0

개선 내역 (v2.0):
  1. _Active_Uploads 시트 append-only 읽기 — video_id별 최신 행만 사용
  2. 중복 처리 방지 — state 파일로 2시간 이내 CSV 처리 스킵
  3. CTR null vs 0% 분리 — ctr_source: "missing" | "csv" | "sheets"
  4. 상태 머신 — status: "COLLECTING" | "READY" | "STALE"

상태 기준:
  COLLECTING  업로드 후 6시간 이내  (알고리즘 초기 배포 중)
  READY       CSV 수집 완료         (CTR 데이터 존재)
  STALE       업로드 후 24시간 초과 (모니터링 종료 대상)

사용법:
    python3 generate_active_uploads.py          # 전체 실행
    python3 generate_active_uploads.py --no-csv  # CSV 스킵 (테스트)

Mac cron (매시간 정각):
    0 * * * * python3 /path/to/generate_active_uploads.py >> /tmp/soundstorm_active.log 2>&1
"""

import os
import sys
import json
import base64
import argparse
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
_SCRIPT_DIR   = Path(__file__).parent
_AUTO_ROOT    = _SCRIPT_DIR.parent
_RUNTIME_DIR  = _AUTO_ROOT / "03_RUNTIME"
_OUTPUT_FILE  = _RUNTIME_DIR / "active_uploads.json"
_STATE_FILE   = _RUNTIME_DIR / "active_uploads_state.json"   # 중복 처리 방지용
_SYNC_SCRIPT  = _SCRIPT_DIR / "sync_studio_csv.sh"
_EXPORTS_DIR  = _AUTO_ROOT / "youtube_exports"
_RECENT_CSV   = _EXPORTS_DIR / "studio_reach_report_recent.csv"

CSV_COOLDOWN_H = 2   # 동일 영상 CSV 재처리 최소 간격 (시간)

# ── 인증 ───────────────────────────────────────────────────────────────────────
SPREADSHEET_ID = "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y"
SCOPES         = ["https://www.googleapis.com/auth/spreadsheets"]
IS_CI          = os.environ.get("CI") == "true" or os.environ.get("GITHUB_ACTIONS") == "true"

if IS_CI:
    _ci_dir = Path("/tmp/soundstorm_creds")
    _ci_dir.mkdir(exist_ok=True)
    b64_val = os.environ.get("SERVICE_ACCOUNT_B64", "")
    if b64_val:
        (_ci_dir / "service_account.json").write_bytes(base64.b64decode(b64_val))
    else:
        print("❌ SERVICE_ACCOUNT_B64 없음")
        sys.exit(1)
    CREDENTIALS_PATH = str(_ci_dir / "service_account.json")
    SPREADSHEET_ID   = os.environ.get("GOOGLE_SHEETS_ID", SPREADSHEET_ID)
else:
    CREDENTIALS_PATH = str(_AUTO_ROOT / "credentials" / "service_account.json")


# ── 헬퍼 ───────────────────────────────────────────────────────────────────────

_KST = timezone(timedelta(hours=9))

def _now_kst() -> datetime:
    """KST timezone-aware datetime 반환 (+09:00 offset 유지)."""
    return datetime.now(_KST)


def _sheets_client():
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
    return gspread.authorize(creds)


def _load_state() -> dict:
    """state 파일 로드. {video_id: {last_csv_at, csv_synced}}"""
    if _STATE_FILE.exists():
        try:
            return json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_state(state: dict) -> None:
    _RUNTIME_DIR.mkdir(exist_ok=True)
    _STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _calc_status(elapsed_h: float, csv_synced: bool) -> str:
    """
    상태 머신:
      COLLECTING  업로드 후 6시간 이내
      READY       CSV 수집 완료 (elapsed 무관)
      STALE       업로드 후 24시간 초과
    """
    if csv_synced:
        return "READY"
    if elapsed_h <= 6:
        return "COLLECTING"
    if elapsed_h > 24:
        return "STALE"
    return "COLLECTING"


# ── _Active_Uploads 시트 읽기 (append-only → 최신 행 필터) ────────────────────

def read_active_uploads_sheet(gc) -> list[dict]:
    """
    append-only 시트에서 video_id별 최신 fetched_at 행만 반환.
    48시간 초과 영상은 제외.
    """
    try:
        ss = gc.open_by_key(SPREADSHEET_ID)
        ws = ss.worksheet("_Active_Uploads")
    except gspread.exceptions.WorksheetNotFound:
        print("  ⚠️  _Active_Uploads 시트 없음 — api_data_shuttler.py 미실행 또는 신규 업로드 없음")
        return []

    all_rows = ws.get_all_records()
    print(f"  _Active_Uploads 시트 전체 행: {len(all_rows)}")

    # video_id별 최신 fetched_at 행만 유지
    latest: dict[str, dict] = {}
    for row in all_rows:
        vid = str(row.get("video_id", "")).strip()
        if not vid:
            continue
        existing = latest.get(vid)
        if existing is None or str(row.get("fetched_at", "")) > str(existing.get("fetched_at", "")):
            latest[vid] = row

    # 48시간 초과 필터
    cutoff = (_now_kst() - timedelta(hours=48)).strftime("%Y-%m-%d")
    result = []
    for row in latest.values():
        upload_raw = str(row.get("upload_date", ""))[:10]
        if upload_raw >= cutoff:
            result.append(row)

    print(f"  최신 스냅샷 (48h 이내): {len(result)}행")
    return result


# ── CTR 데이터 취득 ────────────────────────────────────────────────────────────

def writeback_ctr_to_master(gc, ctr_map: dict[str, dict]) -> bool:
    """
    CSV에서 확보한 CTR/impressions를 _RawData_Master 시트에 write-back.
    - ctr_source == "csv" 이고 CTR이 실제 값인 행만 대상
    - 셀 단위 업데이트 (DATA_RULES: bulk setValues 금지)
    - impressions/ctr 컬럼이 이미 채워진 경우 덮어쓰지 않음 (기존 데이터 보호)
    반환: 실제 셀 변경이 발생했으면 True (dirty flag)
    """
    targets = {
        vid: d for vid, d in ctr_map.items()
        if d.get("ctr_source") == "csv" and d.get("ctr") is not None
    }
    if not targets:
        return False

    try:
        ss = gc.open_by_key(SPREADSHEET_ID)
        ws = ss.worksheet("_RawData_Master")
    except Exception as e:
        print(f"  ⚠️  _RawData_Master 열기 실패: {e}")
        return False

    try:
        all_values = ws.get_all_values()
    except Exception as e:
        print(f"  ⚠️  _RawData_Master 읽기 실패: {e}")
        return False

    if not all_values:
        return False

    header = [h.strip() for h in all_values[0]]

    try:
        vid_col = header.index("video_id")
        imp_col = header.index("impressions")
        ctr_col = header.index("ctr")
    except ValueError as e:
        print(f"  ⚠️  _RawData_Master 필수 컬럼 없음: {e}")
        return False

    # 선택 컬럼 (없어도 실패 안 함)
    src_col = header.index("ctr_source")      if "ctr_source"      in header else -1
    upd_col = header.index("ctr_updated_at")  if "ctr_updated_at"  in header else -1

    if src_col == -1:
        print("  ℹ️  ctr_source 컬럼 없음 — 출처 기록 스킵 (_RawData_Master에 컬럼 추가 권장)")
    if upd_col == -1:
        print("  ℹ️  ctr_updated_at 컬럼 없음 — 타임스탬프 기록 스킵")

    now_str = _now_kst().strftime("%Y-%m-%dT%H:%M:%S+09:00")
    dirty = False

    for row_idx, row in enumerate(all_values[1:], start=2):
        vid = row[vid_col].strip() if vid_col < len(row) else ""
        if vid not in targets:
            continue

        d = targets[vid]
        cur_imp = row[imp_col].strip() if imp_col < len(row) else ""
        cur_ctr = row[ctr_col].strip() if ctr_col < len(row) else ""

        imp_updated = ctr_updated = False

        # impressions: 비어있거나 0이면 갱신
        if not cur_imp or cur_imp in ("0", "0.0"):
            try:
                ws.update_cell(row_idx, imp_col + 1, d["impressions"] or 0)
                imp_updated = True
            except Exception as e:
                print(f"  ⚠️  impressions write 실패 ({vid}): {e}")

        # ctr: 비어있거나 0이면 갱신
        if not cur_ctr or cur_ctr in ("0", "0.0"):
            try:
                ws.update_cell(row_idx, ctr_col + 1, round(d["ctr"], 6))
                ctr_updated = True
            except Exception as e:
                print(f"  ⚠️  ctr write 실패 ({vid}): {e}")

        # 출처 + 타임스탬프 (변경 여부 무관하게, 컬럼 있으면 항상 기록)
        if src_col != -1:
            try:
                ws.update_cell(row_idx, src_col + 1, "csv_recent")
            except Exception as e:
                print(f"  ⚠️  ctr_source write 실패 ({vid}): {e}")

        if upd_col != -1:
            try:
                ws.update_cell(row_idx, upd_col + 1, now_str)
            except Exception as e:
                print(f"  ⚠️  ctr_updated_at write 실패 ({vid}): {e}")

        if imp_updated or ctr_updated:
            dirty = True
            print(
                f"  ✅ write-back: {vid}"
                + (f" | impressions={d['impressions']}" if imp_updated else "")
                + (f" | ctr={d['ctr']*100:.2f}%" if ctr_updated else "")
                + f" | source=csv_recent | at={now_str}"
            )
        else:
            print(f"  ℹ️  {vid}: impressions/ctr 이미 채워짐 — source/timestamp만 갱신")

    return dirty


def run_video_diagnostics_engine() -> None:
    """write-back으로 데이터가 갱신된 경우에만 diagnostics 엔진 재실행."""
    engine_path = _AUTO_ROOT / "analytics" / "video_diagnostics_engine.py"
    if not engine_path.exists():
        print(f"  ⚠️  diagnostics 엔진 없음: {engine_path}")
        return
    print("  video_diagnostics_engine.py 실행 중...")
    try:
        res = subprocess.run(
            [sys.executable, str(engine_path)],
            timeout=120, capture_output=True, text=True,
        )
        if res.returncode == 0:
            print("  ✅ diagnostics 갱신 완료")
        else:
            print(f"  ❌ diagnostics 실패 (exit {res.returncode}): {res.stderr[:200]}")
    except subprocess.TimeoutExpired:
        print("  ❌ diagnostics 타임아웃 (120초)")
    except Exception as e:
        print(f"  ❌ diagnostics 오류: {e}")


def fetch_ctr_from_master(gc, video_ids: list[str]) -> dict[str, dict]:
    """_RawData_Master에서 impressions / ctr 취득. source = 'sheets'."""
    result = {vid: {"impressions": None, "ctr": None, "ctr_source": "missing"} for vid in video_ids}
    try:
        ss       = gc.open_by_key(SPREADSHEET_ID)
        ws       = ss.worksheet("_RawData_Master")
        all_rows = ws.get_all_records()
        for row in all_rows:
            vid = str(row.get("video_id", "")).strip()
            if vid not in result:
                continue
            imp_raw = row.get("impressions", None)
            ctr_raw = row.get("ctr", None)
            try:
                imp = int(imp_raw or 0)
            except (ValueError, TypeError):
                imp = 0
            try:
                ctr = float(ctr_raw) if ctr_raw not in (None, "", "None") else None
            except (ValueError, TypeError):
                ctr = None

            if imp > 0 or (ctr is not None and ctr > 0):
                result[vid] = {"impressions": imp, "ctr": ctr, "ctr_source": "sheets"}
            # imp==0, ctr==0/None → source 유지 "missing"
    except Exception as e:
        print(f"  ⚠️  _RawData_Master CTR 읽기 실패: {e}")
    return result


def read_recent_csv_ctr(video_ids: list[str]) -> dict[str, dict]:
    """studio_reach_report_recent.csv에서 impressions / ctr 추출. source = 'csv'."""
    result = {vid: {"impressions": None, "ctr": None, "ctr_source": "missing"} for vid in video_ids}
    if not _RECENT_CSV.exists():
        return result

    import csv
    try:
        with open(_RECENT_CSV, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                normalized = {k.strip().lower(): v for k, v in row.items()}
                # 한국어 CSV: "콘텐츠" 컬럼이 video_id
                vid = (
                    normalized.get("video id", "")
                    or normalized.get("콘텐츠", "")
                ).strip()
                if vid not in result:
                    continue

                imp_raw = normalized.get("impressions", "") or normalized.get("노출수", "")
                ctr_raw = (
                    normalized.get("impressions ctr", "")
                    or normalized.get("노출 클릭률 (%)", "")
                    or normalized.get("노출 클릭률", "")
                    or normalized.get("ctr", "")
                )

                try:
                    imp = int(str(imp_raw).replace(",", "") or 0)
                except (ValueError, TypeError):
                    imp = 0

                ctr = None
                try:
                    ctr_str = str(ctr_raw).replace("%", "").strip()
                    if ctr_str:
                        ctr_val = float(ctr_str)
                        if ctr_val > 1:          # "8.1" 형태 → 0.081
                            ctr_val /= 100
                        ctr = round(ctr_val, 6)
                except (ValueError, TypeError):
                    pass

                if imp > 0 or (ctr is not None and ctr > 0):
                    result[vid] = {"impressions": imp, "ctr": ctr, "ctr_source": "csv"}

        print(f"  recent CSV 파싱 완료: {_RECENT_CSV.name}")
    except Exception as e:
        print(f"  ⚠️  recent CSV 읽기 실패: {e}")
    return result


# ── CSV 다운로드 ───────────────────────────────────────────────────────────────

def run_csv_download() -> bool:
    """CDP 포트 확인 후 sync_studio_csv.sh --mode=recent 실행."""
    if not _SYNC_SCRIPT.exists():
        print(f"  ❌ sync_studio_csv.sh 없음")
        return False

    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        if s.connect_ex(("localhost", 9222)) != 0:
            print("  ⚠️  CDP 포트 9222 닫혀있음 — CSV 스킵 (Chrome 미실행)")
            return False

    print("  sync_studio_csv.sh --mode=recent 실행 중...")
    try:
        res = subprocess.run(
            ["bash", str(_SYNC_SCRIPT), "--mode=recent"],
            timeout=120, capture_output=True, text=True,
        )
        if res.returncode == 0:
            print("  ✅ recent CSV 다운로드 완료")
            return True
        print(f"  ❌ CSV 실패 (exit {res.returncode}): {res.stderr[:150]}")
        return False
    except subprocess.TimeoutExpired:
        print("  ❌ CSV 타임아웃 (120초)")
        return False
    except Exception as e:
        print(f"  ❌ CSV 오류: {e}")
        return False


# ── 출력 빌드 ──────────────────────────────────────────────────────────────────

def build_output(rows: list[dict], ctr_map: dict[str, dict], state: dict) -> list[dict]:
    now    = _now_kst()
    output = []

    for row in rows:
        vid = str(row.get("video_id", "")).strip()
        if not vid:
            continue

        # elapsed_hours
        upload_raw = str(row.get("upload_date", "")).strip()
        try:
            if "T" in upload_raw:
                upload_dt = datetime.fromisoformat(upload_raw)
                if upload_dt.tzinfo is None:
                    upload_dt = upload_dt.replace(tzinfo=timezone(timedelta(hours=9)))
            else:
                upload_dt = datetime.strptime(upload_raw, "%Y-%m-%d").replace(
                    tzinfo=timezone(timedelta(hours=9))
                )
            elapsed = round((now - upload_dt).total_seconds() / 3600, 1)
        except (ValueError, TypeError):
            elapsed = 0.0

        # CTR (null 보존)
        ctr_data   = ctr_map.get(vid, {"impressions": None, "ctr": None, "ctr_source": "missing"})
        csv_synced = state.get(vid, {}).get("csv_synced", False)
        status     = _calc_status(elapsed, csv_synced)

        output.append({
            "video_id":     vid,
            "title":        str(row.get("title", vid)).strip(),
            "upload_date":  upload_raw,
            "elapsed_hours": elapsed,
            "views":        int(row.get("views", 0) or 0),
            "ctr":          ctr_data["ctr"],          # null = 데이터 없음, 0.0 = 실제 0%
            "ctr_source":   ctr_data["ctr_source"],   # "missing" | "csv" | "sheets"
            "likes":        int(row.get("likes", 0) or 0),
            "impressions":  ctr_data["impressions"],  # null = 데이터 없음
            "status":       status,                   # "COLLECTING" | "READY" | "STALE"
            "fetched_at":   now.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
        })

    output.sort(key=lambda x: x["elapsed_hours"])
    return output


# ── 메인 ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SOUNDSTORM Active Upload Monitor v2.0")
    parser.add_argument("--no-csv", action="store_true", help="CSV 다운로드 스킵 (테스트)")
    args = parser.parse_args()

    print("=" * 60)
    print(f"Active Upload Monitor v2.0  [{_now_kst().strftime('%Y-%m-%d %H:%M:%S')} KST]")
    print("=" * 60)

    _RUNTIME_DIR.mkdir(exist_ok=True)

    # ── 1. Sheets 연결 & 최신 행 읽기 ────────────────────────────────────────
    print("\n[1/4] Google Sheets 연결...")
    gc   = _sheets_client()
    rows = read_active_uploads_sheet(gc)

    if not rows:
        print("\n✅ 신규 업로드 없음 — active_uploads.json 초기화")
        _OUTPUT_FILE.write_text("[]", encoding="utf-8")
        return

    video_ids = [str(r.get("video_id", "")).strip() for r in rows if r.get("video_id")]
    print(f"  대상 영상: {video_ids}")

    # ── 2. 중복 처리 방지: 쿨다운 확인 ───────────────────────────────────────
    print("\n[2/4] CSV 다운로드 판단...")
    state     = _load_state()
    now       = _now_kst()
    needs_csv = []

    for vid in video_ids:
        vid_state    = state.get(vid, {})
        last_csv_str = vid_state.get("last_csv_at", "")
        csv_synced   = vid_state.get("csv_synced", False)

        # CTR null이면 쿨다운 무시하고 강제 다운로드
        if not csv_synced:
            print(f"  {vid}: CTR 미수집 — 쿨다운 무시, 강제 CSV 다운로드")
            needs_csv.append(vid)
            continue

        if last_csv_str:
            try:
                last_dt   = datetime.fromisoformat(last_csv_str)
                hours_ago = (now - last_dt).total_seconds() / 3600
                if hours_ago < CSV_COOLDOWN_H:
                    print(f"  {vid}: CSV 쿨다운 중 ({hours_ago:.1f}h < {CSV_COOLDOWN_H}h) — 스킵")
                    continue
            except (ValueError, TypeError):
                pass

        needs_csv.append(vid)

    # ── 3. CSV 다운로드 (필요한 영상이 있을 때만) ─────────────────────────────
    csv_ok = False
    if needs_csv and not args.no_csv:
        print(f"  CSV 대상: {needs_csv}")
        csv_ok = run_csv_download()
        if csv_ok:
            now_str = now.strftime("%Y-%m-%dT%H:%M:%S+09:00")
            for vid in needs_csv:
                if vid not in state:
                    state[vid] = {}
                state[vid]["last_csv_at"] = now_str
                # csv_synced는 CTR 파싱 성공 후 확정
    elif args.no_csv:
        print("  --no-csv 플래그 — 다운로드 스킵")
    else:
        print("  모든 영상 쿨다운 중 — CSV 스킵")

    # ── 4. CTR 취득 ───────────────────────────────────────────────────────────
    print("\n[3/4] CTR 데이터 취득...")
    if _RECENT_CSV.exists():
        ctr_map = read_recent_csv_ctr(video_ids)
    else:
        print("  recent CSV 없음 — _RawData_Master 폴백")
        ctr_map = fetch_ctr_from_master(gc, video_ids)

    # ── CSV CTR → _RawData_Master write-back ──────────────────────────────────
    print("\n  [write-back] CSV CTR → _RawData_Master...")
    dirty = writeback_ctr_to_master(gc, ctr_map)

    # csv_synced 확정: CSV 경로로 CTR 취득 성공한 경우
    for vid, d in ctr_map.items():
        ctr_disp = f"{d['ctr']*100:.1f}%" if d['ctr'] is not None else "null"
        print(f"  {vid}: impressions={d['impressions']}, ctr={ctr_disp}, source={d['ctr_source']}")
        if d["ctr_source"] == "csv" and d["ctr"] is not None:
            if vid not in state:
                state[vid] = {}
            state[vid]["csv_synced"] = True

    _save_state(state)

    # ── 5. active_uploads.json 생성 ───────────────────────────────────────────
    print("\n[4/4] active_uploads.json 생성...")
    output = build_output(rows, ctr_map, state)
    _OUTPUT_FILE.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  ✅ 저장 완료: {_OUTPUT_FILE}  ({len(output)}개 영상)")
    for item in output:
        ctr_disp = f"{item['ctr']*100:.1f}%" if item["ctr"] is not None else "null (미수집)"
        print(
            f"     [{item['status']}] {item['video_id']}"
            f" | +{item['elapsed_hours']}h"
            f" | views={item['views']}"
            f" | CTR={ctr_disp} ({item['ctr_source']})"
            f" | likes={item['likes']}"
        )

    # ── dirty flag → diagnostics 조건부 재실행 ────────────────────────────────
    # write-back으로 실제 셀 변경이 있었을 때만 실행 (불필요 연산 방지)
    if dirty:
        print("\n[post] impressions/CTR 갱신 감지 → diagnostics 재실행...")
        run_video_diagnostics_engine()
    else:
        print("\n[post] 데이터 변경 없음 — diagnostics 스킵")

    print("\n" + "=" * 60)
    print("Active Upload Monitor v2.0 완료")
    print("=" * 60)


if __name__ == "__main__":
    main()
