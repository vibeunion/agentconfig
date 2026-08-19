import { z } from 'zod';

export const ACB_VERSION = 1;
export const ACB_SCHEMA_ID = 'agentconfig-bundle';
export const ACB_DEEP_LINK_MAX_BYTES = 20_000;
export const ACB_MAX_BUNDLE_BYTES = 1_000_000;
export const ACB_DEEP_LINK_SCHEME = 'agentconfig';
export const ACB_FILE_EXTENSION = '.acfg';
export const ACB_MIME_TYPE = 'application/x-agentconfig+json';

export const AcbEncryptionAlgorithm = {
  Pbkdf2Sha256Aes256Gcm: 'PBKDF2-SHA256-AES-256-GCM',
  None: 'none',
} as const;
export type AcbEncryptionAlgorithm =
  typeof AcbEncryptionAlgorithm[keyof typeof AcbEncryptionAlgorithm];

export const ACB_PBKDF2_MIN_ITERATIONS = 100_000;
export const ACB_PBKDF2_MAX_ITERATIONS = 1_000_000;

export const AcbTrustMode = {
  Self: 'self',
  Shared: 'shared',
  Managed: 'managed',
} as const;
export type AcbTrustMode = typeof AcbTrustMode[keyof typeof AcbTrustMode];

export const AcbCapability = {
  Mcp: 'mcp',
  Models: 'models',
  Skills: 'skills',
  Prompts: 'prompts',
  Agents: 'agents',
  Resources: 'resources',
} as const;
export type KnownAcbCapability = typeof AcbCapability[keyof typeof AcbCapability];
/** Known capability values plus forward-compatible values from newer producers. */
export type AcbCapability = KnownAcbCapability | (string & {});

export const AcbModelType = {
  Text: 'text',
  Multimodal: 'multimodal',
  ImageGeneration: 'image-generation',
  VideoGeneration: 'video-generation',
} as const;
export type AcbModelType = typeof AcbModelType[keyof typeof AcbModelType];

export const AcbModelGenerationMode = {
  TextToImage: 'text-to-image',
  ImageToImage: 'image-to-image',
  TextToVideo: 'text-to-video',
  ImageToVideo: 'image-to-video',
} as const;
export type AcbModelGenerationMode =
  typeof AcbModelGenerationMode[keyof typeof AcbModelGenerationMode];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const MODEL_PARAMETER_MAX_DEPTH = 20;
const MODEL_PARAMETER_MAX_ENTRIES = 1_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isJsonValue = (value: unknown, depth = 0): value is JsonValue => {
  if (depth > MODEL_PARAMETER_MAX_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return (
      value.length <= MODEL_PARAMETER_MAX_ENTRIES &&
      value.every((item) => isJsonValue(item, depth + 1))
    );
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MODEL_PARAMETER_MAX_ENTRIES &&
    entries.every(([key, item]) =>
      key.length > 0 && key.length <= 128 && isJsonValue(item, depth + 1),
    )
  );
};

export const ModelParametersSchema = z.record(
  z.string().min(1).max(128),
  z.custom<JsonValue>(
    (value) => isJsonValue(value),
    'Custom model parameters must contain only finite JSON values with bounded depth',
  ),
);

const trustValues = Object.values(AcbTrustMode) as [AcbTrustMode, ...AcbTrustMode[]];
const modelTypeValues = Object.values(AcbModelType) as [AcbModelType, ...AcbModelType[]];
const modelGenerationModeValues = Object.values(AcbModelGenerationMode) as [
  AcbModelGenerationMode,
  ...AcbModelGenerationMode[],
];

export const AcbTrustModeSchema = z.enum(trustValues);
export const AcbCapabilitySchema = z.string().min(1).max(64);
export const AcbModelTypeSchema = z.enum(modelTypeValues);
export const AcbModelGenerationModeSchema = z.enum(modelGenerationModeValues);

const McpTransportSchema = z.enum(['stdio', 'sse', 'http']);

export const McpEntryPublicSchema = z
  .object({
    name: z.string().min(1).max(64),
    enabled: z.boolean().default(true),
    transport: McpTransportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    envKeys: z.array(z.string().min(1).max(128)).default([]),
    registryId: z.string().optional(),
    repoUrl: z.string().url().optional(),
    description: z.string().max(200).optional(),
  })
  .passthrough();

