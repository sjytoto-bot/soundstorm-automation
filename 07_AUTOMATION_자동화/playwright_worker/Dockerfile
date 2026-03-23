FROM python:3.11-slim

WORKDIR /app

# Playwright Chromium 의존성 + Xvfb (headless=False 지원)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium 브라우저 설치
RUN playwright install chromium

COPY . .

ENV PORT=8081
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

# Xvfb 가상 디스플레이 시작 후 Flask 서버 실행
CMD Xvfb :99 -screen 0 1280x900x24 -ac -noreset & \
    sleep 2 && \
    python worker.py
