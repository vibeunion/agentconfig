# AgentConfig Bundle — Integration Guide

This guide shows how to add AgentConfig Bundle import/export to any client in
under 50 lines of code, in any language. No SDK required — the format is pure
JSON + base64url + PBKDF2/AES-GCM, all available in standard libraries.

> **Spec:** [SPEC.md](./SPEC.md) &middot; **Reference impl:** `packages/core/` (TypeScript)

---

## 1. Protocol cheat sheet

A bundle is a JSON envelope. To import, you do exactly 5 things:

1. **Parse** the envelope; check `schema === "agentconfig-bundle"` and `v === 1`.
2. **Read `trust`** — `shared` MUST NOT carry `secrets`; `self`/`managed` MAY.
3. **Preview `pub`** to the user (models, mcp names, envKeys, skills).
4. **Decrypt `payload.ct`** (if `alg !== "none"`) with the user's password:
   - KDF: PBKDF2-HMAC-SHA256, `iterations` (≥100000), `salt` (base64)
   - Cipher: AES-256-GCM, `iv` (base64, 96-bit), 128-bit GCM tag is the **last
     16 bytes** of `ct`.
5. **Confirm and write** — never auto-import. For `shared`, create empty
   placeholders for each `envKey` and ask the user to fill them.

To export, reverse it: build `pub` (non-sensitive) + `secret` (sensitive),
optionally encrypt with a password, wrap in the envelope, then serialize as
`agentconfig://import?v=1&bundle=<base64url(json)>` or a `.acfg` file.

---

## 2. TypeScript

Use the reference package directly:

```bash
npm install @agentconfig/core
```

```ts
import {
  buildBundle, parseBundle, bundleToDeepLink,
  extractBundleFromDeepLink, revealSecret,
  encryptWithPassword, decryptWithPassword,
} from '@agentconfig/core';

// --- EXPORT ---
const bundle = await buildBundle({
  trust: 'self',
  pub: { mcp: [...], models: [...] },
  secret: { endpoints: {...}, secrets: { 'provider-a': { apiKey: 'sk-...' } } },
  password: 'hunter2',
  encrypt: encryptWithPassword,
});
const url = bundleToDeepLink(bundle); // agentconfig://import?...

// --- IMPORT ---
const bundle2 = extractBundleFromDeepLink(url);
const secret = await revealSecret(bundle2, 'hunter2', decryptWithPassword);
// show bundle2.pub to user, confirm, then write secret.secrets into config
```

---

## 3. Python (pure stdlib, ~60 lines)

No dependencies. Uses `hashlib`, `base64`, `json`, `cryptography` is NOT needed
below Python 3.6+ via `hashlib.pbkdf2_hmac`, but AES-GCM needs `cryptography`
(the most common Python crypto lib). If you can't add deps, use PyCryptodome.

```python
import base64, json, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from urllib.parse import urlparse, parse_qs

SCHEME = 'agentconfig'
ITER = 100000

def b64d(s): return base64.b64decode(s)
def b64u_d(s):
    s = s.replace('-', '+').replace('_', '/')
    s += '=' * (-len(s) % 4)
    return base64.b64decode(s)

def parse_deep_link(url):
    p = urlparse(url)
    assert p.scheme == SCHEME and p.hostname == 'import'
    enc = parse_qs(p.query)['bundle'][0]
    return json.loads(b64u_d(enc))

def reveal_secret(bundle, password):
    payload = bundle['payload']
    if payload['alg'] == 'none':
        return json.loads(b64d(payload['ct']))
    key = hashlib.pbkdf2_hmac('sha256', password.encode(),
                               b64d(payload['salt']),
                               payload['iterations'], 32)
    ct = b64d(payload['ct'])          # last 16 bytes = GCM tag
    data, tag = ct[:-16], ct[-16:]
    aes = AESGCM(key)
    pt = aes.decrypt(b64d(payload['iv']), data + tag, None)
    return json.loads(pt)

# --- IMPORT example ---
url = 'agentconfig://import?v=1&bundle=...'
bundle = parse_deep_link(url)
assert bundle['schema'] == 'agentconfig-bundle'
assert bundle['v'] == 1
# preview bundle['pub'] to user, get password, then:
secret = reveal_secret(bundle, 'test-vector-2026')
print(secret['secrets']['provider-a']['apiKey'])  # sk-test-key-abcdef
```

