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
       'LCJ2IjoxLCJjcmVhdGVkIjoxNzM5MDAwMDAwMDAwLCJsYWJlbCI6IkludGVncmF0aW9uIFRl'
       'c3QgVmVjdG9yIiwic3JjIjoic3BlYyIsInRydXN0Ijoic2VsZiIsImNhcGFiaWxpdGllcyI6'
       'WyJtY3AiLCJtb2RlbHMiXSwiaGludCI6InBhc3N3b3JkIGlzIHRlc3QtdmVjdG9yLTIwMjYi'
       'LCJwYXlsb2FkIjp7ImFsZyI6IlBCS0RGMi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJpdGVyYXRp'
       'b25zIjoxMDAwMDAsInNhbHQiOiJZV2RsYm5SamIyNW1hV2N0ZEdWemRDMXpZV3gwTFRBd01U'
       'WT0iLCJpdiI6IllXTmlkbVZqZEc5eWN6QXgiLCJjdCI6IlhCZmswTGgwaUxienp5T1NOUmFT'
       'Tnh1YXd3NmRiUU1SOElDT2VTd0xMWVMrWFNsWXo0dkJHU1Q4dVBFdFBjZkhCVHR4K3hHbzR1'
       'VCtEQ2pzelg1blBNYTI5TzNjL2lQdGZvN2NTdE5xNG1jK1F0ODlUOG9CZ3F0RUtiaXRzNzJk'
       'akM3eTRXU2Nyam8rcXdMc1B4S1RqbXVWMUhqQ2RtMFF2TThjQ1FNYVlGYThJQy9DbEtvVFc2'
       'QTZOay8wVFhzLzNlWWt2UU13QTlnbmVZVTlSZ0UzMVBxMVVXblBQWU9IOVpHbS9lNVpkU0RI'
       'NnpYR3AxakN0QUxjWkFZZ09BODZkR1IwcGI1UVdzV29JU08yUDRPZjVUNTlaZkNpSkhBUXRl'
       'OXBMamxRazhGS1JNcGd6Z0czYkJvSzJMSnNWZGRLU1prdmJtK2lRY2pibjNpVXpzbEZqRVk9'
       'In0sInB1YiI6eyJtY3AiOlt7Im5hbWUiOiJnaXRodWIiLCJlbmFibGVkIjp0cnVlLCJ0cmFu'
       'c3BvcnQiOiJzdGRpbyIsImNvbW1hbmQiOiJucHgiLCJhcmdzIjpbIi15IiwiQG1vZGVsY29u'
       'dGV4dHByb3RvY29sL3NlcnZlci1naXRodWIiXSwiZW52S2V5cyI6WyJHSVRIVUJfUEVSU09O'
       'QUxfQUNDRVNTX1RPS0VOIl19XSwibW9kZWxzIjpbeyJwcm92aWRlciI6InByb3ZpZGVyLWEi'
       'LCJpZCI6Im1vZGVsLXgiLCJhbGlhcyI6IngifV0sInNraWxscyI6W10sInByb21wdHMiOltd'
       'LCJhZ2VudHMiOltdLCJyZXNvdXJjZXMiOltdfX0')

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
