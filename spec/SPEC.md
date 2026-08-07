# ACB — AgentConfig Bundle Specification

**Status:** Draft v1.1 (2026-08-07)

**License:** MIT

---

## 1. Overview

ACB (AgentConfig Bundle) is a portable, optionally-encrypted format for sharing
AI agent configurations across desktop clients. A bundle can carry MCP servers,
model lists, skills, prompts, agents, resources, and (when explicitly allowed)
provider credentials such as API keys and MCP env values.

A bundle travels either as a **deep link URL** (`agentconfig://import?...`) for
lightweight sharing, or as a **`.acfg` file** for full backups. Both carriers
use the same JSON envelope, so parsers are carrier-agnostic.

### Goals

- **Client-neutral**: any agent-capable client can produce or consume a bundle,
  taking only the capabilities it understands and ignoring the rest.
- **Trust-aware**: three explicit trust modes tell the importer whether the
  bundle carries live credentials and how to treat them.
- **Previewable**: the public section is readable without a password, so a
  recipient can inspect a bundle before deciding to import.
- **Forward-compatible**: versioned envelope with capability discovery and
  upgradeable encryption parameters.

### Non-Goals

- Transporting binary assets (skill packages, icons). Use existing installers.
- Cross-device sync with conflict resolution. This is a one-shot import/export.
- Server-side storage. Pure peer-to-peer.

---

## 2. Conventions

- **Encoding**: JSON (UTF-8). Deep-link payloads are base64url-encoded JSON.
- **Base64**: standard base64 for encrypted blobs; base64url for URL segments.
- **Field names**: lowercase, camelCase.
- **Unknown fields**: parsers MUST preserve and ignore fields they do not
  recognize. This is required for forward compatibility.
- **Sizes**: clients SHOULD reject bundles whose decoded JSON exceeds 1 MB.

---

## 3. Envelope

```json
{
  "schema": "agentconfig-bundle",
  "v": 1,
  "created": 1786030654160,
  "label": "My work setup",
  "src": "any-client",
  "trust": "self",
  "capabilities": ["mcp", "models", "skills"],
  "hint": "Contains provider endpoints",
  "payload": { "alg": "...", "..." },
  "pub": { ... }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | `"agentconfig-bundle"` | yes | Identifies this format. |
| `v` | `1` | yes | Envelope version. This spec defines v1. |
| `created` | number | yes | Unix epoch ms when the bundle was produced. |
| `label` | string ≤80 | no | Human-readable name for display. |
| `src` | string ≤32 | no | Producing client identifier. Clients MUST NOT reject based on `src`. |
| `trust` | `"self"` \| `"shared"` \| `"managed"` | yes (default `shared`) | Trust mode. Governs whether secrets may be carried and how the importer treats them. See §7. |
| `capabilities` | string[] | yes | Declares which sections of `pub` are present. Clients MAY ignore capabilities they do not support. |
| `hint` | string ≤80 | no | Password hint (plaintext). MUST NOT contain the password. |
| `payload` | object | yes | Encryption envelope for the secret section. See §4. |
| `pub` | object | yes | Public, non-sensitive metadata. See §5. |

---

## 4. Payload Envelope (Secret Section)

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

- **KDF**: PBKDF2-HMAC-SHA256, `iterations >= 100000`.
- **Key**: 32 bytes (AES-256).
- **Cipher**: AES-256-GCM, 96-bit IV, 128-bit auth tag appended to ciphertext.
- `salt`, `iv`, `ct` are standard base64.
- Clients MUST refuse `iterations < 100000`.
- `iterations` is intentionally in-band so it can be raised over time without a
  version bump.

The plaintext inside `ct` is JSON matching the **Secret Section** (§6).

### 4.2 Plain (no password)

```json
{
  "alg": "none",
  "ct": "<base64 of UTF-8 JSON>"
}
```

`ct` is the base64 of the Secret Section JSON, unencrypted.

**MUST NOT** be used when `trust` is `self` or `managed` **and** the Secret
Section carries `secrets`. Producers MUST refuse to emit such a bundle; importers
MUST refuse to import it. See §7.4 for the enforcement rule.

---

## 5. Public Section (`pub`)

All arrays are optional and default to empty. Every sub-field is non-sensitive.

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

**`envKeys` vs `env`**:

- `envKeys` lists the **names** of environment variables the server needs.
- The actual `env` values live in the Secret Section `secrets[<name>].env`
  (only when `trust` permits), or are left empty for the importer to fill
  (in `shared` mode).

`transport` is one of `stdio | sse | http`. For `sse`/`http`, `command`/`args`
are omitted and the URL goes in the Secret Section under `endpoints`.

### 5.2 `models`

```json
{
  "provider": "provider-a",
  "id": "model-x",
  "alias": "x",
  "maxTokens": 200000
}
```

### 5.3 `skills`

```json
{ "id": "docx", "enabled": true, "order": 1 }
```

Skill *definitions* (code) are not transported — only enable state and order.
Importers map `id` to their own installed skills; unknown IDs are ignored.

### 5.4 `prompts`

```json
{ "id": "code-review", "title": "Code Review" }
```

Prompt bodies live in the Secret Section `customPrompts` map.

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
{ "uri": "file:///workspace/notes.md", "name": "Notes", "mimeType": "text/markdown" }
```