For **export**, build the envelope dict and encrypt with `AESGCM(key).encrypt(iv, pt, None)`
(the returned bytes already append the tag).

---

### 3.1 Handling OAuth credentials

When a provider uses OAuth (codex, antigravity, kimi, claude, …), its
credential lives in `secret.secrets[<provider>].oauth` instead of `apiKey`.
The `type` field tells your importer which refresh flow to use; `extra`
carries vendor-specific fields you should store opaquely.

```python
# --- OAuth credential import ---
secret = reveal_secret(bundle, password)
provider_secrets = secret.get('secrets', {})
if 'codex' in provider_secrets and 'oauth' in provider_secrets['codex']:
    oauth = provider_secrets['codex']['oauth']
    print(oauth['type'])           # 'codex'
    print(oauth['accessToken'])    # JWT
    print(oauth['expired'])        # ISO 8601 — refresh if past
    print(oauth.get('extra', {}))  # {'codex_fast_mode': False, ...}
    # dispatch refresh by oauth['type'] to your own refresh implementation
```

The spec does **not** define the refresh protocol — each provider has its own
token endpoint, scope, and flow. Your client dispatches by `type`.

## 4. Go (pure stdlib, ~50 lines)

Go's `crypto/aes`, `crypto/cipher` (GCM), `crypto/sha256`, `golang.org/x/crypto/pbkdf2`
are all you need. `pbkdf2` is in `golang.org/x/crypto/pbkdf2`.

```go
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

func b64d(s string) []byte { b, _ := base64.StdEncoding.DecodeString(s); return b }
func b64ud(s string) []byte {
	s = strings.ReplaceAll(s, "-", "+")
	s = strings.ReplaceAll(s, "_", "/")
	s += strings.Repeat("=", -len(s)%4)
	return b64d(s)
}

func ParseDeepLink(rawURL string) map[string]interface{} {
	u, _ := url.Parse(rawURL)
	enc := u.Query().Get("bundle")
	var bundle map[string]interface{}
	json.Unmarshal(b64ud(enc), &bundle)
	return bundle
}

func RevealSecret(bundle map[string]interface{}, password string) map[string]interface{} {
	payload := bundle["payload"].(map[string]interface{})
	if payload["alg"] == "none" {
		var s map[string]interface{}
		json.Unmarshal(b64d(payload["ct"].(string)), &s)
		return s
	}
	iter := int(payload["iterations"].(float64))
	key := pbkdf2.Key([]byte(password), b64d(payload["salt"].(string)), iter, 32, sha256.New)
	block, _ := aes.NewCipher(key)
	aesgcm, _ := cipher.NewGCM(block)
	ct := b64d(payload["ct"].(string))
	iv := b64d(payload["iv"].(string))
	pt, _ := aesgcm.Open(nil, iv, ct, nil) // Go GCM expects tag appended to ct
	var s map[string]interface{}
	json.Unmarshal(pt, &s)
	return s
}

func main() {
	bundle := ParseDeepLink("agentconfig://import?v=1&bundle=...")
	secret := RevealSecret(bundle, "test-vector-2026")
	fmt.Println(secret["secrets"].(map[string]interface{})["provider-a"].(map[string]interface{})["apiKey"])
	// sk-test-key-abcdef
}
```

For **export**, `aesgcm.Seal(nil, iv, plaintext, nil)` returns ciphertext+tag
already appended — exactly what ACB expects.

---

## 5. Rust (with crates)

Add to `Cargo.toml`:

```toml
[dependencies]
aes-gcm = "0.10"
pbkdf2 = { version = "0.12", features = ["simple"] }
sha2 = "0.10"
base64 = "0.22"
serde_json = "1"
url = "2"
```

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit}};
use base64::{engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD as B64U}, Engine};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

fn b64u_dec(s: &str) -> Vec<u8> {
    B64U.decode(s).unwrap()
}

