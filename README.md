# AgentConfig Bundle

A portable, optionally-encrypted format for sharing AI agent configurations
across desktop clients — MCP servers, model lists, skills, prompts, agents,
resources, and (when explicitly allowed) provider credentials.

> **Status:** Draft v1.4 — reference implementation under development.
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
- **Rich model metadata** — context windows, text/multimodal/image/video model
  types, image/video generation modes, and provider-specific JSON parameters.
- **Client-neutral** — capability negotiation; unknown fields are preserved and
  unknown capability names are ignored rather than rejected.
- **No new crypto** — bounded PBKDF2 + AES-256-GCM via platform crypto.

## Repository layout

```
spec/                 # specification (SPEC.md) + integration guide (INTEGRATION.md)
packages/core/        # schema + codec (TypeScript, framework-agnostic)
packages/cli/         # `agentconfig` CLI: validate / encode / decode
site/                 # online generator/parser (pure browser, Web Crypto)
examples/             # sample config.json files
```

## Quick start

```bash
git clone https://github.com/vibeunion/agentconfig.git
cd agentconfig
npm ci
npm run check

# validate an encoded bundle (file or URL)
node packages/cli/dist/index.js validate my.acfg

# encode the example into a deep link
node packages/cli/dist/index.js encode examples/config.json --as url

# encode a self backup (with synthetic example credentials)
export ACB_PASSWORD="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
node packages/cli/dist/index.js encode examples/config-self.json \
  --password-env ACB_PASSWORD --trust self --as file --out my.acfg

# decode a bundle back to JSON
node packages/cli/dist/index.js decode my.acfg \
  --password-env ACB_PASSWORD --reveal
```

Using `--password-env` avoids placing a password directly in shell history or
most process listings. `--password` remains available for interactive/manual
use.

## Model metadata

Each entry in `pub.models` remains backward-compatible with the original
`provider` / `id` / `alias` / `maxTokens` shape and can additionally include:

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

`modelType` accepts `text`, `multimodal`, `image-generation`, or
`video-generation`. Image models may declare `text-to-image` and
`image-to-image`; video models may declare `text-to-video` and
`image-to-video`. `parameters` accepts bounded, JSON-serializable provider
request defaults and is intentionally provider-neutral.

## Use as a library

```bash
npm install @agentconfig/core
```

```ts
import {
  AcbModelType,
  AcbTrustMode,
  buildBundle,
  encryptWithPassword,
} from '@agentconfig/core';

const bundle = await buildBundle({
  trust: AcbTrustMode.Self,
  pub: {
    models: [
      {
        provider: 'provider-a',
        id: 'model-x',
        contextWindow: 200_000,
        modelType: AcbModelType.Multimodal,
        parameters: { reasoningEffort: 'medium' },
      },
    ],
  },
  secret: {
    secrets: { 'provider-a': { apiKey: process.env.PROVIDER_API_KEY } },
  },
  password: process.env.ACB_PASSWORD,
  encrypt: encryptWithPassword,
});
```

## Trust modes

| Mode | Carries credentials? | Encrypted? | Use case |
|---|---|---|---|
| `shared` | never | optional | Sharing config with others |
| `self` | allowed | required if credentials | Personal backup / cross-device |
| `managed` | allowed | required if credentials | Enterprise IT push |

## Specification & integration

- [spec/SPEC.md](./spec/SPEC.md) — the format specification
- [spec/INTEGRATION.md](./spec/INTEGRATION.md) — multi-language integration guide (TS/Python/Go/Rust) with test vectors

## License

MIT
