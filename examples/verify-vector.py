#!/usr/bin/env python3
"""Verify the AgentConfig test vector decrypts correctly.
Requires: pip install cryptography
Run: python3 examples/verify-vector.py
"""
import base64, json, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from urllib.parse import urlparse, parse_qs

def b64d(s): return base64.b64decode(s)
def b64u_d(s):
    s = s.replace('-', '+').replace('_', '/')
    s += '=' * (-len(s) % 4)
    return base64.b64decode(s)

def parse_deep_link(url):
    p = urlparse(url)
    assert p.scheme == 'agentconfig' and p.hostname == 'import'
    enc = parse_qs(p.query)['bundle'][0]
    return json.loads(b64u_d(enc))

def reveal_secret(bundle, password):
    payload = bundle['payload']
    if payload['alg'] == 'none':
        return json.loads(b64d(payload['ct']))
    key = hashlib.pbkdf2_hmac('sha256', password.encode(),
                               b64d(payload['salt']),
                               payload['iterations'], 32)
    ct = b64d(payload['ct'])
    data, tag = ct[:-16], ct[-16:]
    aes = AESGCM(key)
    pt = aes.decrypt(b64d(payload['iv']), data + tag, None)
    return json.loads(pt)

URL = ('agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUi'
       'LCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRl'
       'Z3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBh'
       'YmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3Rv'
       'ciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJh'
       'dGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2Ijoi'
       'TURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThw'
       'cDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2'
       'dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGsw'
       'WHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWty'
       'UytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2'
       'c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNS'
       'SjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FW'
       'cytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6'
       'W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwi'
       'Y29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2Vy'
       'dmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4i'
       'XX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIs'
       'ImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGlt'
       'b2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNl'
       'cyI6W119fQ')

bundle = parse_deep_link(URL)
assert bundle['schema'] == 'agentconfig-bundle'
assert bundle['v'] == 1
assert bundle['trust'] == 'self'

secret = reveal_secret(bundle, 'test-vector-2026')
assert secret['secrets']['provider-a']['apiKey'] == 'sk-test-key-abcdef'
assert secret['secrets']['github']['env']['GITHUB_PERSONAL_ACCESS_TOKEN'] == 'ghp_testtoken123'
assert secret['endpoints']['provider-a'] == 'https://api.example.com'
assert secret['customPrompts']['default'] == 'Be concise.'
print("OK: test vector decrypts correctly in Python")
print("  apiKey:", secret['secrets']['provider-a']['apiKey'])
