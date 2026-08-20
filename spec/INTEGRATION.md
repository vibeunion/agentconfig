# AgentConfig Bundle — Integration Guide

This guide shows how to add AgentConfig Bundle import/export to any client in
under 50 lines of code, in any language. SDKs are available for TypeScript,
Python, Go, Rust, and Java.

> **Spec:** [SPEC.md](./SPEC.md) &middot; **Reference impl:** `packages/core/` (TypeScript) &middot; **SDKs:** `sdks/`

---

## 1. Protocol cheat sheet

A bundle is a JSON envelope. To import, you do exactly 5 things:

1. **Parse** the envelope; check `schema === "agentconfig-bundle"` and `v === 1`.
2. **Read `trust`** — `shared` MUST NOT carry `secrets`; `self`/`managed` MAY.
3. **Preview `pub`** to the user (models, mcp names, envKeys, skills).
4. **Decrypt `payload.ct`** (if `alg !== "none"`) with the user's password:
   - KDF: PBKDF2-HMAC-SHA256, `iterations` (≥100000), `salt` (16 bytes base64)
   - Cipher: AES-256-GCM, `iv` (12 bytes base64, 96-bit), 128-bit GCM tag is the **last
     16 bytes** of `ct`.
5. **Confirm and write** — never auto-import. For `shared`, create empty
   placeholders for each `envKey` and ask the user to fill them.

To export, reverse it: build `pub` (non-sensitive) + `secret` (sensitive),
optionally encrypt with a password, wrap in the envelope, then serialize as
`agentconfig://import?v=1&bundle=<base64url(json)>` or a `.acfg` file.

---

## 2. Multi-Language SDKs

Official SDKs are located in the `sdks/` directory:

| Language | Directory / Package | Installation |
|---|---|---|
| **TypeScript / JS** | `packages/core` & `sdks/ts` | `npm install @agentconfig/core` |
| **Python** | `sdks/python` | `pip install agentconfig` |
| **Go** | `sdks/go` | `go get github.com/vibeunion/agentconfig/sdks/go` |
| **Rust** | `sdks/rust` | `agentconfig = "0.1.0"` in `Cargo.toml` |
| **Java** | `sdks/java` | `io.agentconfig:agentconfig:0.1.0` in `pom.xml` |

---

## 3. TypeScript (`@agentconfig/core`)

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
```

---

## 4. Python (`agentconfig`)

```bash
pip install agentconfig
```

```python
from agentconfig import (
    build_bundle,
    bundle_to_deep_link,
    extract_bundle_from_deep_link,
    reveal_secret,
    AcbTrustMode,
    BundlePublic,
    ModelEntryPublic,
    BundleSecret,
    ProviderSecret,
)

bundle = build_bundle(
    trust=AcbTrustMode.Self.value,
    pub=BundlePublic(models=[ModelEntryPublic(provider="deepseek", id="deepseek-chat")]),
    secret=BundleSecret(secrets={"deepseek": ProviderSecret(apiKey="sk-...")}),
    password="my-password",
)
url = bundle_to_deep_link(bundle)

imported = extract_bundle_from_deep_link(url)
secret = reveal_secret(imported, "my-password")
print(secret.secrets["deepseek"].apiKey)
```

---

## 5. Go (`github.com/vibeunion/agentconfig/sdks/go`)

```go
package main

import (
	"fmt"
	"github.com/vibeunion/agentconfig/sdks/go"
)

func main() {
	bundle, err := agentconfig.BuildBundle(agentconfig.BuildBundleOptions{
		Trust: agentconfig.TrustModeSelf,
		Pub: agentconfig.BundlePublic{
			Models: []agentconfig.ModelEntryPublic{
				{Provider: "deepseek", ID: "deepseek-chat"},
			},
		},
		Secret: &agentconfig.BundleSecret{
			Secrets: map[string]agentconfig.ProviderSecret{
				"deepseek": {APIKey: "sk-..."},
			},
		},
		Password: "my-password",
	})
	if err != nil {
		panic(err)
	}

	url, err := agentconfig.BundleToDeepLink(bundle)
	fmt.Println("Deep link:", url)

	imported, err := agentconfig.ExtractBundleFromDeepLink(url)
	secret, err := agentconfig.RevealSecret(imported, "my-password")
	fmt.Println("API key:", secret.Secrets["deepseek"].APIKey)
}
```

---

## 6. Rust (`agentconfig`)

```rust
use agentconfig::*;
use std::collections::HashMap;

