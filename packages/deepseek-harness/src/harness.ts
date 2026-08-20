import type { ConfigBundle, BundlePasswordDecryptor } from '@agentconfig/core';
import { loadDeepSeekFromBundle } from './bundle.js';
import { DEEPSEEK_DEFAULT_BASE_URL } from './presets.js';

export interface HarnessMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface HarnessToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface HarnessTool {
  type: 'function';
  function: HarnessToolFunction;
}

export interface HarnessToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface HarnessTaskInput {
  prompt?: string;
  messages?: HarnessMessage[];
  model?: string;
  systemPrompt?: string;
  tools?: HarnessTool[];
  temperature?: number;
  maxTokens?: number;
}

export interface HarnessTokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface HarnessTaskResult {
  content: string;
  reasoningContent?: string;
  toolCalls?: HarnessToolCall[];
  usage: HarnessTokenUsage;
  latencyMs: number;
  model: string;
  rawResponse?: unknown;
}

export interface HarnessTestCase {
  id: string;
  name: string;
  input: HarnessTaskInput;
  expectedContains?: string[];
  expectedToolCalls?: string[];
  maxLatencyMs?: number;
  validator?: (result: HarnessTaskResult) => boolean | Promise<boolean>;
}

export interface HarnessTestResult {
  caseId: string;
  name: string;
  passed: boolean;
  error?: string;
  result?: HarnessTaskResult;
}

export interface HarnessSuiteResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: HarnessTestResult[];
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export interface DeepSeekHarnessOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultSystemPrompt?: string;
  customFetch?: FetchFunction;
}

export class DeepSeekHarness {
  private apiKey?: string;
  private baseUrl: string;
  private defaultModel: string;
  private defaultSystemPrompt?: string;
  private customFetch?: FetchFunction;

  constructor(options: DeepSeekHarnessOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? 'deepseek-chat';
    this.defaultSystemPrompt = options.defaultSystemPrompt;
    this.customFetch = options.customFetch;
  }

  public static async fromBundle(
    bundle: ConfigBundle,
    password?: string,
    decrypt?: BundlePasswordDecryptor,
    overrides: Partial<DeepSeekHarnessOptions> = {},
  ): Promise<DeepSeekHarness> {
    const config = await loadDeepSeekFromBundle(bundle, password, decrypt);
    return new DeepSeekHarness({
      apiKey: overrides.apiKey ?? config.apiKey,
      baseUrl: overrides.baseUrl ?? config.baseUrl,
      defaultModel: overrides.defaultModel ?? config.models[0] ?? 'deepseek-chat',
      defaultSystemPrompt: overrides.defaultSystemPrompt ?? config.systemPrompt,
      customFetch: overrides.customFetch,
    });
  }

  public async runTask(input: HarnessTaskInput): Promise<HarnessTaskResult> {
    const model = input.model ?? this.defaultModel;
    const systemPrompt = input.systemPrompt ?? this.defaultSystemPrompt;

    const messages: HarnessMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (input.messages && input.messages.length > 0) {
      messages.push(...input.messages);
    } else if (input.prompt) {
      messages.push({ role: 'user', content: input.prompt });
    } else {
      throw new Error('HarnessTaskInput requires either prompt or messages');
    }

    const payload: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
    };

    if (input.temperature !== undefined) payload.temperature = input.temperature;
    if (input.maxTokens !== undefined) payload.max_tokens = input.maxTokens;
    if (input.tools && input.tools.length > 0) payload.tools = input.tools;

    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const fetcher = this.customFetch ?? globalThis.fetch;
    if (!fetcher) {
      throw new Error('fetch is not available in the current environment');
    }

    const startTime = Date.now();
    const response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API request failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
        total_tokens?: number;
      };
      model?: string;
    };

    const choice = data.choices?.[0];
    const message = choice?.message;
    const content = message?.content ?? '';
    const reasoningContent = message?.reasoning_content;
    const toolCalls = message?.tool_calls;

    const usage: HarnessTokenUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
      totalTokens: data.usage?.total_tokens ?? (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
    };

    return {
      content,
      reasoningContent,
      toolCalls,
      usage,
      latencyMs,
      model: data.model ?? model,
      rawResponse: data,
    };
  }

  public async runTestSuite(testCases: HarnessTestCase[]): Promise<HarnessSuiteResult> {
    const startTime = Date.now();
    const results: HarnessTestResult[] = [];

    for (const testCase of testCases) {
      try {
        const result = await this.runTask(testCase.input);
        let passed = true;
        let error: string | undefined;

        if (testCase.expectedContains) {
          for (const needle of testCase.expectedContains) {
            if (!result.content.includes(needle) && !result.reasoningContent?.includes(needle)) {
              passed = false;
              error = `Expected output to contain "${needle}"`;
              break;
            }
          }
        }

        if (passed && testCase.expectedToolCalls) {
          const calledNames = (result.toolCalls ?? []).map((t) => t.function.name);
          for (const expectedTool of testCase.expectedToolCalls) {
            if (!calledNames.includes(expectedTool)) {
              passed = false;
              error = `Expected tool call "${expectedTool}", got [${calledNames.join(', ')}]`;
              break;
            }
          }
        }

        if (passed && testCase.maxLatencyMs && result.latencyMs > testCase.maxLatencyMs) {
          passed = false;
          error = `Latency exceeded (${result.latencyMs}ms > ${testCase.maxLatencyMs}ms)`;
        }

        if (passed && testCase.validator) {
          const valid = await testCase.validator(result);
          if (!valid) {
            passed = false;
            error = 'Custom validator returned false';
          }
        }

        results.push({
          caseId: testCase.id,
          name: testCase.name,
          passed,
          error,
          result,
        });
      } catch (err) {
        results.push({
          caseId: testCase.id,
          name: testCase.name,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    return {
      total: results.length,
      passed,
      failed,
      durationMs,
      results,
    };
  }
}
