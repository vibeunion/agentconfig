# ACB — AgentConfig Bundle Specification

**Status:** Draft v1.4 (2026-08-18)

**License:** MIT

---

## 1. Overview

ACB (AgentConfig Bundle) is a portable, optionally encrypted format for sharing
AI agent configurations across desktop clients. A bundle can carry MCP servers,
model lists, skills, prompts, agents, resources, and—when explicitly allowed—
provider credentials such as API keys, OAuth credentials, and MCP environment
values.

A bundle travels either as a deep-link URL (`agentconfig://import?...`) for
lightweight sharing or as an `.acfg` file for full backups. Both carriers use
the same JSON envelope, so parsers are carrier-agnostic.

### Goals

- **Client-neutral:** any agent-capable client can produce or consume a bundle,
  taking only the capabilities it understands and ignoring the rest.
- **Trust-aware:** three explicit trust modes tell the importer whether the
  bundle carries live credentials and how to treat them.
- **Previewable:** the public section is readable without a password, so a
  recipient can inspect a bundle before deciding to import.
- **Forward-compatible:** versioned envelope, capability discovery, preserved
  unknown fields, and upgradeable encryption parameters.

### Non-goals

- Transporting binary assets such as skill packages or icons.
- Cross-device synchronization with conflict resolution.
- Server-side storage. ACB is a one-shot, peer-to-peer import/export format.

---

## 2. Conventions

- **Encoding:** JSON (UTF-8). Deep-link payloads are base64url-encoded JSON.
- **Base64:** standard canonical base64 for payload fields; base64url for the
  deep-link `bundle` query value.
- **Field names:** lowercase camelCase.
- **Unknown fields:** parsers MUST preserve and ignore fields they do not
  recognize. This is required for forward compatibility.
- **Unknown capabilities:** parsers MUST preserve capability names they do not
  recognize and MUST NOT reject a bundle because of them.
- **Sizes:** clients MUST reject bundles whose decoded JSON exceeds 1,000,000
  UTF-8 bytes. Deep-link payloads remain limited to 20,000 base64url characters.
- **Custom parameters:** values MUST be JSON-serializable; non-finite numbers,
  functions, symbols, cyclic data, and excessively deep structures are invalid.

---

## 3. Envelope

