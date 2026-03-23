import requests
import time
import bcrypt
import os

client_id = "3muK1bGIJ6CYByRh4BitWI"
client_secret = "$2a$04$Cr63v/XRI2lHJ.hlfyuQzO"

# 네이버 커머스 API 토큰 발급 (Bcrypt 방식)
def get_token():
    timestamp = str(int(time.time() * 1000))
    
    # password = client_id + "_" + timestamp
    password = f"{client_id}_{timestamp}"
    
    # bcrypt를 이용한 서명 생성
    # client_secret_sign = bcrypt.hashpw(password, client_secret)
    hashed = bcrypt.hashpw(password.encode('utf-8'), client_secret.encode('utf-8'))
    client_secret_sign = hashed.decode('utf-8')

    print(f"Timestamp: {timestamp}")
    print(f"Password:  {password}")
    print(f"Sign:      {client_secret_sign}")

    url = "https://api.commerce.naver.com/external/v1/oauth2/token"
    
    data = {
        "client_id": client_id,
        "timestamp": timestamp,
        "client_secret_sign": client_secret_sign,
        "grant_type": "client_credentials",
        "type": "SELF"
    }
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    response = requests.post(url, headers=headers, data=data)
    
    print("\nSTATUS:", response.status_code)
    print("BODY:", response.text)

if __name__ == "__main__":
    get_token()
