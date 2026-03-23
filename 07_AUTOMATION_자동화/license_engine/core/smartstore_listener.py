import requests
import time
import bcrypt
import base64
import logging
import re
from typing import List, Dict, Optional
from license_engine.config import Config

class SmartstoreListener:
    def __init__(self):
        self.client_id = Config.NAVER_CLIENT_ID
        self.client_secret = Config.NAVER_CLIENT_SECRET
        self.account_id = Config.NAVER_ACCOUNT_ID
        self.api_base_url = "https://api.commerce.naver.com/external"

    def _get_access_token(self) -> Optional[str]:
        """bcrypt + base64 방식으로 Access Token을 발급받습니다.

        서명 생성 방식:
          message = client_id + "_" + timestamp
          bcrypt_hash = bcrypt.hashpw(message, client_secret_as_salt)
          client_secret_sign = base64.b64encode(bcrypt_hash)

        요청 방식:
          POST body: client_id, timestamp, client_secret_sign, grant_type, type, account_id
        """
        if not self.client_id or not self.client_secret:
            logging.error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.")
            return None

        timestamp = str(int(time.time() * 1000))
        message = f"{self.client_id}_{timestamp}"

        try:
            hashed = bcrypt.hashpw(
                message.encode('utf-8'),
                self.client_secret.encode('utf-8')
            )
            sig = base64.b64encode(hashed).decode('utf-8')
        except Exception as e:
            logging.error(f"서명 생성 실패: {e}")
            return None

        url = f"{self.api_base_url}/v1/oauth2/token"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "client_id": self.client_id,
            "timestamp": timestamp,
            "client_secret_sign": sig,
            "grant_type": "client_credentials",
            "type": "SELF",
        }

        logging.info(f"Naver Token 요청 (bcrypt+base64, SELF): client_id={self.client_id}, timestamp={timestamp}")

        try:
            response = requests.post(url, headers=headers, data=data)
            if response.status_code != 200:
                logging.error(f"Naver Access Token 발급 실패 (Status {response.status_code}): {response.text}")
                return None
            token = response.json().get("access_token")
            logging.info("Naver Access Token 발급 성공!")
            return token
        except Exception as e:
            logging.error(f"Naver Access Token 발급 중 예외 발생: {e}")
            return None

    def fetch_new_orders(self) -> List[Dict]:
        """결제 완료된 주문 목록을 가져옵니다.

        Step 1: GET last-changed-statuses → productOrderId 목록
        Step 2: POST query → 주문 상세 정보
        """
        token = self._get_access_token()
        if not token:
            return []

        auth_header = {"Authorization": f"Bearer {token}"}

        # Step 1: 변경된 주문 ID 목록 조회 (최근 24시간, KST 기준)
        import datetime
        now_kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
        from_dt = (now_kst - datetime.timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S.000+09:00")
        to_dt = now_kst.strftime("%Y-%m-%dT%H:%M:%S.000+09:00")

        list_url = f"{self.api_base_url}/v1/pay-order/seller/product-orders/last-changed-statuses"
        try:
            list_resp = requests.get(list_url, headers=auth_header, params={
                "lastChangedFrom": from_dt,
                "lastChangedTo": to_dt,
                "lastChangedType": "PAYED",
            })
            if list_resp.status_code != 200:
                logging.error(f"주문 목록 조회 실패 (HTTP {list_resp.status_code}): {list_resp.text}")
                return []
            list_data = list_resp.json()
            logging.info(f"[주문목록 원본] {list_data}")
            statuses = list_data.get("data", {}).get("lastChangeStatuses", [])
            logging.info(f"[lastChangedStatuses] {len(statuses)}건: {statuses}")
            order_ids = [
                item.get("productOrderId")
                for item in statuses
                if item.get("productOrderId")
            ]
        except Exception as e:
            logging.error(f"주문 목록 조회 실패: {e}")
            return []

        if not order_ids:
            return []

        logging.info(f"결제 완료 주문 {len(order_ids)}건 발견: {order_ids}")

        # Step 2: 주문 상세 조회 (최대 300개)
        query_url = f"{self.api_base_url}/v1/pay-order/seller/product-orders/query"
        try:
            detail_resp = requests.post(
                query_url,
                headers={**auth_header, "Content-Type": "application/json"},
                json={"productOrderIds": order_ids, "quantityClaimCompatibility": True},
            )
            detail_resp.raise_for_status()
            detail_data = detail_resp.json()
        except Exception as e:
            logging.error(f"주문 상세 조회 실패: {e}")
            return []

        parsed_orders = []
        for item in detail_data.get("data", []):
            parsed = self._parse_order(item)
            if parsed:
                parsed_orders.append(parsed)
        return parsed_orders

    def _parse_order(self, item: Dict) -> Optional[Dict]:
        """Naver Commerce API 응답 구조에서 라이선스 발급에 필요한 정보를 추출합니다.

        item = {"order": {...}, "productOrder": {...}}
        """
        order = item.get("order", {})
        product_order = item.get("productOrder", {})

        product_order_id = product_order.get("productOrderId")
        order_id = order.get("orderId")
        buyer_name = order.get("ordererName", "")
        product_name = product_order.get("productName", "")

        # YouTube ID 탐색: shippingMemo → productOption → sellerCustomCode1/2
        search_fields = [
            product_order.get("shippingMemo", ""),
            product_order.get("productOption", ""),
            product_order.get("sellerCustomCode1", ""),
            product_order.get("sellerCustomCode2", ""),
            product_name,
        ]
        youtube_id = None
        memo_source = ""
        for field in search_fields:
            youtube_id = self._extract_youtube_id(str(field))
            if youtube_id:
                memo_source = field
                break

        if not youtube_id:
            logging.warning(f"주문 {product_order_id}에서 YouTube ID를 찾을 수 없습니다. 검색 필드: {search_fields}")
            return None

        # 이메일: API 미제공 → shippingMemo / productOption 에서 이메일 패턴 추출
        product_order_status = product_order.get("productOrderStatus", "")
        buyer_email = order.get("buyerEmail", "") or order.get("ordererEmail", "")
        if not buyer_email:
            email_sources = [
                product_order.get("shippingMemo", ""),
                product_order.get("productOption", ""),
            ]
            email_pattern = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
            for src in email_sources:
                m = email_pattern.search(str(src))
                if m:
                    buyer_email = m.group(0)
                    logging.info(f"[이메일 추출] shippingMemo/productOption에서 이메일 발견: {buyer_email}")
                    break
        logging.info(f"[주문파싱] id={product_order_id}, name={buyer_name}, email={buyer_email}, track={youtube_id}, title={product_name}")
        logging.info(f"[주문파싱] order_keys={list(order.keys())}")
        logging.info(f"[주문파싱] productOrder_keys={list(product_order.keys())}")
        logging.info(f"[주문파싱] shippingMemo={product_order.get('shippingMemo', '')}, productOption={product_order.get('productOption', '')}")

        return {
            "product_order_id": str(product_order_id),
            "order_id": str(order_id),
            "buyer_name": buyer_name,
            "buyer_email": buyer_email,
            "track_id": youtube_id,
            "track_title": product_name,
            "license_type": "permanent",
            "raw_memo": memo_source,
            "product_order_status": product_order_status,
        }

    def dispatch_order(self, product_order_id: str) -> bool:
        """라이선스 발급 완료 후 스마트스토어 발송처리를 수행합니다.

        디지털 상품이므로 deliveryMethod=ETC, trackingNumber=DIGITAL 사용.
        """
        token = self._get_access_token()
        if not token:
            logging.error(f"[발송처리] 토큰 발급 실패 — {product_order_id} 발송처리 스킵")
            return False

        import datetime
        now_kst = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%dT%H:%M:%S.000+09:00")

        url = f"{self.api_base_url}/v1/pay-order/seller/product-orders/dispatch"
        payload = {
            "dispatchProductOrders": [
                {
                    "productOrderId": product_order_id,
                    "deliveryMethod": "NOTHING",
                    "deliveryCompanyCode": "NOTHING",
                    "trackingNumber": "DIGITAL",
                    "dispatchDate": now_kst,
                }
            ]
        }

        try:
            r = requests.post(
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
            if r.status_code == 200:
                logging.info(f"[발송처리] {product_order_id} 완료")
                return True
            else:
                logging.error(f"[발송처리] {product_order_id} 실패 (HTTP {r.status_code}): {r.text}")
                return False
        except Exception as e:
            logging.error(f"[발송처리] {product_order_id} 예외: {e}")
            return False

    def _extract_youtube_id(self, text: str) -> Optional[str]:
        """텍스트에서 11자리 YouTube ID를 추출합니다."""
        if not text:
            return None
        
        patterns = [
            r"(?:v=|\/)([0-9A-Za-z_-]{11})(?:[%#?&]|$)",
            r"\b([0-9A-Za-z_-]{11})\b"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None