```json
{
  "schema": "agentconfig-bundle",
  "v": 1,
  "created": 1787030654160,
  "label": "My work setup",
  "src": "any-client",
  "trust": "self",
  "capabilities": ["mcp", "models", "skills"],
  "hint": "Contains provider endpoints",
  "payload": { "alg": "...", "...": "..." },
  "pub": { "models": [] }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | `"agentconfig-bundle"` | yes | Identifies this format. |
| `v` | `1` | yes | Envelope version. This specification defines v1. |
| `created` | non-negative integer | yes | Unix epoch milliseconds when produced. |
| `label` | string ≤80 | no | Human-readable display name. |
| `src` | string ≤32 | no | Producing client identifier. Clients MUST NOT reject based on `src`. |
| `trust` | `self` \| `shared` \| `managed` | yes, default `shared` | Credential policy. See §7. |
| `capabilities` | string[] | yes | Public sections present. Unknown values are preserved and ignored. |
| `hint` | string ≤80 | no | Password hint in plaintext. MUST NOT contain the password. |
| `payload` | object | yes | Secret-section envelope. See §4. |
| `pub` | object | yes | Public, non-sensitive metadata. See §5. |

---

## 4. Payload envelope

The `payload` field is a discriminated union on `alg`.

### 4.1 Password-encrypted

```json
{
  "alg": "PBKDF2-SHA256-AES-256-GCM",
  "iterations": 100000,
  "salt": "<base64>",
  "iv": "<base64>",
  "ct": "<base64>"
}
```

- **KDF:** PBKDF2-HMAC-SHA256.
- **Iterations:** integer from 100,000 through 1,000,000, inclusive.
- **Key:** 32 bytes (AES-256).
- **Salt:** 16 random bytes.
- **Cipher:** AES-256-GCM with a 12-byte IV and a 16-byte authentication tag.
- **Ciphertext layout:** encrypted bytes followed by the GCM tag, then standard
  base64 encoded.
- Importers MUST reject iteration values outside the supported range before
  invoking the KDF. The upper bound prevents attacker-controlled CPU exhaustion.
- `iterations` remains in-band so clients can raise the work factor within the
  supported range without an envelope-version bump.

The plaintext inside `ct` is UTF-8 JSON matching the Secret Section (§6).

### 4.2 Plain

```json
{
  "alg": "none",
  "ct": "<base64 of UTF-8 JSON>"
}
```

`ct` is standard base64 of the Secret Section JSON.

Plain payloads MUST NOT carry provider credentials when `trust` is `self` or
`managed`. A `shared` bundle MUST NOT carry credentials regardless of whether
its payload is encrypted. See §7.

---

## 5. Public section (`pub`)

All arrays are optional and default to empty. Every subfield is non-sensitive.
Unknown fields are preserved.

### 5.1 `mcp`

```json
{
  "name": "github",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "envKeys": ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  "registryId": "optional-marketplace-id",
  "repoUrl": "https://example.com/owner/repo",
  "description": "GitHub tools"
}
```

`envKeys` contains names only. Actual environment values live under
`secrets[<name>].env` in the Secret Section or are left for the importer to
collect in `shared` mode.

`transport` is `stdio`, `sse`, or `http`. For `sse` and `http`, producers place
the endpoint in the Secret Section rather than exposing a potentially private
URL in `pub`.

### 5.2 `models`

Legacy entries remain valid:

```json
{
  "provider": "provider-a",
  "id": "model-x",
  "alias": "x",
  "maxTokens": 200000
}
```

Draft v1.4 adds explicit context, model-kind, generation-mode, and custom
parameter metadata:

```json
{
  "provider": "provider-video",
  "id": "video-model",
  "alias": "video",
  "contextWindow": 128000,
  "maxOutputTokens": 8192,
  "modelType": "video-generation",
  "generationModes": ["text-to-video", "image-to-video"],
  "parameters": {
    "durationSeconds": 8,
    "aspectRatio": "16:9",
    "seed": 42
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | string 1–64 | yes | Provider identifier; also used to match secret/provider hints. |
| `id` | string 1–128 | yes | Provider model identifier. |
| `alias` | string ≤64 | no | Client-friendly local alias. |
| `maxTokens` | positive integer | no | Legacy combined token limit. Retained for compatibility. |
| `contextWindow` | positive integer | no | Total context capacity in tokens. Prefer this over `maxTokens` for new producers. |
| `maxOutputTokens` | positive integer | no | Maximum output/completion tokens. MUST NOT exceed `contextWindow`, or `maxTokens` when `contextWindow` is absent. |
| `modelType` | enum | no | `text`, `multimodal`, `image-generation`, or `video-generation`. |
| `generationModes` | enum[] | no | Supported media-generation input/output routes. |
| `parameters` | JSON object | no | Provider-neutral container for provider-specific request defaults. |

`generationModes` values:

- `text-to-image`
- `image-to-image`
- `text-to-video`
- `image-to-video`

An `image-generation` entry MUST NOT declare video modes. A
`video-generation` entry MUST NOT declare image modes. A `text` entry MUST NOT
declare media-generation modes. A `multimodal` entry may declare any applicable
mode because multimodal providers can expose mixed input/output behavior.

`parameters` is intentionally opaque to ACB. Importers preserve it and apply
only keys they understand. Producers MUST emit only finite JSON values. The
reference schema limits keys to 128 characters, nesting to 20 levels, and each
array/object to 1,000 entries to bound parser work.

### 5.3 `skills`

```json
{ "id": "docx", "enabled": true, "order": 1 }
```

Skill definitions are not transported—only enable state and order. Importers
map `id` to installed skills and ignore unknown IDs.

### 5.4 `prompts`

```json
{ "id": "code-review", "title": "Code Review" }
```

Prompt bodies live in `customPrompts` inside the Secret Section.

### 5.5 `agents`

```json
{
  "id": "researcher",
  "name": "Researcher",
  "model": "model-x",
  "skillIds": ["web-search", "pdf"]
}
```

### 5.6 `resources`

```json
{
  "uri": "file:///workspace/notes.md",
  "name": "Notes",
  "mimeType": "text/markdown"
}
```

URIs are references only; resource content is not embedded.

---

## 6. Secret section

The decoded plaintext inside `payload.ct` has this shape:

```json
{
  "endpoints": {
    "provider-a": "https://api.example.com"
  },
  "customPrompts": {
    "code-review": "Review this code for bugs, security, and style."
  },
  "providerHints": [
    { "provider": "provider-a", "baseUrl": "https://api.example.com/v1" }
  ],
  "secrets": {
    "provider-a": { "apiKey": "<credential>" },
    "github": {
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<credential>" },
      "headers": { "X-Custom": "<credential>" }
    }
  }
}
```

| Field | Description |
|---|---|
| `endpoints` | Provider-to-API base URL. Kept in the secret section because private gateways can be sensitive. |
| `customPrompts` | Prompt ID to body. Prompts may be proprietary. |
| `providerHints` | Extra provider metadata such as base URL overrides. |
| `secrets` | Provider/MCP name to credential bundle. Only valid for `self` or `managed`. |

### 6.1 `secrets[<provider>]`

| Field | Description |
|---|---|
| `apiKey` | Provider API key. |
| `env` | MCP environment values keyed by variable name. |
| `headers` | Extra provider HTTP headers. |
| `oauth` | OAuth/OIDC credential object. See §6.2. |

The `secrets` map is keyed by the same provider string used in `pub.models` and
by MCP server `name`.

### 6.2 OAuth/OIDC credential

```json
{
  "type": "codex",
  "accessToken": "<token>",
  "refreshToken": "<token>",
  "idToken": "<token>",
  "expired": "2026-12-31T23:59:59+08:00",
  "accountId": "account-id",
  "email": "person@example.com",
  "scope": "openid email profile",
  "extra": {
    "disabled": false,
    "last_refresh": "2026-08-07T10:00:00+08:00"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `type` | yes | Free-form credential-type identifier. Importers dispatch provider refresh logic by this value. |
| `accessToken` | no | OAuth access token. |
| `refreshToken` | no | OAuth refresh token. |
| `idToken` | no | OIDC ID token. |
| `expired` | no | Token expiry as an ISO 8601 string. |
| `accountId` | no | Account identifier. |
| `email` | no | Display email. |
| `scope` | no | OAuth scope string. |
| `extra` | no | Opaque vendor-specific fields. |

Refresh protocols are out of scope. The format carries credentials; clients own
authorization and refresh behavior.

#### 6.2.1 OIDC standard fields

OIDC-capable credentials may also include:

| Field | Required | Description |
|---|---|---|
| `issuer` | no | OIDC issuer URL. |
| `clientId` | no | OAuth client ID. |
| `redirectUri` | no | Authorization callback URI, normally `agentconfig://auth/callback`. |

The reference TypeScript schema explicitly preserves and validates these fields.

---

## 7. Trust modes

`trust` tells an importer how to treat credentials.

### 7.1 `shared`

- Used to share configuration with another person.
- `secrets` MUST be absent or empty.
- Importers collect their own values for `envKeys` and provider credentials.
- Encryption is optional when no credentials are present.
- A producer MUST reject credentials even when the shared payload is encrypted.

### 7.2 `self`

- Used for personal backup or cross-device transfer.
- Credentials MAY be present.
- A password-encrypted payload is REQUIRED whenever `secrets` is non-empty.
- Importers still show a diff and require explicit confirmation before writing.

### 7.3 `managed`

- Used for enterprise-managed configuration distribution.
- Credentials MAY be present and require password encryption.
- Importers SHOULD audit the event and MAY require an additional identity check.

### 7.4 Producer enforcement

A producer MUST reject either condition:

```text
trust == shared AND secrets non-empty
```

```text
trust in {self, managed} AND secrets non-empty AND payload.alg == none
```

### 7.5 Importer enforcement

An importer validates a plaintext secret section immediately. For an encrypted
payload, it validates the same trust rules immediately after successful
decryption and before applying any data. An importer MUST never write a secret
section that violates §7.4.

---

## 8. Carriers

### 8.1 Deep link

```text
agentconfig://import?v=1&bundle=<base64url(JSON envelope)>
```

- Scheme MUST be exactly `agentconfig` and host MUST be exactly `import`.
- Query `v` MUST be present, supported, and match the decoded envelope `v`.
- `bundle` MUST be valid base64url and no longer than 20,000 characters.
- Decoded JSON MUST be at most 1,000,000 UTF-8 bytes.
- Larger bundles use `.acfg` files.

### 8.2 File

- Extension: `.acfg`
- MIME type: `application/x-agentconfig+json`
- Content: raw envelope JSON, pretty or minified.

### 8.3 Authorization callback

```text
agentconfig://auth/callback?code=<authorization_code>&state=<state>
```

- Used by OAuth2/OIDC authorization-code flows as a desktop callback.
- Clients MUST verify `state` before exchanging `code`.
- This route carries no bundle and is handled separately from `host=import`.
- Resulting tokens are stored in `secrets[<provider>].oauth`.

---

## 9. Import flow

1. Receive an `agentconfig://` URL or `.acfg` file.
2. Enforce encoded and decoded size limits before expensive processing.
3. Parse the envelope; reject an unexpected scheme, host, schema, or version.
4. Validate public entries and preserve unknown fields.
5. Read `trust` and display the public preview, including model context, type,
   generation modes, custom parameter keys, MCP names, and required env keys.
6. If `payload.alg` is encrypted, validate PBKDF2 parameters before prompting
   for a password and invoking the KDF.
7. Decode/decrypt and schema-validate the Secret Section.
8. Enforce trust/credential rules before displaying or applying credentials.
9. Diff against local configuration.
10. Apply only after explicit user confirmation. Deep links MUST NOT silently
    mutate client configuration.

---

## 10. Security model

| Rule | Rationale |
|---|---|
| `shared` bundles never carry credentials. | Prevents accidental credential leakage. |
| `self`/`managed` credentials require password encryption. | Protects credentials if a bundle leaks. |
| AES-GCM is authenticated encryption. | Detects tampering and incorrect passwords. |
| PBKDF2 work is bounded from 100,000 to 1,000,000 iterations. | Resists brute force while preventing attacker-controlled CPU exhaustion. |
| Canonical base64, salt, IV, tag, URL version, and size are validated before use. | Rejects malformed and resource-exhaustion inputs early. |
| Import requires preview, diff, and consent. | Prevents silent deep-link reconfiguration. |
| Browser UI writes untrusted data with text-only DOM APIs. | Prevents bundle-controlled DOM injection. |
| GitHub Actions are pinned to immutable commit SHAs. | Reduces CI supply-chain risk. |
| `hint` never contains the password. | Hints are plaintext metadata. |

### Threats considered

- **Leaked shared bundle:** no provider credentials are present.
- **Leaked self/managed bundle:** credentials are encrypted; password quality
  remains important.
- **Malicious deep link:** strict carrier validation, size limits, schema checks,
  and explicit consent prevent silent changes and bound parser work.
- **Trust downgrade:** a shared bundle that reveals credentials is rejected.
- **Resource exhaustion:** oversized JSON and excessive PBKDF2 iterations are
  rejected before expensive work.
- **DOM injection:** decoded labels, trust strings, capabilities, and errors are
  rendered as text rather than interpreted markup.

---

## 11. Capability negotiation

Known capability names are `mcp`, `models`, `skills`, `prompts`, `agents`, and
`resources`. New producers may add more names. Importers preserve unknown names
and skip sections they do not implement.

---

## 12. Versioning

- Envelope `v` changes only for incompatible envelope changes.
- Additive public fields such as v1.4 model metadata do not require an envelope
  bump because unknown fields are preserved.
- New encryption algorithms add discriminated `alg` variants.
- PBKDF2 iterations can change in-band only within the supported bounds.
- New trust values require a specification revision; clients that cannot safely
  interpret a trust value MUST refuse automatic credential handling.

---

## 13. Reference implementation

The TypeScript schema, codec, Node cryptography helpers, CLI, tests, and browser
implementation live in this repository. The CLI provides:

```text
agentconfig validate <file-or-url>
agentconfig encode <config.json> [options]
agentconfig decode <file-or-url> [options]
```

The CLI supports `--password-env <NAME>` so automation can avoid putting a
password directly in command arguments.

---

## 14. Open questions

1. Should custom-scheme conflicts be resolved through a manifest?
2. Should managed bundles support origin signatures such as Ed25519?
3. Should the format support per-field encryption granularity?
4. What rotation/revocation mechanism should managed credentials use?
5. Should future revisions add explicit input/output modality arrays (including
   audio) in addition to `modelType` and media generation modes?

---

## 15. Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-08-06 | 1.0-draft | Initial public draft. |
| 2026-08-07 | 1.1-draft | Renamed the format to AgentConfig Bundle; added `agentconfig://`, `.acfg`, trust modes, credentials, and producer/importer rules. |
| 2026-08-07 | 1.2-draft | Added free-form OAuth/OIDC credential transport with common fields and `extra`. |
| 2026-08-07 | 1.3-draft | Added `agentconfig://auth/callback` and OIDC `issuer`, `clientId`, and `redirectUri` fields. |
| 2026-08-18 | 1.4-draft | Added model context windows, output limits, text/multimodal/image/video model types, image/video generation modes, and JSON custom parameters. Hardened trust enforcement, parser size/base64 checks, PBKDF2 bounds, browser rendering, CLI password handling, tests, and CI action pinning. |