pub fn reveal_secret(payload: &serde_json::Value, password: &str) -> serde_json::Value {
    let alg = payload["alg"].as_str().unwrap();
    if alg == "none" {
        let raw = B64U.decode(payload["ct"].as_str().unwrap()).unwrap();
        return serde_json::from_slice(&raw).unwrap();
    }
    let iter = payload["iterations"].as_u64().unwrap() as u32;
    let salt = B64.decode(payload["salt"].as_str().unwrap()).unwrap();
    let iv = B64.decode(payload["iv"].as_str().unwrap()).unwrap();
    let ct = B64.decode(payload["ct"].as_str().unwrap()).unwrap();

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, iter, &mut key);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&iv); // 12 bytes
    let pt = cipher.decrypt(nonce, ct.as_ref()).unwrap(); // expects tag appended
    serde_json::from_slice(&pt).unwrap()
}
```

For **export**, `cipher.encrypt(nonce, plaintext)` returns ciphertext+tag
appended — matches ACB's `ct` format directly.

---

## 6. Electron (desktop app)

Electron desktop clients register `agentconfig://` as a custom protocol to
handle both config imports (§8.1) and OIDC auth callbacks (§8.3).

### 6.1 Register the protocol

```ts
import { app } from 'electron';

// Register in app.whenReady() or before second-instance handling
if (!app.isPackaged) {
  app.setAsDefaultProtocolClient('agentconfig', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('agentconfig');
}
```

Also declare it in `electron-builder.json` so installers register the scheme:

```json
{
  "protocols": [
    { "name": "AgentConfig", "schemes": ["agentconfig"], "role": "Viewer" }
  ]
}
```

### 6.2 Route deep links: import vs auth/callback

```ts
const handleDeepLink = (url: string) => {
  const u = new URL(url);
  if (u.host === 'import') {
    // §8.1 — config bundle import
    handleAgentConfigImport(url);
  } else if (u.host === 'auth' && u.pathname === '/callback') {
    // §8.3 — OIDC authorization code callback
    handleAuthCallback(url);
  }
};

// macOS: app.on('open-url', (_, url) => handleDeepLink(url))
// Windows: second-instance event argv
app.on('open-url', (_, url) => handleDeepLink(url));
app.on('second-instance', (_, argv) => {
  const url = argv.find(a => a.startsWith('agentconfig://'));
  if (url) handleDeepLink(url);
});
```

### 6.3 Import a bundle

```ts
import { extractBundleFromDeepLink, revealSecret } from '@agentconfig/core';

async function handleAgentConfigImport(url: string) {
  const bundle = extractBundleFromDeepLink(url);
  if (bundle.schema !== 'agentconfig-bundle') return;

  // Preview pub to user (§9 import flow step 5)
  mainWindow.webContents.send('agentconfig:preview', {
    trust: bundle.trust,
    pub: bundle.pub,
    needsPassword: bundle.payload.alg !== 'none',
    hint: bundle.hint,
  });
}

// After user enters password and confirms:
async function confirmImport(bundle, password) {
  const secret = await revealSecret(bundle, password);
  // Write MCP servers, models, skills, secrets into local config
}
```

### 6.4 OIDC auth callback

```ts
function handleAuthCallback(url: string) {
  const u = new URL(url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code) return;

  // Verify state matches the one sent in the auth request (CSRF)
  if (!verifyState(state)) {
    console.error('state mismatch');
    return;
  }

  // Exchange code for tokens via your IdP's token endpoint
  const tokens = await exchangeCodeForTokens(code, {
    redirectUri: 'agentconfig://auth/callback',
    // clientId, clientSecret from your OIDC client config
  });

  // Store tokens in secrets[<provider>].oauth (§6.2, §6.2.1)
  await storeOidcCredential({
    type: 'oidc',
    issuer: 'https://auth.example.com',
    clientId: 'your-client-id',
    redirectUri: 'agentconfig://auth/callback',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expired: tokens.expires_at,
    scope: tokens.scope,
  });
}
```

### 6.5 Install @agentconfig/core

```bash
npm install @agentconfig/core
```

The package provides `buildBundle`, `parseBundle`, `bundleToDeepLink`,
`extractBundleFromDeepLink`, `revealSecret`, `encryptWithPassword`, and
`decryptWithPassword` — all framework-agnostic.

