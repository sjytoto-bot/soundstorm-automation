import os
import logging
from flask import Flask, jsonify
from license_engine.core.gmail_listener import GmailListener
from license_engine.core.issue_license import issue_license_process
from license_engine.config import Config

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/trigger', methods=['GET', 'POST'])
def trigger_license_engine():
    """Cloud Scheduler가 주기적으로 호출할 엔드포인트"""
    try:
        listener = GmailListener(Config.BASE_DIR)
        if not listener.service:
            return jsonify({"status": "error", "message": "Gmail API 초기화 실패"}), 500

        orders = listener.fetch_unread_orders()
        
        if not orders:
            return jsonify({"status": "success", "message": "새로운 주문이 없습니다.", "processed": 0})
            
        results = []
        for order in orders:
            logging.info(f"주문 처리 시작: {order['order_number']} / 트랙: {order['track_id']}")
            try:
                # v2.0 프로세스 호출
                res = issue_license_process(
                    order_number=order['order_number'],
                    message_id=order['message_id'],
                    buyer_name=order['buyer_name'],
                    buyer_email=order['buyer_email'],
                    track_id=order['track_id'],
                    track_title=order['track_title'],
                    license_type=order['license_type']
                )
                results.append({"order": order['order_number'], "result": res})
            except Exception as e:
                logging.error(f"주문 {order['order_number']} 처리 중 오류: {e}")
                results.append({"order": order['order_number'], "error": str(e)})
                
        return jsonify({"status": "success", "processed": len(orders), "details": results})
        
    except Exception as e:
        logging.error(f"Trigger 실행 실패: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/rebuild-index', methods=['GET', 'POST'])
def rebuild_index():
    """Drive MASTER_AUDIO 폴더를 스캔하여 tracks.json을 재생성하고 GCS에 업로드합니다."""
    try:
        from license_engine.scripts.build_tracks_index import scan_drive_files, build_index, upload_to_gcs
        
        logging.info("[Index Rebuild] 📂 Drive MASTER_AUDIO 폴더 스캔 중...")
        files = scan_drive_files()
        
        logging.info(f"[Index Rebuild] → 파일 {len(files)}개 발견")
        index = build_index(files)
        
        logging.info(f"[Index Rebuild] → YouTube ID 매핑 {len(index)}개 생성")
        upload_to_gcs(index)
        
        # 로컬(Cloud Run 인스턴스 내부) data/tracks.json도 임시 갱신
        import json
        local_path = os.path.join(Config.BASE_DIR, 'data', 'tracks.json')
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            "status": "success", 
            "message": "인덱스 재생성 및 업로드가 완료되었습니다.",
            "total_tracks": len(index)
        })
    except Exception as e:
        logging.error(f"[Index Rebuild] 실패: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "License Engine v2.0 is running."

if __name__ == '__main__':
    # Cloud Run은 PORT 환경변수를 통해 포트를 주입합니다. (기본 8080)
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
