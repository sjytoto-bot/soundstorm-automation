import requests
import time
import hmac
import hashlib
import base64

client_id = "3muK1bGlJ6CYByRh4BitWI"
client_secret = "$2a$04$Cr63v/XRl2lHJ.hIfyuQzO"

timestamp = str(int(time.time() * 1000))

message = timestamp + client_id

signature = base64.b64encode(
    hmac.new(
        client_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).digest()
).decode("utf-8")

headers = {
    "Authorization": f"HMAC-SHA256 client_id={client_id},timestamp={timestamp},signature={signature}",
    "Content-Type": "application/x-www-form-urlencoded"
}

data = {
    "grant_type": "client_credentials",
    "type": "SELF"
}

url = "https://api.commerce.naver.com/external/v1/oauth2/token"

response = requests.post(url, headers=headers, data=data)

print("STATUS:", response.status_code)
print("BODY:", response.text)