---

## 7. Test vectors

These fixed vectors let you verify your implementation produces byte-identical
output. The salt, iv, and password are fixed (not random), so every language
should decrypt to the same secret.

### Vector 1 — `trust=self`, password-encrypted

- **Password:** `test-vector-2026`
- **KDF:** PBKDF2-HMAC-SHA256, 100000 iterations
- **salt (base64):** `YWdlbnRjb25maWctdGVzdC1zYWx0LTAwMTY=`
- **iv (base64):** `YWNidmVjdG9yczAx`
- **ct (base64):** `XBfk0Lh0iLbzzyOSNRaSNxuaww6dbQMR8ICOeSwLLYS+XSlYz4vBGST8uPEtPcfHBTtx+xGo4uT+DCjszX5nPMa29O3c/iPtfo7cStNq4mc+Qt89T8oBgqtEKbits72djC7y4WScrjo+qwLsPxKTjmuV1HjCdm0QvM8cCQMaYFa8IC/ClKoTW6A6Nk/0TXs/3eYkvQMwA9gneYU9RgE31Pq1UWnPPYOH9ZGm/e5ZdSDH6zXGp1jCtALcZAYgOA86dGR0pb5QWsWoISO2P4Of5T59ZfCiJHAQte9pLjlQk8FKRMpgzgG3bBoK2LJsVddKSZkvbm+iQcjbn3iUzslFjEY=`

**Expected secret after decrypt:**

```json
{
  "endpoints": { "provider-a": "https://api.example.com" },
  "customPrompts": { "default": "Be concise." },
  "providerHints": [],
  "secrets": {
    "provider-a": { "apiKey": "sk-test-key-abcdef" },
    "github": { "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_testtoken123" } }
  }
}
```

**Full bundle as deep link:**

```
agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzM5MDAwMDAwMDAwLCJsYWJlbCI6IkludGVncmF0aW9uIFRlc3QgVmVjdG9yIiwic3JjIjoic3BlYyIsInRydXN0Ijoic2VsZiIsImNhcGFiaWxpdGllcyI6WyJtY3AiLCJtb2RlbHMiXSwiaGludCI6InBhc3N3b3JkIGlzIHRlc3QtdmVjdG9yLTIwMjYiLCJwYXlsb2FkIjp7ImFsZyI6IlBCS0RGMi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJpdGVyYXRpb25zIjoxMDAwMDAsInNhbHQiOiJZV2RsYm5SamIyNW1hV2N0ZEdWemRDMXpZV3gwTFRBd01UWT0iLCJpdiI6IllXTmlkbVZqZEc5eWN6QXgiLCJjdCI6IlhCZmswTGgwaUxienp5T1NOUmFTTnh1YXd3NmRiUU1SOElDT2VTd0xMWVMrWFNsWXo0dkJHU1Q4dVBFdFBjZkhCVHR4K3hHbzR1VCtEQ2pzelg1blBNYTI5TzNjL2lQdGZvN2NTdE5xNG1jK1F0ODlUOG9CZ3F0RUtiaXRzNzJkakM3eTRXU2Nyam8rcXdMc1B4S1RqbXVWMUhqQ2RtMFF2TThjQ1FNYVlGYThJQy9DbEtvVFc2QTZOay8wVFhzLzNlWWt2UU13QTlnbmVZVTlSZ0UzMVBxMVVXblBQWU9IOVpHbS9lNVpkU0RINnpYR3AxakN0QUxjWkFZZ09BODZkR1IwcGI1UVdzV29JU08yUDRPZjVUNTlaZkNpSkhBUXRlOXBMamxRazhGS1JNcGd6Z0czYkJvSzJMSnNWZGRLU1prdmJtK2lRY2pibjNpVXpzbEZqRVk9In0sInB1YiI6eyJtY3AiOlt7Im5hbWUiOiJnaXRodWIiLCJlbmFibGVkIjp0cnVlLCJ0cmFuc3BvcnQiOiJzdGRpbyIsImNvbW1hbmQiOiJucHgiLCJhcmdzIjpbIi15IiwiQG1vZGVsY29udGV4dHByb3RvY29sL3NlcnZlci1naXRodWIiXSwiZW52S2V5cyI6WyJHSVRIVUJfUEVSU09OQUxfQUNDRVNTX1RPS0VOIl19XSwibW9kZWxzIjpbeyJwcm92aWRlciI6InByb3ZpZGVyLWEiLCJpZCI6Im1vZGVsLXgiLCJhbGlhcyI6IngifV0sInNraWxscyI6W10sInByb21wdHMiOltdLCJhZ2VudHMiOltdLCJyZXNvdXJjZXMiOltdfX0
```

