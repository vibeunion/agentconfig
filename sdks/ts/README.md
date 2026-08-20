# AgentConfig TypeScript SDK

The official TypeScript SDK for AgentConfig Bundle is packaged as `@agentconfig/core`.

## Source

The source code is maintained in the [`packages/core`](../../packages/core) workspace.

## Installation

```bash
npm install @agentconfig/core
```

## Quick Start

```ts
import {
  AcbTrustMode,
  AcbModelType,
  buildBundle,
  bundleToDeepLink,
  extractBundleFromDeepLink,
  revealSecret,
  encryptWithPassword,
  decryptWithPassword,
} from '@agentconfig/core';

// Export an encrypted bundle
const bundle = await buildBundle({
  trust: AcbTrustMode.Self,
  pub: {
    models: [
      {
        provider: 'deepseek',
        id: 'deepseek-chat',
        contextWindow: 64_000,
        modelType: AcbModelType.Text,
      },
    ],
  },
  secret: {
    secrets: {
      deepseek: { apiKey: 'sk-...' },
    },
  },
  password: 'my-secure-password',
  encrypt: encryptWithPassword,
});

const url = bundleToDeepLink(bundle);
console.log('Deep link:', url);

// Import and decrypt
const imported = extractBundleFromDeepLink(url);
const secret = await revealSecret(imported, 'my-secure-password', decryptWithPassword);
console.log('API Key:', secret.secrets['deepseek']?.apiKey);
```