fn main() -> Result<()> {
    let mut secrets = HashMap::new();
    secrets.insert("deepseek".to_string(), ProviderSecret {
        api_key: Some("sk-...".to_string()),
        ..Default::default()
    });

    let bundle = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SELF.to_string()),
        pub_section: BundlePublic {
            models: vec![ModelEntryPublic {
                provider: "deepseek".to_string(),
                id: "deepseek-chat".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        },
        secret: Some(BundleSecret { secrets, ..Default::default() }),
        password: Some("my-password".to_string()),
        ..Default::default()
    })?;

    let url = bundle_to_deep_link(&bundle, None)?;
    let imported = extract_bundle_from_deep_link(&url, None)?;
    let secret = reveal_secret(&imported, Some("my-password"))?;
    println!("API key: {:?}", secret.secrets.get("deepseek").and_then(|s| s.api_key.as_deref()));
    Ok(())
}
```

---

## 7. Java (`io.agentconfig:agentconfig`)

```java
import io.agentconfig.AgentConfig;
import io.agentconfig.Codec;
import io.agentconfig.Schema;
import io.agentconfig.model.*;

public class Main {
    public static void main(String[] args) {
        BundlePublic pub = new BundlePublic();
        ModelEntryPublic model = new ModelEntryPublic();
        model.setProvider("deepseek");
        model.setId("deepseek-chat");
        pub.getModels().add(model);

        BundleSecret secret = new BundleSecret();
        ProviderSecret provSecret = new ProviderSecret();
        provSecret.setApiKey("sk-...");
        secret.getSecrets().put("deepseek", provSecret);

        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.trust = Schema.TRUST_SELF;
        opts.pub = pub;
        opts.secret = secret;
        opts.password = "my-password";

        ConfigBundle bundle = AgentConfig.buildBundle(opts);
        String url = AgentConfig.bundleToDeepLink(bundle);

        ConfigBundle imported = AgentConfig.extractBundleFromDeepLink(url);
        BundleSecret revealed = AgentConfig.revealSecret(imported, "my-password");
        System.out.println("API Key: " + revealed.getSecrets().get("deepseek").getApiKey());
    }
}
```

---

## 8. DeepSeek Harness Plugin

The DeepSeek test and evaluation harness plugin is available in TypeScript (`@agentconfig/deepseek-harness`) and Python (`agentconfig.plugins.deepseek_harness`).

```ts
import { decryptWithPassword, extractBundleFromDeepLink } from '@agentconfig/core';
import { DeepSeekHarness } from '@agentconfig/deepseek-harness';

const bundle = extractBundleFromDeepLink(deepLink);
const harness = await DeepSeekHarness.fromBundle(bundle, 'password', decryptWithPassword);

const result = await harness.runTask({
  prompt: 'Explain quantum computing in one paragraph',
  model: 'deepseek-chat',
});
console.log(result.content);
```

---

## 9. Canonical Test Vectors

These fixed vectors verify cross-language byte-level compatibility.

### Vector 1 — `trust=self`, password-encrypted

- **Password:** `test-vector-2026`
- **KDF:** PBKDF2-HMAC-SHA256, 100,000 iterations
- **salt (base64, 16 bytes):** `MDEyMzQ1Njc4OWFiY2RlZg==`
- **iv (base64, 12 bytes):** `MDEyMzQ1Njc4OWFi`
- **ct (base64):** `q3W0hkZQ26qKnnGClCaDRzY5HZJI8pp2fs4ZNO/nVA+23fqiXRZ953T+WLIcFHP3dGVMIF+C5L1gNoi1YU8vuJjpPPL4nnvfSlfAuDjavo+gRW9+xnDAi+KRqzPx+2Ynx0WtPNqxk0Xy/Eko7g/AbYaenspvEo3uVJ2hX3qQ8TfC0x6z9GGWMQ3adgGenQkrS+kMbo1AYFTB21nRRchAP+q8eSLBB0tbaxZSfZW/cJ5MTldr5699FvslOCC6FHRPnnG7Os9Tz/6aYvSX7C5gX9E8uUhP065lN/kOgNJs4UcRJ6Yfzv6GbA3/7lfKM7y/n5QutAi8cUYnYcyX6AjnWVvWm9QKW5fgaVs+gbLsxP9hWCz3lYzHmduXFrWGGnDBtBE0gw==`

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
agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ
```
