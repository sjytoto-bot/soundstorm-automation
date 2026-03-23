import requests
import time
import hmac
import hashlib
import base64

# 후보 1: I (대문자 아이)
# 후보 2: l (소문자 엘)
id_variations = [
    "3muK1bGIJ6CYByRh4BitWI",
    "3muK1bGlJ6CYByRh4BitWI"
]

client_secret = "$2a$04$Cr63v/XRI2lHJ.hlfyuQzO"

def test_variations():
    msg_formats = [
        lambda ts, cid: ts + cid,
        lambda ts, cid: ts + "_" + cid
    ]
    
    url = "https://api.commerce.naver.com/external/v1/oauth2/token"

    for cid in id_variations:
        for fmt in msg_formats:
            timestamp = str(int(time.time() * 1000))
            message = fmt(timestamp, cid)
            
            signature = base64.b64encode(
                hmac.new(
                    client_secret.encode("utf-8"),
                    message.encode("utf-8"),
                    hashlib.sha256
                ).digest()
            ).decode("utf-8")
            
            headers = {
                "Authorization": f"HMAC-SHA256 client_id={cid},timestamp={timestamp},signature={signature}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            data = {"grant_type": "client_credentials", "type": "SELF"}
            
            print(f"Testing ID: {cid} | Msg: {message[:25]}...")
            
            try:
                response = requests.post(url, headers=headers, data=data, timeout=5)
                print(f"  Status: {response.status_code}")
                print(f"  Body:   {response.text[:100]}")
                if response.status_code == 200:
                    print("\n🎉 SUCCESS! This is the correct combination.")
                    return
            except Exception as e:
                print(f"  Error: {e}")

if __name__ == "__main__":
    test_variations()
