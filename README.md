# AgentConfig Bundle

A portable, optionally-encrypted format for sharing AI agent configurations
across desktop clients — MCP servers, model lists, skills, prompts, agents,
resources, and (when explicitly allowed) provider credentials.

> **Status:** Draft v1.4 — reference implementation under development.
> **Try it online:** <https://vibeunion.github.io/agentconfig/>

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
- **Multi-language SDKs** — official SDKs for TypeScript, Python, Go, Rust, and Java.
- **DeepSeek Harness** — first-class test, evaluation, and execution harness plugin.

## Repository layout

```
spec/                     # specification (SPEC.md) + integration guide (INTEGRATION.md)
sdks/                     # multi-language SDKs
  ├── ts/                 # TypeScript SDK documentation (workspace @agentconfig/core)
  ├── python/             # Python SDK (agentconfig)
  ├── go/                 # Go SDK (github.com/vibeunion/agentconfig/sdks/go)
  ├── rust/               # Rust SDK (agentconfig crate)
  └── java/               # Java SDK (io.agentconfig:agentconfig Maven package)
packages/core/            # TypeScript core: schema + codec
packages/cli/             # `agentconfig` CLI: validate / encode / decode
packages/deepseek-harness/# DeepSeek test & evaluation harness plugin
site/                     # online generator/parser (pure browser, Web Crypto)
examples/                 # sample config.json files and verification vectors
```

## Official SDKs

| Language | Directory / Package | Installation |
|---|---|---|
| **TypeScript / JS** | [`sdks/ts`](sdks/ts), [`packages/core`](packages/core) | `npm install @agentconfig/core` |
| **Python** | [`sdks/python`](sdks/python) | `pip install agentconfig` |
| **Go** | [`sdks/go`](sdks/go) | `go get github.com/vibeunion/agentconfig/sdks/go` |
| **Rust** | [`sdks/rust`](sdks/rust) | `agentconfig = "0.1.0"` in `Cargo.toml` |
| **Java** | [`sdks/java`](sdks/java) | `io.agentconfig:agentconfig:0.1.0` in `pom.xml` |

## DeepSeek Harness Plugin

The DeepSeek test & evaluation harness plugin allows executing agent prompts,
validating tool calls, inspecting reasoning tokens (`reasoning_content`), and
running automated test suites directly against DeepSeek models using AgentConfig
bundles:

- **TypeScript:** `packages/deepseek-harness` (`@agentconfig/deepseek-harness`)
- **Python:** `agentconfig.plugins.deepseek_harness`

```ts
import { decryptWithPassword, extractBundleFromDeepLink } from '@agentconfig/core';
import { DeepSeekHarness } from '@agentconfig/deepseek-harness';

const bundle = extractBundleFromDeepLink('agentconfig://import?...');
const harness = await DeepSeekHarness.fromBundle(bundle, 'password', decryptWithPassword);

const result = await harness.runTask({
  prompt: 'Solve 2x + 5 = 15',
  model: 'deepseek-reasoner',
});

console.log('Reasoning:', result.reasoningContent);
console.log('Answer:', result.content);
```

## Development requirements

Building and testing this repository requires Node.js `^20.19.0`, `^22.12.0`,
or `>=24.0.0`, and Python `>=3.8`.

## Quick start (CLI)

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

## Trust modes

| Mode | Carries credentials? | Encrypted? | Use case |
|---|---|---|---|
| `shared` | never | optional | Sharing config with others |
| `self` | allowed | required if credentials | Personal backup / cross-device |
| `managed` | allowed | required if credentials | Enterprise IT push |

## Specification & integration

- [SPEC.md](spec/SPEC.md) — wire format and security rules.
- [INTEGRATION.md](spec/INTEGRATION.md) — multi-language client integration guide and canonical test vectors.

## License

MIT
