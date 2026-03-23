"""GCS 기반 처리 완료 주문 번호 영속 스토리지.

Cloud Run 재시작 시 /tmp가 초기화되는 문제를 해결하기 위해
soundstorm-config 버킷의 processed_orders.json 을 사용합니다.
"""
import json
import logging
from typing import Set

from google.cloud import storage
from google.api_core.exceptions import NotFound

logger = logging.getLogger(__name__)

_BUCKET_NAME = "soundstorm-config"
_OBJECT_NAME = "processed_orders.json"
_SESSION_OBJECT = "naver_session.json"


def load_processed() -> Set[str]:
    """GCS에서 처리 완료 주문 번호 목록을 내려받습니다.
    파일이 없으면 빈 set을 반환합니다."""
    try:
        client = storage.Client()
        bucket = client.bucket(_BUCKET_NAME)
        blob = bucket.blob(_OBJECT_NAME)
        data = json.loads(blob.download_as_text(encoding="utf-8"))
        result = set(data)
        logger.info(f"[GCS] processed_orders 로드 완료: {len(result)}건")
        return result
    except NotFound:
        logger.info("[GCS] processed_orders.json 없음 — 빈 목록으로 시작")
        return set()
    except Exception as e:
        logger.error(f"[GCS] processed_orders 로드 실패: {e}")
        return set()


def save_processed(processed: Set[str]) -> None:
    """처리 완료 주문 번호 목록을 GCS에 업로드합니다."""
    try:
        client = storage.Client()
        bucket = client.bucket(_BUCKET_NAME)
        blob = bucket.blob(_OBJECT_NAME)
        blob.upload_from_string(
            json.dumps(sorted(processed), ensure_ascii=False),
            content_type="application/json",
        )
        logger.info(f"[GCS] processed_orders 저장 완료: {len(processed)}건")
    except Exception as e:
        logger.error(f"[GCS] processed_orders 저장 실패: {e}")
        raise


def load_session(local_path: str) -> bool:
    """GCS에서 Playwright 세션 파일을 /tmp로 내려받습니다.
    성공 시 True, 파일이 없으면 False 반환.

    주의: download_to_filename()은 NotFound 전에 빈 파일을 생성하므로
    실패 시 반드시 파일을 삭제해야 합니다.
    """
    import os as _os
    try:
        client = storage.Client()
        bucket = client.bucket(_BUCKET_NAME)
        blob = bucket.blob(_SESSION_OBJECT)
        blob.download_to_filename(local_path)
        # 빈 파일 방어 체크
        if not _os.path.exists(local_path) or _os.path.getsize(local_path) == 0:
            logger.warning("[GCS] 세션 파일이 비어있음 — 무효 처리")
            _os.remove(local_path)
            return False
        logger.info(f"[GCS] 세션 파일 로드 완료: {local_path}")
        return True
    except NotFound:
        # download_to_filename이 생성한 빈 파일 정리
        if _os.path.exists(local_path):
            _os.remove(local_path)
        logger.info("[GCS] 세션 파일 없음 — 신규 로그인 필요")
        return False
    except Exception as e:
        if _os.path.exists(local_path):
            _os.remove(local_path)
        logger.warning(f"[GCS] 세션 로드 실패: {e}")
        return False


def save_session(local_path: str) -> None:
    """로컬 Playwright 세션 파일을 GCS에 업로드합니다."""
    try:
        client = storage.Client()
        bucket = client.bucket(_BUCKET_NAME)
        blob = bucket.blob(_SESSION_OBJECT)
        blob.upload_from_filename(local_path)
        logger.info(f"[GCS] 세션 파일 저장 완료")
    except Exception as e:
        logger.warning(f"[GCS] 세션 저장 실패: {e}")


def upload_screenshot(local_path: str, name: str = "login_debug.png") -> None:
    """디버그용 스크린샷을 GCS에 업로드합니다."""
    try:
        client = storage.Client()
        bucket = client.bucket(_BUCKET_NAME)
        blob = bucket.blob(f"debug/{name}")
        blob.upload_from_filename(local_path, content_type="image/png")
        logger.info(f"[GCS] 스크린샷 업로드: debug/{name}")
    except Exception as e:
        logger.warning(f"[GCS] 스크린샷 업로드 실패: {e}")
