import { describe, expect, it } from 'vitest';
import {
  encryptWithPassword,
  decryptWithPassword,
  AcbTrustMode,
} from '@agentconfig/core';
import {
  DEEPSEEK_MODELS,
  createDeepSeekBundle,
  loadDeepSeekFromBundle,
  DeepSeekHarness,
  getDeepSeekModelEntry,
} from '../src/index.js';

describe('DeepSeek presets and models', () => {
  it('defines DeepSeek-V3 and DeepSeek-R1 correctly', () => {
    expect(DEEPSEEK_MODELS['deepseek-chat']).toBeDefined();
    expect(DEEPSEEK_MODELS['deepseek-chat']?.contextWindow).toBe(64_000);
    expect(DEEPSEEK_MODELS['deepseek-reasoner']?.supportsThinking).toBe(true);

    const modelEntry = getDeepSeekModelEntry('deepseek-reasoner');
    expect(modelEntry.id).toBe('deepseek-reasoner');
    expect(modelEntry.parameters?.reasoning_effort).toBe('medium');
  });
});

describe('DeepSeek AgentConfig bundle creation and loading', () => {
  it('creates and extracts encrypted DeepSeek bundle', async () => {
    const bundle = await createDeepSeekBundle({
      apiKey: 'sk-deepseek-test-key-123456',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      systemPrompt: 'You are a helpful coding assistant.',
      password: 'test-secure-password',
      encrypt: encryptWithPassword,
    });

    expect(bundle.trust).toBe(AcbTrustMode.Self);
    expect(bundle.payload.alg).toBe('PBKDF2-SHA256-AES-256-GCM');

    const config = await loadDeepSeekFromBundle(
      bundle,
      'test-secure-password',
      decryptWithPassword,
    );

    expect(config.apiKey).toBe('sk-deepseek-test-key-123456');
    expect(config.models).toContain('deepseek-chat');
    expect(config.models).toContain('deepseek-reasoner');
    expect(config.systemPrompt).toBe('You are a helpful coding assistant.');
  });
});

describe('DeepSeek Harness execution', () => {
  it('executes harness task with simulated/mock response', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'The answer is 42.',
                reasoning_content: 'Let me think: 6 * 7 = 42.',
              },
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 10,
            completion_tokens_details: { reasoning_tokens: 8 },
            total_tokens: 25,
          },
          model: 'deepseek-reasoner',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const harness = new DeepSeekHarness({
      apiKey: 'sk-test',
      defaultModel: 'deepseek-reasoner',
      customFetch: mockFetch,
    });

    const result = await harness.runTask({
      prompt: 'What is 6 times 7?',
    });

    expect(result.content).toBe('The answer is 42.');
    expect(result.reasoningContent).toContain('Let me think: 6 * 7 = 42.');
    expect(result.usage.totalTokens).toBe(25);
    expect(result.usage.reasoningTokens).toBe(8);
  });

  it('runs harness test suite and verifies assertions', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'The weather in Tokyo is sunny.',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: '{"city":"Tokyo"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
          model: 'deepseek-chat',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const harness = new DeepSeekHarness({
      apiKey: 'sk-test',
      customFetch: mockFetch,
    });

    const suite = await harness.runTestSuite([
      {
        id: 'test-1',
        name: 'Weather query with tool call',
        input: { prompt: 'What is the weather in Tokyo?' },
        expectedContains: ['Tokyo'],
        expectedToolCalls: ['get_weather'],
      },
    ]);

    expect(suite.total).toBe(1);
    expect(suite.passed).toBe(1);
    expect(suite.failed).toBe(0);
    expect(suite.results[0]?.passed).toBe(true);
  });
});