URIs are references only; content is not embedded.

---

## 6. Secret Section (inside `ct`)

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
    "provider-a": { "apiKey": "sk-..." },
    "github": {
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." },
      "headers": { "X-Custom": "..." }
    }
  }
}
```

| Field | Description |
|---|---|
| `endpoints` | Provider to API base URL. May contain private gateways; encrypted. |
| `customPrompts` | Prompt id to body. Encrypted because prompts may be proprietary. |
| `providerHints` | Extra per-provider metadata (baseUrl overrides, etc.). |
| `secrets` | Provider to credential bundle. **Only present when `trust` is `self` or `managed`.** See §7. |

### 6.1 `secrets[<provider>]`

| Sub-field | Description |
|---|---|
| `apiKey` | Provider API key. |
| `env` | MCP server env values, keyed by env var name. |
| `headers` | Extra HTTP headers for the provider endpoint. |
| `oauth` | OAuth/OIDC credential object. See §6.2. |

`secrets` is keyed by the same `provider` string used in `pub.models` and by
MCP server `name` (so a `github` MCP server's env lives under `secrets.github.env`).

---

### 6.2 `secrets[<provider>].oauth`

OAuth/OIDC credential. Used when a provider is accessed via OAuth login
(codex, antigravity, kimi, claude, etc.) rather than a static API key.
Designed for loose compatibility: free-form `type` + common fields lifted
out + `extra` escape hatch for vendor-specific fields.

```json
{
  "type": "codex",
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>",
  "idToken": "<jwt>",
  "expired": "2026-12-31T23:59:59+08:00",
  "accountId": "synthetic-account-id",
  "email": "synthetic@example.com",
  "scope": "openid email profile",
  "extra": {
    "codex_fast_mode": false,
    "disabled": false,
    "last_refresh": "2026-08-07T10:00:00+08:00"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `type` | yes | Credential type identifier, free-form string. Importers dispatch refresh logic by this value. Known values: `codex`/`antigravity`/`kimi`/`claude` etc.; clients may use any value. |
| `accessToken` | no | OAuth2 access token (usually a JWT). Common field, lifted out for generic handling. |
| `refreshToken` | no | OAuth2 refresh token, used to obtain a new access token. |
| `idToken` | no | OIDC id token, contains user identity claims. |
| `expired` | no | Access token expiry, ISO 8601 string. Importers use this to decide whether to refresh. |
| `accountId` | no | Account identifier. |
| `email` | no | User email, for display (non-sensitive). |
| `scope` | no | OAuth scope string. |
| `extra` | no | Vendor-specific fields escape hatch. The spec does not define these; clients store them opaquely. |

**Refresh protocols are out of scope for this spec** — each provider has its own
token endpoint, scope, and refresh flow. Importers dispatch by `type` to their
own refresh implementation. The spec only governs "carrying the credential",
not "how to refresh it".

### 6.2.1 OIDC standard fields

When `type` is `"oidc"` (or a provider-specific OIDC variant such as
`"supauth"`, `"google"`, `"azure"`), clients SHOULD populate these standard
fields alongside the common ones in §6.2:

| Field | Required | Description |
|---|---|---|
| `issuer` | no | OIDC issuer URL (e.g. `https://auth.example.com`). Used to reconstruct the OIDC client config. |
| `clientId` | no | OAuth2 `client_id` registered with the IdP. |
| `redirectUri` | no | The `agentconfig://auth/callback` URI used in the authorization code flow (see §8.3). |

These let an importer rebuild the OIDC client configuration without re-prompting
the user. `accessToken` / `refreshToken` / `idToken` / `expired` (from §6.2)
carry the actual tokens obtained via the §8.3 callback flow.

Providers using non-OIDC flows (e.g. device code, refresh-only) MAY omit these
fields and rely on `type` + `extra` for dispatch.

---
## 7. Trust Modes

`trust` is the single field that tells the importer how to treat credentials.

### 7.1 `shared` (default)

- **Purpose**: sharing a configuration with others without leaking credentials.
- **`secrets`**: MUST be absent or empty.
- **Importer behavior**: for each `envKey` in `pub.mcp`, prompt the user to fill
  their own value; do NOT auto-fill any credential.
- **Encryption**: optional. If no secrets are present, `alg: "none"` is allowed.

### 7.2 `self`

- **Purpose**: personal backup / cross-device sync for the same user.
- **`secrets`**: MAY be present, carrying live API keys and MCP env values.
- **Importer behavior**: write secrets directly into local config after password
  decrypt. Still show a diff and require confirmation.
- **Encryption**: REQUIRED (password) whenever `secrets` is non-empty. Producers
  refuse to emit plaintext `self` bundles with secrets.

### 7.3 `managed`

- **Purpose**: enterprise IT pushes a configuration (with credentials) to employees.
- **`secrets`**: MAY be present.
- **Importer behavior**: same as `self` for credential write, PLUS the importer
  SHOULD log the import event for audit and MAY require a second confirmation
  (e.g. SSO principal match) before applying.
- **Encryption**: REQUIRED (password) whenever `secrets` is non-empty.

### 7.4 Enforcement rule (producer)

A producer MUST reject the combination:

```
trust in {self, managed}  AND  secrets non-empty  AND  payload.alg == "none"
```

### 7.5 Enforcement rule (importer)

An importer MUST refuse a bundle where:

```
trust == "shared"  AND  secrets non-empty
```

(regardless of encryption — a `shared` bundle claiming to carry secrets is
malformed or malicious.)

---

## 8. Carriers

### 8.1 Deep Link

```
agentconfig://import?v=1&bundle=<base64url(JSON envelope)>
```

- Scheme `agentconfig` is reserved for this spec. The name matches the format
  identity so users recognize links and files as the same artifact family.
- Clients register as `agentconfig://` handlers. If the scheme is already
  claimed, clients MAY fall back to a private scheme but SHOULD emit
  `agentconfig://` first.
- `v` in the query is the **envelope** version (redundant with the JSON `v`,
  but lets routers reject unknown versions before decoding).
- Deep links MUST be <= 20000 chars (base64url). Larger bundles use files.
- Parsers MUST URL-decode the `bundle` value before base64url-decoding.

### 8.2 File

- Extension: `.acfg`
- MIME: `application/x-agentconfig+json`
- Content: the raw envelope JSON (pretty or minified).
- Clients register a file association so double-clicking imports.

### 8.3 Auth Callback

```
agentconfig://auth/callback?code=<authorization_code>&state=<state>
```

- Used by OAuth2/OIDC authorization code flow as the `redirect_uri`. The OS
  hands the callback to the desktop app registered as the `agentconfig://`
  handler.
- `code` is the authorization code; `state` is the CSRF token the client sent
  with the auth request. Clients MUST verify `state` matches.
- This route carries NO bundle — it only relays auth response parameters.
  Clients route `host === "auth"` to their OIDC handler, separate from the
  `host === "import"` bundle handler (§8.1).
- Auth servers (IdPs) add `agentconfig://auth/callback` to their allowed
  `redirect_uri` whitelist, same as any custom scheme.
- If `agentconfig://` is already claimed by another app, clients MAY fall back
  to a private scheme for auth only, but SHOULD emit `agentconfig://` first.
- Tokens obtained via this flow are stored in `secrets[<provider>].oauth`
  (§6.2) with `type: "oidc"` (or a provider-specific variant) and the standard
  fields from §6.2.1.

---

## 9. Import Flow

1. **Receive** an `agentconfig://` URL or `.acfg` file.
2. **Parse** the envelope; reject if `schema !== "agentconfig-bundle"` or `v` unknown.
3. **Read `trust`**: decide the credential policy (§7).
4. **Enforce**: reject malformed combinations per §7.4-7.5.
5. **Preview** the `pub` section — show models, MCP names, skill IDs, required
   `envKeys`, and the `trust` badge.
6. If `payload.alg !== "none"`, **prompt for password** (show `hint`).
7. **Decrypt** `ct` to get the Secret Section.
8. **Diff** against current local config; show what will change.
9. **User confirms**:
   - `shared`: importer creates empty placeholders for each `envKey` and prompts
     the user to fill them.
   - `self`/`managed`: importer writes decrypted secrets directly (after
     confirmation; `managed` also logs the event).
10. **Never** auto-import without explicit confirmation — deep links must not
    silently mutate config.

---

## 10. Security Model

| Rule | Rationale |
|---|---|
| `shared` bundles never carry secrets. | Prevents credential leakage when sharing. |
| `self`/`managed` bundles with secrets MUST be password-encrypted. | Protects credentials at rest if the bundle leaks. |
| Encrypted section uses AEAD (GCM). | Tamper detection; wrong password fails fast. |
| `iterations >= 100000` enforced. | Resists brute force if a bundle leaks. |
| Import requires explicit consent + diff. | Deep-link injection cannot silently reconfigure. |
| `hint` must not contain the password. | Hints travel in plaintext. |
| `managed` imports SHOULD be audited. | Enterprise accountability. |

### Threats considered

- **Leaked `shared` bundle**: no credentials present; only config metadata.
- **Leaked `self`/`managed` bundle**: encrypted blob exposed; PBKDF2 slows
  cracking. A weak password is the main risk — importers SHOULD warn if the
  user reuses a known-weak password (out of scope for the format itself).
- **Malicious deep link**: import requires confirmation and shows a diff, so a
  crafted link cannot silently add a malicious MCP server or inject a stolen
  key without the user seeing it.
- **Trust mismatch**: an attacker downgrades a `self` bundle to `shared` to
  hide that it carries secrets — but §7.5 rejects `shared` bundles with
  `secrets`, so the downgrade is caught. An attacker upgrades `shared` to
  `self` — harmless, since there are no secrets to write.

---

## 11. Capability Negotiation

`capabilities` declares which `pub` arrays are populated. A minimal client
may only understand `mcp` and ignore `skills`/`agents`. A full client
understands all.

Clients MUST NOT error on unrecognized capabilities — they simply skip them.

---

## 12. Versioning

- Envelope `v` bumps on breaking changes to the envelope shape.
- Encryption `alg` is a discriminated union; new algorithms add a new variant
  without bumping `v`.
- `iterations` can be raised in-band.
- New `trust` values require a minor spec revision; clients that don't know a
  value MUST treat the bundle as `shared` (safest default) and warn.

---

## 13. Reference Implementation

TypeScript schema and codec live at `packages/core/` in this repository.
A companion CLI (`agentconfig validate|encode|decode`) is provided at
`packages/cli/`.

---

## 14. Open Questions

1. Should `agentconfig://` scheme conflicts be resolved via a manifest or left
   to the OS?
2. Should `managed` bundles support an origin signature (e.g. Ed25519 over the
   envelope) so importers can verify the issuer without identity infra?
3. Per-field encryption granularity: allow sharing endpoints without revealing
   prompts?
4. Rotation/revocation story for `managed` secrets when an employee leaves?

---

## 15. Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-08-06 | 1.0-draft | Initial public draft. |
| 2026-08-07 | 1.1-draft | Renamed format to AgentConfig Bundle. Scheme `agentconfig://`, file extension `.acfg`. Added `trust` modes (`self`/`shared`/`managed`) and `secrets` in the Secret Section. Added producer/importer enforcement rules. |
| 2026-08-07 | 1.2-draft | Added `oauth` credential in `secrets[<provider>]` (§6.2) for OAuth/OIDC providers (codex/antigravity/kimi/claude). Free-form `type` + common fields + `extra` escape hatch. Refresh protocols out of scope. |
| 2026-08-07 | 1.3-draft | Added §8.3 `agentconfig://auth/callback` route for OIDC flows. Added §6.2.1 OIDC standard fields (issuer/clientId/redirectUri). |
