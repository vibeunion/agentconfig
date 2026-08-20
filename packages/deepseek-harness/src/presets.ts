import { AcbModelType, type ModelEntryPublicInput } from '@agentconfig/core';

export const DEEPSEEK_PROVIDER_ID = 'deepseek';
export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_BETA_BASE_URL = 'https://api.deepseek.com/beta';

export interface DeepSeekModelMetadata {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  modelType: AcbModelType;
  supportsThinking: boolean;
  supportsToolCalling: boolean;
  pricingPerMillionPromptTokens?: number;
  pricingPerMillionCompletionTokens?: number;
}

export const DEEPSEEK_MODELS: Record<string, DeepSeekModelMetadata> = {
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3',
    description: 'DeepSeek-V3 flagship general chat model with fast throughput and tool calling support.',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    modelType: AcbModelType.Text,
    supportsThinking: false,
    supportsToolCalling: true,
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1',
    description: 'DeepSeek-R1 reasoning model with deep chain-of-thought and thinking tokens.',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    modelType: AcbModelType.Text,
    supportsThinking: true,
    supportsToolCalling: true,
  },
  'deepseek-coder': {
    id: 'deepseek-coder',
    name: 'DeepSeek-Coder',
    description: 'DeepSeek specialized code generation and completion model.',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    modelType: AcbModelType.Text,
    supportsThinking: false,
    supportsToolCalling: true,
  },
};

export const getDeepSeekModelEntry = (modelId = 'deepseek-chat'): ModelEntryPublicInput => {
  const meta = DEEPSEEK_MODELS[modelId] ?? {
    id: modelId,
    name: modelId,
    description: 'DeepSeek Model',
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    modelType: AcbModelType.Text,
    supportsThinking: modelId.includes('reasoner') || modelId.includes('r1'),
    supportsToolCalling: true,
  };

  return {
    provider: DEEPSEEK_PROVIDER_ID,
    id: meta.id,
    alias: meta.id === 'deepseek-reasoner' ? 'r1' : meta.id === 'deepseek-chat' ? 'v3' : meta.id,
    contextWindow: meta.contextWindow,
    maxOutputTokens: meta.maxOutputTokens,
    modelType: meta.modelType,
    parameters: meta.supportsThinking ? { reasoning_effort: 'medium' } : undefined,
  };
};
