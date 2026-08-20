import {
  AcbTrustMode,
  buildBundle,
  revealSecret,
  type ConfigBundle,
  type BundlePublicInput,
  type BundleSecretInput,
  type BundlePasswordEncryptor,
  type BundlePasswordDecryptor,
  type McpEntryPublicInput,
  type PromptEntryPublicInput,
  type SkillEntryPublicInput,
  type AgentEntryPublicInput,
} from '@agentconfig/core';
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_PROVIDER_ID,
  getDeepSeekModelEntry,
} from './presets.js';

export interface CreateDeepSeekBundleOptions {
  apiKey?: string;
  models?: string[];
  systemPrompt?: string;
  baseUrl?: string;
  mcp?: McpEntryPublicInput[];
  skills?: SkillEntryPublicInput[];
  prompts?: PromptEntryPublicInput[];
  agents?: AgentEntryPublicInput[];
  trust?: AcbTrustMode;
  password?: string;
  label?: string;
  encrypt?: BundlePasswordEncryptor;
}

export const createDeepSeekBundle = async (
  options: CreateDeepSeekBundleOptions = {},
): Promise<ConfigBundle> => {
  const modelIds = options.models ?? ['deepseek-chat', 'deepseek-reasoner'];
  const models = modelIds.map((id) => getDeepSeekModelEntry(id));
  const baseUrl = options.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL;

  const pub: BundlePublicInput = {
    models,
    mcp: options.mcp ?? [],
    skills: options.skills ?? [],
    prompts: options.prompts ?? (options.systemPrompt ? [{ id: 'default', title: 'System Prompt' }] : []),
    agents: options.agents ?? [],
    resources: [],
  };

  const secret: BundleSecretInput = {
    endpoints: {
      [DEEPSEEK_PROVIDER_ID]: baseUrl,
    },
    customPrompts: options.systemPrompt ? { default: options.systemPrompt } : {},
    providerHints: [
      {
        provider: DEEPSEEK_PROVIDER_ID,
        baseUrl,
      },
    ],
    secrets: options.apiKey
      ? {
          [DEEPSEEK_PROVIDER_ID]: {
            apiKey: options.apiKey,
          },
        }
      : {},
  };

  const trust = options.trust ?? (options.apiKey ? AcbTrustMode.Self : AcbTrustMode.Shared);

  return buildBundle({
    trust,
    label: options.label ?? 'DeepSeek Agent Configuration',
    src: 'deepseek-harness',
    pub,
    secret,
    password: options.password,
    encrypt: options.encrypt,
  });
};

export interface DeepSeekBundleConfig {
  apiKey?: string;
  baseUrl: string;
  models: string[];
  systemPrompt?: string;
  mcp: McpEntryPublicInput[];
  trust: string;
}

export const loadDeepSeekFromBundle = async (
  bundle: ConfigBundle,
  password?: string,
  decrypt?: BundlePasswordDecryptor,
): Promise<DeepSeekBundleConfig> => {
  let apiKey: string | undefined;
  let baseUrl = DEEPSEEK_DEFAULT_BASE_URL;
  let systemPrompt: string | undefined;

  if (decrypt && (bundle.payload.alg !== 'none' || password)) {
    const secret = await revealSecret(bundle, password ?? null, decrypt);
    apiKey = secret.secrets[DEEPSEEK_PROVIDER_ID]?.apiKey;
    if (secret.endpoints[DEEPSEEK_PROVIDER_ID]) {
      baseUrl = secret.endpoints[DEEPSEEK_PROVIDER_ID];
    }
    if (secret.customPrompts['default']) {
      systemPrompt = secret.customPrompts['default'];
    }
  } else if (bundle.payload.alg === 'none') {
    // If plaintext secret, reveal without password if no decrypt provided
    try {
      const plainSecret = JSON.parse(
        Buffer.from(bundle.payload.ct, 'base64').toString('utf8'),
      );
      apiKey = plainSecret.secrets?.[DEEPSEEK_PROVIDER_ID]?.apiKey;
      baseUrl = plainSecret.endpoints?.[DEEPSEEK_PROVIDER_ID] ?? baseUrl;
      systemPrompt = plainSecret.customPrompts?.['default'] ?? systemPrompt;
    } catch {
      // Ignored if malformed
    }
  }

  const models = bundle.pub.models
    .filter((m) => m.provider === DEEPSEEK_PROVIDER_ID || m.id.startsWith('deepseek'))
    .map((m) => m.id);

  return {
    apiKey,
    baseUrl,
    models: models.length > 0 ? models : ['deepseek-chat'],
    systemPrompt,
    mcp: bundle.pub.mcp,
    trust: bundle.trust,
  };
};
