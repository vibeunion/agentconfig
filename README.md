# AgentConfig Bundle

A portable, optionally-encrypted format for sharing AI agent configurations
across desktop clients — MCP servers, model lists, skills, prompts, agents,
resources, and (when explicitly allowed) provider credentials.

> **Status:** Draft v1.1 — reference implementation under development.
> **Try it online:** <https://zuohuadong.github.io/agentconfig/>

## Why

Today, sharing an "AI setup" between clients is painful and unsafe: people
paste JSON with live API keys into chat, or rebuild everything by hand.
AgentConfig Bundle defines one neutral, previewable, trust-aware format so any
client can import or export with a click.

## Highlights

- **One URL or file** — `agentconfig://import?...` deep link or `.acfg` file.
- **Previewable** — the public section is readable without a password, so
  recipients can inspect before trusting.
- **Trust-aware** — `self` / `shared` / `managed` modes make credential
  handling explicit and safe.
- **Client-neutral** — capability negotiation; unknown sections are ignored,
  not rejected.
- **No new crypto** — PBKDF2 + AES-256-GCM via platform crypto.

## Repository layout

```
spec/                 # human-readable specification (SPEC.md)
packages/core/        # schema + codec (TypeScript, framework-agnostic)
packages/cli/         # `agentconfig` CLI: validate / encode / decode
site/                 # online generator/parser (pure browser, Web Crypto)
examples/             # sample config.json files
```

## Quick start

```bash
git clone https://github.com/zuohuadong/agentconfig.git
cd agentconfig
npm install
npm run build

# validate an encoded bundle (file or URL)
node packages/cli/dist/index.js validate my.acfg

# encode the example into a deep link
node packages/cli/dist/index.js encode examples/config.json --as url

# encode a self backup (with secrets) — password required
node packages/cli/dist/index.js encode examples/config-self.json \
  --password hunter2 --trust self --as file --out my.acfg

# decode a bundle back to JSON (reveal secret with password)
node packages/cli/dist/index.js decode my.acfg --password hunter2 --reveal
```

## Use as a library

```bash
npm install @agentconfig/core
```

```ts
import { buildBundle, parseBundle, encryptWithPassword } from '@agentconfig/core';

const bundle = await buildBundle({
  trust: 'self',
  pub: { mcp: [...], models: [...] },
  secret: { endpoints: {...}, secrets: { 'provider-a': { apiKey: 'sk-...' } } },
  password: 'hunter2',
  encrypt: encryptWithPassword,
});
```

## Trust modes

| Mode | Carries secrets? | Encrypted? | Use case |
|---|---|---|---|
| `shared` | never | optional | Sharing config with others |
| `self` | allowed | required if secrets | Personal backup / cross-device |
| `managed` | allowed | required if secrets | Enterprise IT push |

## Specification

See [spec/SPEC.md](./spec/SPEC.md).

## License

MIT
