import asyncio
import logging
import os
import traceback

import requests
from flask import Flask, jsonify, request

from config import WorkerConfig
from scraper import NaverSellerScraper
import gcs_store

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


@app.route('/', methods=['GET'])
def health():
    return "Playwright Worker is running."


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    app.run(host='0.0.0.0', port=port)