const IMAGE_GENERATION_MODES = new Set<AcbModelGenerationMode>([
  AcbModelGenerationMode.TextToImage,
  AcbModelGenerationMode.ImageToImage,
]);
const VIDEO_GENERATION_MODES = new Set<AcbModelGenerationMode>([
  AcbModelGenerationMode.TextToVideo,
  AcbModelGenerationMode.ImageToVideo,
]);

export const ModelEntryPublicSchema = z
  .object({
    provider: z.string().min(1).max(64),
    id: z.string().min(1).max(128),
    alias: z.string().max(64).optional(),
    /** Legacy maximum-token field retained for v1 compatibility. */
    maxTokens: z.number().int().positive().optional(),
    /** Total model context window in tokens. */
    contextWindow: z.number().int().positive().optional(),
    /** Maximum output/completion tokens when the provider exposes it separately. */
    maxOutputTokens: z.number().int().positive().optional(),
    modelType: AcbModelTypeSchema.optional(),
    generationModes: z.array(AcbModelGenerationModeSchema).max(8).optional(),
    /** Provider-specific request defaults. Values must be JSON-serializable. */
    parameters: ModelParametersSchema.optional(),
  })
  .passthrough()
  .superRefine((model, ctx) => {
    const contextLimit = model.contextWindow ?? model.maxTokens;
    if (
      contextLimit !== undefined &&
      model.maxOutputTokens !== undefined &&
      model.maxOutputTokens > contextLimit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxOutputTokens'],
        message: 'maxOutputTokens cannot exceed contextWindow (or legacy maxTokens)',
      });
    }

    if (model.modelType === AcbModelType.ImageGeneration) {
      const invalidMode = model.generationModes?.find((mode) => !IMAGE_GENERATION_MODES.has(mode));
      if (invalidMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['generationModes'],
          message: `image-generation models cannot declare generation mode "${invalidMode}"`,
        });
      }
    }

    if (model.modelType === AcbModelType.VideoGeneration) {
      const invalidMode = model.generationModes?.find((mode) => !VIDEO_GENERATION_MODES.has(mode));
      if (invalidMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['generationModes'],
          message: `video-generation models cannot declare generation mode "${invalidMode}"`,
        });
      }
    }

    if (
      model.modelType === AcbModelType.Text &&
      model.generationModes !== undefined &&
      model.generationModes.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['generationModes'],
        message: 'text models cannot declare image/video generation modes',
      });
    }
  });

export const SkillEntryPublicSchema = z
  .object({
    id: z.string().min(1).max(64),
    enabled: z.boolean().default(true),
    order: z.number().int().min(0).optional(),
  })
  .passthrough();

export const PromptEntryPublicSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(80).optional(),
  })
  .passthrough();

export const AgentEntryPublicSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().max(80).optional(),
    model: z.string().max(128).optional(),
    skillIds: z.array(z.string().min(1).max(64)).default([]),
  })
  .passthrough();

export const ResourceEntryPublicSchema = z
  .object({
    uri: z.string().min(1).max(256),
    name: z.string().max(80).optional(),
    mimeType: z.string().max(128).optional(),
  })
  .passthrough();

export const BundlePublicSchema = z
  .object({
    mcp: z.array(McpEntryPublicSchema).default([]),
    models: z.array(ModelEntryPublicSchema).default([]),
    skills: z.array(SkillEntryPublicSchema).default([]),
    prompts: z.array(PromptEntryPublicSchema).default([]),
    agents: z.array(AgentEntryPublicSchema).default([]),
    resources: z.array(ResourceEntryPublicSchema).default([]),
  })
  .passthrough()
  .default({
    mcp: [],
    models: [],
    skills: [],
    prompts: [],
    agents: [],
    resources: [],
  });

