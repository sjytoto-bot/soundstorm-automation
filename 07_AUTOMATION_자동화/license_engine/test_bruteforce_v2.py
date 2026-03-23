import requests
import time
import hmac
import hashlib
import base64

# ID variations
ids = ["3muK1bGIJ6CYByRh4BitWI", "3muK1bGlJ6CYByRh4BitWI"]
# Secret variations (just in case)
secrets = ["$2a$04$Cr63v/XRI2lHJ.hlfyuQzO"]

def run_exhaustive():
    url = "https://api.commerce.naver.com/external/v1/oauth2/token"
    
    # Try both seconds and milliseconds
    now = time.time()
    timestamps = [
        str(int(now)),          # seconds
        str(int(now * 1000))    # milliseconds
    ]
    
    # Message formats
    formats = [
        lambda t, c: t + c,
        lambda t, c: c + t,
        lambda t, c: t + "_" + c,
        lambda t, c: c + "_" + t
    ]

    for cid in ids:
        for secret in secrets:
            for ts in timestamps:
                for fmt in formats:
                    msg = fmt(ts, cid)
                    sig = base64.b64encode(hmac.new(secret.encode('utf-8'), msg.encode('utf-8'), hashlib.sha256).digest()).decode('utf-8')
                    
                    headers = {
                        "Authorization": f"HMAC-SHA256 client_id={cid},timestamp={ts},signature={sig}",
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                    data = {"grant_type": "client_credentials", "type": "SELF"}
                    
                    print(f"Testing ID={cid} | TS={ts} | Msg={msg[:20]}...")
                    try:
                        r = requests.post(url, headers=headers, data=data, timeout=3)
                        if r.status_code == 200:
                            print(f"\n✅ FOUND IT! Code={r.status_code}")
                            print(f"ID: {cid}\nTS: {ts}\nMsg: {msg}\nSig: {sig}")
                            print(f"Response: {r.text}")
                            return
                        # else:
                        #     print(f"  Failed: {r.status_code} - {r.text[:50]}")
                    except:
                        pass

if __name__ == "__main__":
    run_exhaustive()
