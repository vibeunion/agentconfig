# AgentConfig Bundle

A portable, optionally-encrypted format for sharing AI agent configurations
across desktop clients — MCP servers, model lists, skills, prompts, agents,
resources, and (when explicitly allowed) provider credentials.

> **Status:** Draft v1.1 — reference implementation under development.

## Why

Today, sharing an "AI setup" between clients (Claude Desktop, Cursor, Volt,
Continue.dev, Cline, …) is painful and unsafe: people paste JSON with live
API keys into chat, or rebuild everything by hand. AgentConfig Bundle defines
one neutral, previewable, trust-aware format so any client can import or export
with a click.

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
site/                 # agentconfig.dev — online generator/parser
```

## Quick start

```bash
# install
npm install

# build core + cli
npm run build

# validate a bundle file
npx agentconfig validate ./my-setup.acfg

# encode a JSON config into a deep link
npx agentconfig encode ./config.json --password hunter2

# decode a deep link back to JSON
npx agentconfig decode 'agentconfig://import?v=1&bundle=...'
```

## Specification

See [spec/SPEC.md](./spec/SPEC.md).

## License

MIT