export const OAuthCredentialSchema = z
  .object({
    type: z.string().min(1).max(32),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    idToken: z.string().optional(),
    expired: z.string().optional(),
    accountId: z.string().optional(),
    email: z.string().optional(),
    scope: z.string().optional(),
    issuer: z.string().url().optional(),
    clientId: z.string().max(256).optional(),
    redirectUri: z.string().url().optional(),
    extra: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const ProviderSecretSchema = z
  .object({
    apiKey: z.string().optional(),
    env: z.record(z.string(), z.string()).default({}),
    headers: z.record(z.string(), z.string()).default({}),
    oauth: OAuthCredentialSchema.optional(),
  })
  .passthrough();

export const BundleSecretSchema = z
  .object({
    endpoints: z.record(z.string(), z.string()).default({}),
    customPrompts: z.record(z.string(), z.string()).default({}),
    providerHints: z
      .array(
        z
          .object({
            provider: z.string(),
            baseUrl: z.string().optional(),
          })
          .passthrough(),
      )
      .default([]),
    secrets: z.record(z.string(), ProviderSecretSchema).default({}),
  })
  .passthrough()
  .default({
    endpoints: {},
    customPrompts: {},
    providerHints: [],
    secrets: {},
  });

export const EncryptionParamsSchema = z
  .object({
    alg: z.literal(AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm),
    iterations: z
      .number()
      .int()
      .min(ACB_PBKDF2_MIN_ITERATIONS)
      .max(ACB_PBKDF2_MAX_ITERATIONS),
    salt: z.string().min(1),
    iv: z.string().min(1),
    ct: z.string().min(1),
  })
  .passthrough();

export const PlainParamsSchema = z
  .object({
    alg: z.literal(AcbEncryptionAlgorithm.None),
    ct: z.string(),
  })
  .passthrough();

export const PayloadEnvelopeSchema = z.discriminatedUnion('alg', [
  EncryptionParamsSchema,
  PlainParamsSchema,
]);

export const ConfigBundleSchema = z
  .object({
    schema: z.literal(ACB_SCHEMA_ID),
    v: z.literal(ACB_VERSION),
    created: z.number().int().nonnegative(),
    label: z.string().max(80).optional(),
    src: z.string().max(32).optional(),
    trust: AcbTrustModeSchema.default(AcbTrustMode.Shared),
    capabilities: z.array(AcbCapabilitySchema).default([]),
    hint: z.string().max(80).optional(),
    payload: PayloadEnvelopeSchema,
    pub: BundlePublicSchema,
  })
  .passthrough();

export type McpEntryPublicInput = z.input<typeof McpEntryPublicSchema>;
export type McpEntryPublic = z.output<typeof McpEntryPublicSchema>;
export type ModelEntryPublicInput = z.input<typeof ModelEntryPublicSchema>;
export type ModelEntryPublic = z.output<typeof ModelEntryPublicSchema>;
export type SkillEntryPublicInput = z.input<typeof SkillEntryPublicSchema>;
export type SkillEntryPublic = z.output<typeof SkillEntryPublicSchema>;
export type PromptEntryPublicInput = z.input<typeof PromptEntryPublicSchema>;
export type PromptEntryPublic = z.output<typeof PromptEntryPublicSchema>;
export type AgentEntryPublicInput = z.input<typeof AgentEntryPublicSchema>;
export type AgentEntryPublic = z.output<typeof AgentEntryPublicSchema>;
export type ResourceEntryPublicInput = z.input<typeof ResourceEntryPublicSchema>;
export type ResourceEntryPublic = z.output<typeof ResourceEntryPublicSchema>;
export type OAuthCredentialInput = z.input<typeof OAuthCredentialSchema>;
export type OAuthCredential = z.output<typeof OAuthCredentialSchema>;
export type ProviderSecretInput = z.input<typeof ProviderSecretSchema>;
export type ProviderSecret = z.output<typeof ProviderSecretSchema>;
export type BundlePublicInput = z.input<typeof BundlePublicSchema>;
export type BundlePublic = z.output<typeof BundlePublicSchema>;
export type BundleSecretInput = z.input<typeof BundleSecretSchema>;
export type BundleSecret = z.output<typeof BundleSecretSchema>;
export type EncryptionParams = z.output<typeof EncryptionParamsSchema>;
export type PlainParams = z.output<typeof PlainParamsSchema>;
export type PayloadEnvelope = z.output<typeof PayloadEnvelopeSchema>;
export type ConfigBundleInput = z.input<typeof ConfigBundleSchema>;
export type ConfigBundle = z.output<typeof ConfigBundleSchema>;
