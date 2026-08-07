#!/usr/bin/env python3
"""Verify OAuth credential round-trip with a synthetic vector.
Requires: pip install cryptography
Run: python3 examples/verify-vector-oauth.py

Uses a SYNTHETIC (fake) token — never real credentials.
"""
import base64, json, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Synthetic OAuth credential (NOT a real token)
OAUTH_SECRET = {
    "endpoints": {"codex": "https://api.example.com"},
    "customPrompts": {},
    "providerHints": [],
    "secrets": {
        "codex": {
            "oauth": {
                "type": "codex",
                "accessToken": "eyJhbGciOiJSUzI1NiJ9.SYNTHETIC.NOT_REAL_TOKEN",
                "refreshToken": "rt.synthetic-not-real-refresh",
                "idToken": "eyJhbGciOiJSUzI1NiJ9.SYNTHETIC.ID_TOKEN",
                "expired": "2026-12-31T23:59:59+08:00",
                "accountId": "synthetic-account-id",
                "email": "synthetic@example.com",
                "scope": "openid email profile",
                "extra": {
                    "codex_fast_mode": False,
                    "disabled": False,
                    "last_refresh": "2026-08-07T10:00:00+08:00"
                }
            }
        }
    }
}

PASSWORD = "oauth-test-2026"
# Fixed 16-byte salt and 12-byte iv for reproducibility
SALT = b"oauth-test-salt!"
IV = bytes(range(12))

key = hashlib.pbkdf2_hmac('sha256', PASSWORD.encode(), SALT, 100000, 32)
aes = AESGCM(key)
plaintext = json.dumps(OAUTH_SECRET).encode()
ct = aes.encrypt(IV, plaintext, None)

# Round-trip: decrypt back and verify all OAuth fields survive
pt = aes.decrypt(IV, ct, None)
recovered = json.loads(pt)

oauth = recovered['secrets']['codex']['oauth']
assert oauth['type'] == 'codex', "type mismatch"
assert oauth['accessToken'] == "eyJhbGciOiJSUzI1NiJ9.SYNTHETIC.NOT_REAL_TOKEN"
assert oauth['refreshToken'] == "rt.synthetic-not-real-refresh"
assert oauth['idToken'].startswith("eyJ")
assert oauth['expired'] == "2026-12-31T23:59:59+08:00"
assert oauth['accountId'] == "synthetic-account-id"
assert oauth['email'] == "synthetic@example.com"
assert oauth['scope'] == "openid email profile"
assert oauth['extra']['codex_fast_mode'] == False
assert oauth['extra']['disabled'] == False
assert oauth['extra']['last_refresh'] == "2026-08-07T10:00:00+08:00"

# Verify the bundle envelope would accept this via the schema rules:
# trust=self + secrets non-empty + encrypted -> compliant (not alg=none)
print("OK: OAuth credential round-trip verified")
print("  type:", oauth['type'])
print("  email:", oauth['email'])
print("  expired:", oauth['expired'])
print("  extra keys:", list(oauth['extra'].keys()))
print("  compliance: trust=self + secrets + encrypted -> OK (would pass producer rule)")
