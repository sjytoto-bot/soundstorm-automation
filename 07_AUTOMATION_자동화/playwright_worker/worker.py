import asyncio
import logging
import os
import sys
import traceback

import requests
from flask import Flask, jsonify, request

from config import WorkerConfig

SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts_스크립트"))
if SCRIPTS_DIR not in sys.path:
    sys.path.append(SCRIPTS_DIR)

from recent_video_pipeline import make_metric_result, normalize_metric_result  # noqa: E402

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# 엔드포인트
# ------------------------------------------------------------------
@app.route('/run', methods=['GET', 'POST'])
def run_worker():
    """Cloud Scheduler가 주기적으로 호출하는 메인 엔드포인트."""
    if not WorkerConfig.NAVER_ID or not WorkerConfig.NAVER_PW:
        return jsonify({"status": "error", "message": "NAVER_ID / NAVER_PW 환경변수가 설정되지 않았습니다."}), 500

    try:
        from scraper import NaverSellerScraper
        import gcs_store

        scraper = NaverSellerScraper(
            naver_id=WorkerConfig.NAVER_ID,
            naver_pw=WorkerConfig.NAVER_PW,
            session_path=WorkerConfig.SESSION_PATH,
        )
        orders = asyncio.run(scraper.scrape_new_orders())
        logger.info(f"스크래핑 완료: {len(orders)}개 주문")

        processed = gcs_store.load_processed()
        results = []
        new_count = 0

        for order in orders:
            order_num = order["order_number"]
            if order_num in processed:
                logger.info(f"이미 처리된 주문 건너뜀 (GCS): {order_num}")
                continue

            logger.info(f"라이선스 발급 요청: {order_num} / 트랙: {order['track_id']}")
            try:
                resp = requests.post(
                    f"{WorkerConfig.LICENSE_ENGINE_URL}/issue-license",
                    json=order,
                    timeout=90,
                )
                result = resp.json()
                results.append({"order": order_num, "result": result})

                # success, partial, skip, duplicate 모두 "처리 완료"로 간주해 재시도 방지
                if result.get("status") in ("success", "partial", "skip", "duplicate"):
                    processed.add(order_num)
                    new_count += 1
                else:
                    logger.warning(f"주문 {order_num} 발급 실패: {result}")

            except Exception as e:
                logger.error(f"주문 {order_num} 발급 요청 오류: {e}")
                results.append({"order": order_num, "error": str(e)})

        gcs_store.save_processed(processed)

        return jsonify({
            "status": "success",
            "scraped": len(orders),
            "processed": new_count,
            "details": results,
        })

    except Exception as e:
        logger.error(f"Worker 실행 오류: {e}\n{traceback.format_exc()}")
        return jsonify({"status": "error", "message": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/seed-session', methods=['POST'])
def seed_session():
    """로컬에서 생성한 Playwright 세션을 GCS에 업로드합니다.
    Body: application/json (Playwright storage_state JSON)
    """
    try:
        import gcs_store

        data = request.get_data()
        if not data:
            return jsonify({"status": "error", "message": "Request body가 비어있습니다."}), 400

        # JSON 유효성 검사
        import json
        json.loads(data)

        tmp_path = "/tmp/seed_session.json"
        with open(tmp_path, "wb") as f:
            f.write(data)

        gcs_store.save_session(tmp_path)

        # 로컬 세션 경로에도 복사
        from config import WorkerConfig
        import shutil
        shutil.copy(tmp_path, WorkerConfig.SESSION_PATH)

        return jsonify({"status": "success", "message": "세션이 GCS에 저장되었습니다.", "size": len(data)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/seed-youtube-session', methods=['POST'])
def seed_youtube_session():
    try:
        import gcs_store

        data = request.get_data()
        if not data:
            return jsonify({"status": "error", "message": "Request body가 비어있습니다."}), 400

        import json
        json.loads(data)

        tmp_path = "/tmp/seed_youtube_session.json"
        with open(tmp_path, "wb") as f:
            f.write(data)

        gcs_store.save_youtube_session(tmp_path)

        import shutil
        shutil.copy(tmp_path, WorkerConfig.YOUTUBE_STUDIO_SESSION_PATH)

        return jsonify({"status": "success", "message": "YouTube Studio 세션이 저장되었습니다.", "size": len(data)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/', methods=['GET'])
def health():
    return "Playwright Worker is running."


@app.route('/recent-video-stats', methods=['POST'])
def recent_video_stats():
    payload = request.get_json(silent=True) or {}
    video_id = str(payload.get("video_id") or "").strip()
    mode = str(payload.get("mode") or "since_publish").strip()
    published_at = payload.get("published_at") or payload.get("published_at_hint")
    timeout_sec = int(payload.get("timeout_sec") or 90)

    if len(video_id) != 11:
        return jsonify(
            make_metric_result(
                status="video_not_found",
                video_id=video_id,
                source="worker",
                metric_window=mode,
                video_published_at=published_at,
                observed_in_studio=False,
                reason="video_id is missing or invalid",
            )
        ), 400

    session_path = WorkerConfig.YOUTUBE_STUDIO_SESSION_PATH
    if not os.path.exists(session_path):
        try:
            import gcs_store
            gcs_store.load_youtube_session(session_path)
        except Exception:
            pass

    if not os.path.exists(session_path):
        return jsonify(
            make_metric_result(
                status="auth_expired",
                video_id=video_id,
                source="worker",
                metric_window=mode,
                video_published_at=published_at,
                observed_in_studio=False,
                reason="YouTube Studio session not seeded in worker",
            )
        ), 200

    try:
        from youtube_studio_collector import collect_recent_video_stats

        result = normalize_metric_result(
            asyncio.run(
                collect_recent_video_stats(
                    video_id=video_id,
                    mode=mode,
                    published_at=published_at,
                    session_path=session_path,
                    timeout_sec=timeout_sec,
                )
            ),
            default_video_id=video_id,
            default_source="worker",
        )
    except Exception as e:
        logger.error(f"recent_video_stats 오류: {e}\n{traceback.format_exc()}")
        result = make_metric_result(
            status="partial",
            video_id=video_id,
            source="worker",
            metric_window=mode,
            video_published_at=published_at,
            observed_in_studio=False,
            reason=f"worker recent-video collector failed: {e}",
        )
    return jsonify(result), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port)
