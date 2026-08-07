import { z } from 'zod';

export const ACB_VERSION = 1;
export const ACB_SCHEMA_ID = 'agentconfig-bundle';
export const ACB_DEEP_LINK_MAX_BYTES = 20000;
export const ACB_DEEP_LINK_SCHEME = 'agentconfig';
export const ACB_FILE_EXTENSION = '.acfg';
export const ACB_MIME_TYPE = 'application/x-agentconfig+json';

export const AcbEncryptionAlgorithm = {
  Pbkdf2Sha256Aes256Gcm: 'PBKDF2-SHA256-AES-256-GCM',
  None: 'none',
} as const;
export type AcbEncryptionAlgorithm =
  typeof AcbEncryptionAlgorithm[keyof typeof AcbEncryptionAlgorithm];

export const ACB_PBKDF2_MIN_ITERATIONS = 100000;

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
export type AcbCapability = typeof AcbCapability[keyof typeof AcbCapability];

const McpTransportSchema = z.enum(['stdio', 'sse', 'http']);

export const McpEntryPublicSchema = z.object({
  name: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  transport: McpTransportSchema,
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  envKeys: z.array(z.string().min(1).max(128)).default([]),
  registryId: z.string().optional(),
  repoUrl: z.string().url().optional(),
  description: z.string().max(200).optional(),
});

export const ModelEntryPublicSchema = z.object({
  provider: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
  alias: z.string().max(64).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const SkillEntryPublicSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).optional(),
});

export const PromptEntryPublicSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(80).optional(),
});

export const AgentEntryPublicSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80).optional(),
  model: z.string().max(128).optional(),
  skillIds: z.array(z.string().min(1).max(64)).default([]),
});

export const ResourceEntryPublicSchema = z.object({
  uri: z.string().min(1).max(256),
  name: z.string().max(80).optional(),
  mimeType: z.string().max(128).optional(),
});

export const BundlePublicSchema = z
  .object({
    mcp: z.array(McpEntryPublicSchema).default([]),
    models: z.array(ModelEntryPublicSchema).default([]),
    skills: z.array(SkillEntryPublicSchema).default([]),
    prompts: z.array(PromptEntryPublicSchema).default([]),
    agents: z.array(AgentEntryPublicSchema).default([]),
    resources: z.array(ResourceEntryPublicSchema).default([]),
  })
  .default({});

export const OAuthCredentialSchema = z.object({
  type: z.string().min(1).max(32),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
  expired: z.string().optional(),
  accountId: z.string().optional(),
  email: z.string().optional(),
  scope: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).default({}),
});

const ProviderSecretSchema = z.object({
  apiKey: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  oauth: OAuthCredentialSchema.optional(),
});

export const BundleSecretSchema = z
  .object({
    endpoints: z.record(z.string(), z.string()).default({}),
    customPrompts: z.record(z.string(), z.string()).default({}),
    providerHints: z
      .array(
        z.object({
          provider: z.string(),
          baseUrl: z.string().optional(),
        }),
      )
      .default([]),
    secrets: z.record(z.string(), ProviderSecretSchema).default({}),
  })
  .default({});

export const EncryptionParamsSchema = z.object({
  alg: z.literal(AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm),
  iterations: z.number().int().min(ACB_PBKDF2_MIN_ITERATIONS),
  salt: z.string(),
  iv: z.string(),
  ct: z.string(),
});

export const PlainParamsSchema = z.object({
  alg: z.literal(AcbEncryptionAlgorithm.None),
  ct: z.string(),
});

export const PayloadEnvelopeSchema = z.discriminatedUnion('alg', [
  EncryptionParamsSchema,
  PlainParamsSchema,
]);

const trustValues = Object.values(AcbTrustMode) as [AcbTrustMode, ...AcbTrustMode[]];
const capabilityValues = Object.values(AcbCapability) as [AcbCapability, ...AcbCapability[]];

export const ConfigBundleSchema = z.object({
  schema: z.literal(ACB_SCHEMA_ID),
  v: z.literal(ACB_VERSION),
  created: z.number().int().nonnegative(),
  label: z.string().max(80).optional(),
  src: z.string().max(32).optional(),
  trust: z.enum(trustValues).default(AcbTrustMode.Shared),
  capabilities: z.array(z.enum(capabilityValues)).default([]),
  hint: z.string().max(80).optional(),
  payload: PayloadEnvelopeSchema,
  pub: BundlePublicSchema,
});

export type McpEntryPublic = z.infer<typeof McpEntryPublicSchema>;
export type ModelEntryPublic = z.infer<typeof ModelEntryPublicSchema>;
export type SkillEntryPublic = z.infer<typeof SkillEntryPublicSchema>;
export type PromptEntryPublic = z.infer<typeof PromptEntryPublicSchema>;
export type AgentEntryPublic = z.infer<typeof AgentEntryPublicSchema>;
export type ResourceEntryPublic = z.infer<typeof ResourceEntryPublicSchema>;
export type OAuthCredential = z.infer<typeof OAuthCredentialSchema>;
export type ProviderSecret = z.infer<typeof ProviderSecretSchema>;
export type BundlePublic = z.infer<typeof BundlePublicSchema>;
export type BundleSecret = z.infer<typeof BundleSecretSchema>;
export type EncryptionParams = z.infer<typeof EncryptionParamsSchema>;
export type PlainParams = z.infer<typeof PlainParamsSchema>;
export type PayloadEnvelope = z.infer<typeof PayloadEnvelopeSchema>;
export type ConfigBundle = z.infer<typeof ConfigBundleSchema>;
