FROM python:3.11-slim

# WeasyPrint 렌더링에 필요한 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 앱 작업 디렉토리 설정
WORKDIR /app

# Requirements 복사 및 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . ./license_engine

# Cloud Run에서 사용할 포트 설정
ENV PORT=8080
EXPOSE 8080

# PYTHONPATH 설정 (license_engine 모듈 인식 위함)
ENV PYTHONPATH=/app

# Gunicorn 대신 개발용 Flask 서버 직접 구동 (동시성 1 설정은 클라우드 런 콘솔에서 제어)
CMD ["python", "license_engine/main_web.py"]