### How to use the vector

Run your `reveal_secret(parse_deep_link(url), "test-vector-2026")` and assert
`secret.secrets["provider-a"].apiKey == "sk-test-key-abcdef"`. If it matches,
your crypto is byte-compatible with the reference implementation.

---

## 8. Minimal importer checklist

A compliant importer MUST:

- [ ] Parse the deep link or `.acfg` file.
- [ ] Reject `schema !== "agentconfig-bundle"` or unknown `v`.
- [ ] Read `trust` and enforce §7.4–7.5 of the spec (refuse `shared` with
      `secrets`; refuse `self`/`managed` + secrets + `alg:none`).
- [ ] Preview `pub` (models, mcp names, envKeys, skills) before asking for a
      password.
- [ ] Prompt for password if `payload.alg !== "none"`.
- [ ] Decrypt with PBKDF2-SHA256 (≥100000 iter) + AES-256-GCM (tag = last 16
      bytes of `ct`).
- [ ] Show a diff and require explicit user confirmation.
- [ ] For `shared`: create empty placeholders for each `envKey`; never auto-fill
      credentials.
- [ ] For `self`/`managed`: write decrypted secrets after confirmation; `managed`
      SHOULD log the event.

A compliant exporter MUST:

- [ ] Build `pub` with only non-sensitive fields.
- [ ] Put credentials in `secret.secrets` (only if `trust` allows).
- [ ] Refuse to emit `alg:none` when `trust ∈ {self,managed}` and secrets exist.
- [ ] Use random 16-byte salt and 12-byte iv per bundle.
- [ ] Set `iterations ≥ 100000`.
- [ ] Tag the spec version `v: 1` and `schema: "agentconfig-bundle"`.

---

## 9. Deep link registration

Register `agentconfig://` with the OS so clicking a link opens your client:

- **macOS:** add to `Info.plist`:
  ```xml
  <key>CFBundleURLTypes</key>
  <array><dict>
    <key>CFBundleURLSchemes</key>
    <array><string>agentconfig</string></array>
  </dict></array>
  ```
- **Windows:** register a protocol handler in the installer (registry
  `HKEY_CLASSES_ROOT\agentconfig\shell\open\command`).
- **Linux:** ship a `.desktop` file with `MimeType=x-scheme-handler/agentconfig`.

Also register the `.acfg` file association so double-clicking imports:

- **macOS:** `CFBundleDocumentTypes` with `CFBundleTypeExtensions: ["acfg"]`.
- **Windows:** registry `HKEY_CLASSES_ROOT\.acfg`.
- **Linux:** `.desktop` `MimeType=application/x-agentconfig+json`.

If `agentconfig://` is already claimed by another app, fall back to your private
scheme but emit `agentconfig://` first.

---

## 10. FAQ

**Do I need to support all capabilities?**
No. Ignore any capability you don't understand. A minimal MCP-only client can
skip `skills`, `agents`, etc.

**Can I add my own fields?**
Yes, but put them under a vendor-prefixed key in `pub` (e.g. `pub.x-myfield`).
Other clients will ignore unknown fields per §2 of the spec.

**How do I handle MCP servers I don't recognize?**
Import them as-is (command/args/envKeys). The user fills env values. If you have
a registry/marketplace, match `registryId` to install from there.

**Is the format stable?**
v1 is the current version. Breaking changes bump `v`; clients should refuse
higher `v` with a clear message. Encryption `iterations` and `alg` can evolve
without a version bump.

**Do I need a password for `shared` bundles?**
No. `shared` bundles have no secrets, so `alg: "none"` is fine. A password is
only required when `trust ∈ {self, managed}` and `secrets` is non-empty.
