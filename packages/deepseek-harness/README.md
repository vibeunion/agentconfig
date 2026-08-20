# @agentconfig/deepseek-harness

Official DeepSeek test and evaluation harness plugin for AgentConfig Bundle.

## Features

- **Model Presets**: Pre-configured presets for `deepseek-chat` (DeepSeek-V3), `deepseek-reasoner` (DeepSeek-R1), and `deepseek-coder`.
- **Bundle Integration**: Generate and decrypt encrypted AgentConfig bundles for DeepSeek agent configurations.
- **Harness & Benchmark**: Execute agent prompts, MCP tool calls, reasoning traces (`reasoning_content`), and automated test suites against DeepSeek models.
- **Offline / Mock Testing**: Built-in mock injection for deterministic CI and unit tests.

## Installation

```bash
npm install @agentconfig/deepseek-harness @agentconfig/core
```

## Quick Start

### 1. Create a DeepSeek Bundle

```ts
import { encryptWithPassword, bundleToDeepLink } from '@agentconfig/core';
import { createDeepSeekBundle } from '@agentconfig/deepseek-harness';

const bundle = await createDeepSeekBundle({
  apiKey: process.env.DEEPSEEK_API_KEY,
  models: ['deepseek-chat', 'deepseek-reasoner'],
  systemPrompt: 'You are an expert AI software engineer.',
  password: 'bundle-password',
  encrypt: encryptWithPassword,
});

const deepLink = bundleToDeepLink(bundle);
console.log('Deep Link:', deepLink);
```

### 2. Run Test Harness from a Bundle

```ts
import { decryptWithPassword, extractBundleFromDeepLink } from '@agentconfig/core';
import { DeepSeekHarness } from '@agentconfig/deepseek-harness';

const bundle = extractBundleFromDeepLink(deepLink);
const harness = await DeepSeekHarness.fromBundle(
  bundle,
  'bundle-password',
  decryptWithPassword,
);

const result = await harness.runTask({
  prompt: 'Solve 2x + 5 = 15',
  model: 'deepseek-reasoner',
});

console.log('Reasoning:', result.reasoningContent);
console.log('Output:', result.content);
console.log('Tokens:', result.usage.totalTokens);
```

### 3. Run an Evaluation Test Suite

```ts
const suiteResult = await harness.runTestSuite([
  {
    id: 'case-1',
    name: 'Arithmetic reasoning check',
    input: { prompt: 'What is 15 * 14?' },
    expectedContains: ['210'],
  },
]);

console.log(`Passed: ${suiteResult.passed}/${suiteResult.total}`);
```
