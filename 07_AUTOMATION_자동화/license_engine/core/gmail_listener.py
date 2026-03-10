import os
import base64
import re
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import logging

# 필요 권한: 메일 읽기 및 메일 상태 변경
SCOPES = ['https://mail.google.com/']

class GmailListener:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.credentials_path = os.path.join(self.base_dir, 'credentials.json')
        self.token_path = os.path.join(self.base_dir, 'token.json')
        self.service = self._authenticate()

    def _authenticate(self):
        """Gmail API 인증 및 서비스 객체 생성 (Secret Manager 또는 로컬 파일 지원)"""
        from license_engine.config import Config
        import json
        
        creds = None
        
        # 1. token 시도: 환경변수 설정값이 있으면 최우선, 없으면 로컬 파일 경로 시도
        if Config.GMAIL_TOKEN_JSON:
            try:
                token_info = json.loads(Config.GMAIL_TOKEN_JSON)
                creds = Credentials.from_authorized_user_info(token_info, SCOPES)
            except Exception as e:
                logging.error(f"GMAIL_TOKEN_JSON 환경변수 파싱 에러: {e}")
        elif os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            
        # 2. 자격 증명이 유효하지 않거나 만료된 경우 갱신 또는 신규 발급
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                    # 갱신된 토큰을 파일로 저장 (로컬 환경일 때만. Cloud Run에서는 Stateless이므로 무시)
                    if not Config.GMAIL_TOKEN_JSON:
                        with open(self.token_path, 'w') as token:
                            token.write(creds.to_json())
                except Exception as e:
                    logging.error(f"Token refresh 실패: {e}")
            else:
                # 초기 인증 (브라우저 필요)
                if Config.GMAIL_CREDENTIALS_JSON: # 배포 환경인 경우
                    # Cloud Run 환경에서는 브라우저 인증을 할 수 없으므로 미리 로컬에서 받아야 함
                    logging.error("초기 인증이 필요하나 배포 환경입니다. 로컬에서 생성한 token.json의 내용을 GMAIL_TOKEN_JSON으로 전달해주세요.")
                    return None
                else: # 로컬 환경인 경우
                    if not os.path.exists(self.credentials_path):
                        logging.warning(f"credentials.json 파일을 찾을 수 없습니다: {self.credentials_path}")
                        return None
                    flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                    with open(self.token_path, 'w') as token:
                        token.write(creds.to_json())

        try:
            service = build('gmail', 'v1', credentials=creds)
            return service
        except Exception as e:
            logging.error(f"Gmail API 빌드 실패: {e}")
            return None

    def fetch_unread_orders(self) -> list:
        """스토어에서 온 새로운 주문 메일 목록을 조회합니다."""
        if not self.service:
            logging.error("Gmail 서비스가 초기화되지 않았습니다.")
            return []

        query = "is:unread subject:(주문 OR 네이버페이 OR 스마트스토어)"
        
        try:
            results = self.service.users().messages().list(userId='me', q=query).execute()
            messages = results.get('messages', [])
            
            orders = []
            for msg in messages:
                msg_id = msg['id']
                parsed_order = self._parse_message(msg_id)
                if parsed_order:
                    orders.append(parsed_order)
                    # 처리된 메일은 즉시 읽음 처리하여 중복 발급 방지
                    self._mark_as_read(msg_id)
                    
            return orders
        except Exception as e:
            logging.error(f"메일 목록 조회 중 오류 발생: {e}")
            return []

    def _parse_message(self, message_id: str) -> dict:
        """개별 메일 본문을 파싱하여 주문 정보를 추출합니다."""
        try:
            msg = self.service.users().messages().get(userId='me', id=message_id, format='full').execute()
            
            # 페이로드에서 본문 텍스트 추출
            payload = msg.get('payload', {})
            body_text = self._get_body_text(payload)
            
            # 정규표현식을 통해 정보 추출 (실제 네이버 스토어 메일 양식에 따라 조정 필요)
            # 여기서는 임시 정규식을 적용 (추후 실제 양식 보고 튜닝 필요)
            order_num_match = re.search(r'주문번호[\s:]*([0-9A-Za-z-]+)', body_text)
            buyer_name_match = re.search(r'구매자명[\s:]*([^\n]+)', body_text)
            buyer_email_match = re.search(r'(?:구매자\s*)?이메일[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', body_text)
            
            # 상품명 파싱 로직 (상품명에 [SS014] 토벌 (討伐) 과 같이 들어있다고 가정)
            track_info_match = re.search(r'상품명[\s:]*\[([A-Za-z0-9]+)\]\s+([^\n]+)', body_text)
            
            order_number = order_num_match.group(1).strip() if order_num_match else None
            buyer_name = buyer_name_match.group(1).strip() if buyer_name_match else None
            buyer_email = buyer_email_match.group(1).strip() if buyer_email_match else None

            # YouTube ID 추출: 전체 URL / youtu.be 단축 URL / 단독 11자 ID 모두 지원
            youtube_id = None
            # 1) YouTube URL 패턴 우선 매칭
            yt_url_match = re.search(
                r'(?:youtu\.be/|youtube\.com/watch\?v=|youtube\.com/embed/)([A-Za-z0-9_-]{11})',
                body_text
            )
            if yt_url_match:
                youtube_id = yt_url_match.group(1).strip()
            else:
                # 2) YouTube: 키워드 뒤에 오는 값
                yt_keyword_match = re.search(r'[Yy]ou[Tt]ube[\s:]+([A-Za-z0-9_-]{11})', body_text)
                if yt_keyword_match:
                    youtube_id = yt_keyword_match.group(1).strip()
                else:
                    # 3) 단독 11자 ID fallback
                    yt_standalone = re.search(r'\b([A-Za-z0-9_-]{11})\b', body_text)
                    if yt_standalone:
                        youtube_id = yt_standalone.group(1).strip()

            track_title = None
            # 상품명에 곡명이 포함되어 있으면 추출 (선택사항)
            track_title_match = re.search(r'상품명[\s:]*([^\n]+)', body_text)
            track_title = track_title_match.group(1).strip() if track_title_match else "알 수 없는 타이틀"
            
            if not (order_number and buyer_name and buyer_email and youtube_id):
                logging.warning(f"메시지 {message_id} 파싱 실패: 필수 정보 누락 (order={order_number}, name={buyer_name}, email={buyer_email}, youtube_id={youtube_id})")
                logging.warning(f"  본문 앞 200자: {body_text[:200]}")
                return None
                
            logging.info(f"파싱 성공: order={order_number}, name={buyer_name}, email={buyer_email}, yt={youtube_id}, title={track_title}")
            return {
                "message_id": message_id,
                "order_number": order_number,
                "buyer_name": buyer_name,
                "buyer_email": buyer_email,
                "track_id": youtube_id,
                "track_title": track_title,
                "license_type": "permanent"
            }
        except Exception as e:
            logging.error(f"메시지 {message_id} 파싱 중 오류: {e}")
            return None

    def _mark_as_read(self, message_id: str):
        """처리 완료된 메일의 UNREAD 라벨을 제거합니다."""
        try:
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            logging.info(f"메시지 {message_id} 읽음 처리 완료.")
        except Exception as e:
            logging.warning(f"메시지 {message_id} 읽음 처리 실패: {e}")

    def _get_body_text(self, payload: dict) -> str:
        """구글 API Message payload 구조에서 순수 텍스트를 재귀적으로 추출합니다."""
        body = ""
        if 'parts' in payload:
            for part in payload['parts']:
                body += self._get_body_text(part)
        elif payload.get('mimeType') == 'text/plain':
            data = payload['body'].get('data')
            if data:
                body += base64.urlsafe_b64decode(data).decode('utf-8')
        elif payload.get('mimeType') == 'text/html':
            pass # html은 건너뛰거나, 필요시 bs4 등으로 파싱
            
        return body

# 사용 시: listener = GmailListener(Config.BASE_DIR)
