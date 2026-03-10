import boto3
from botocore.config import Config as BotoConfig
from license_engine.config import Config

class R2Manager:
    def __init__(self):
        self.endpoint = Config.R2_ENDPOINT
        self.bucket = Config.R2_BUCKET
        self.access_key = Config.R2_ACCESS_KEY
        self.secret_key = Config.R2_SECRET_KEY
        self.client = self._get_client()

    def _get_client(self):
        # 환경변수 누락 시(아직 주입 안 된 상태) none 반환
        if not self.endpoint or not self.access_key or not self.secret_key:
            return None

        return boto3.client(
            's3',
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=BotoConfig(signature_version='s3v4'),
            region_name='auto'  # R2는 auto 리전 사용
        )

    def upload_file(self, file_path: str, object_name: str) -> bool:
        """로컬 파일을 R2 버킷에 업로드합니다."""
        if not self.client:
            # 초기화 지연 대응
            self.client = self._get_client()
        if not self.client:
            raise ValueError("R2_ERR001: R2 클라이언트 초기화 실패. 자격 증명 환경변수를 확인하세요.")
            
        try:
            self.client.upload_file(file_path, self.bucket, object_name)
            return True
        except Exception as e:
            raise Exception(f"R2_ERR002: R2 업로드 실패 - {str(e)}")

    def generate_presigned_url(self, object_name: str, expiry: int = 86400) -> str:
        """R2에 저장된 객체의 기간 한정 다운로드 URL(Presigned URL)을 생성합니다. 기본 24시간"""
        if not self.client:
            self.client = self._get_client()
        if not self.client:
            raise ValueError("R2_ERR001: R2 클라이언트 초기화 실패.")
            
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': object_name},
                ExpiresIn=expiry
            )
            return url
        except Exception as e:
            raise Exception(f"R2_ERR003: Presigned URL 생성 실패 - {str(e)}")

r2_manager = R2Manager()
