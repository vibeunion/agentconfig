import Type, { type Static, type TProperties, type TSchema } from 'typebox';
import Value from 'typebox/value';

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

export const AcbTrustMode = { Self: 'self', Shared: 'shared', Managed: 'managed' } as const;
export type AcbTrustMode = typeof AcbTrustMode[keyof typeof AcbTrustMode];

export const AcbCapability = {
  Mcp: 'mcp', Models: 'models', Skills: 'skills', Prompts: 'prompts',
  Agents: 'agents', Resources: 'resources',
} as const;
export type KnownAcbCapability = typeof AcbCapability[keyof typeof AcbCapability];
/** Known capability values plus forward-compatible values from newer producers. */
export type AcbCapability = KnownAcbCapability | (string & {});

export const AcbModelType = {
  Text: 'text', Multimodal: 'multimodal',
  ImageGeneration: 'image-generation', VideoGeneration: 'video-generation',
} as const;
export type AcbModelType = typeof AcbModelType[keyof typeof AcbModelType];

export const AcbModelGenerationMode = {
  TextToImage: 'text-to-image', ImageToImage: 'image-to-image',
  TextToVideo: 'text-to-video', ImageToVideo: 'image-to-video',
} as const;
export type AcbModelGenerationMode =
  typeof AcbModelGenerationMode[keyof typeof AcbModelGenerationMode];

export type JsonValue =
  | string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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
    if (value.length > MODEL_PARAMETER_MAX_ENTRIES) return false;
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index) || !isJsonValue(value[index], depth + 1)) return false;
    }
    return true;
  }
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MODEL_PARAMETER_MAX_ENTRIES && entries.every(([key, item]) =>
    key.length > 0 && key.length <= 128 && isJsonValue(item, depth + 1),
  );
};

// The explicit refinement runs on Unknown, before any recursive schema traversal.
// This safely rejects cyclic/deep JavaScript inputs as well as non-JSON values.
// Unsafe only supplies the static JsonValue type; the refinement proves it at runtime.
const JsonValueSchema = Type.Refine(
  Type.Unsafe<JsonValue>(Type.Unknown()),
  (value) => isJsonValue(value),
  () => 'Custom model parameters must contain only finite JSON values with bounded depth',
);
const RecordKeySchema = Type.String({ pattern: '^[\\s\\S]*$' });
const stringRecord = () => Type.Record(RecordKeySchema, Type.String());

// Intersect with an open record to retain extension fields in both runtime data
// and inferred types. Type.Object alone does not infer its additional properties.
const openObject = <P extends TProperties>(properties: P, options: { default?: unknown } = {}) =>
  Type.Intersect([
    Type.Object(properties, { additionalProperties: true }),
    Type.Record(RecordKeySchema, Type.Unknown()),
  ], options);
const defaulted = <T extends TSchema>(schema: T, value: Static<T>): T =>
  Type.Clone(schema, { default: value });
const optional = Type.Optional;
const positiveInteger = () => Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const urlString = () => Type.Refine(
  Type.String(),
  (value) => { try { new URL(value); return true; } catch { return false; } },
  () => 'Invalid URL',
);

export const ModelParametersSchema = Type.Refine(
  Type.Record(RecordKeySchema, JsonValueSchema, {
    propertyNames: { type: 'string', minLength: 1, maxLength: 128 },
    maxProperties: MODEL_PARAMETER_MAX_ENTRIES,
  }),
  (value) => isPlainObject(value),
  () => 'Custom model parameters must be a plain JSON object',
);
export const AcbTrustModeSchema = Type.Union([
  Type.Literal(AcbTrustMode.Self), Type.Literal(AcbTrustMode.Shared), Type.Literal(AcbTrustMode.Managed),
]);
export const AcbCapabilitySchema = Type.String({ minLength: 1, maxLength: 64 });
export const AcbModelTypeSchema = Type.Union([
  Type.Literal(AcbModelType.Text), Type.Literal(AcbModelType.Multimodal),
  Type.Literal(AcbModelType.ImageGeneration), Type.Literal(AcbModelType.VideoGeneration),
]);
export const AcbModelGenerationModeSchema = Type.Union([
  Type.Literal(AcbModelGenerationMode.TextToImage), Type.Literal(AcbModelGenerationMode.ImageToImage),
  Type.Literal(AcbModelGenerationMode.TextToVideo), Type.Literal(AcbModelGenerationMode.ImageToVideo),
]);
const McpTransportSchema = Type.Union([
  Type.Literal('stdio'), Type.Literal('sse'), Type.Literal('http'),
]);

export const McpEntryPublicSchema = openObject({
  name: Type.String({ minLength: 1, maxLength: 64 }),
  enabled: defaulted(Type.Boolean(), true),
  transport: McpTransportSchema,
  command: optional(Type.String()),
  args: defaulted(Type.Array(Type.String()), []),
  envKeys: defaulted(Type.Array(Type.String({ minLength: 1, maxLength: 128 })), []),
  registryId: optional(Type.String()),
  repoUrl: optional(urlString()),
  description: optional(Type.String({ maxLength: 200 })),
});

const IMAGE_GENERATION_MODES = new Set<AcbModelGenerationMode>([
  AcbModelGenerationMode.TextToImage, AcbModelGenerationMode.ImageToImage,
]);
const VIDEO_GENERATION_MODES = new Set<AcbModelGenerationMode>([
  AcbModelGenerationMode.TextToVideo, AcbModelGenerationMode.ImageToVideo,
]);
const ModelEntryShape = openObject({
  provider: Type.String({ minLength: 1, maxLength: 64 }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  alias: optional(Type.String({ maxLength: 64 })),
  /** Legacy maximum-token field retained for v1 compatibility. */
  maxTokens: optional(positiveInteger()),
  contextWindow: optional(positiveInteger()),
  maxOutputTokens: optional(positiveInteger()),
  modelType: optional(AcbModelTypeSchema),
  generationModes: optional(Type.Array(AcbModelGenerationModeSchema, { maxItems: 8 })),
  parameters: optional(ModelParametersSchema),
});
const modelIssues = (model: Static<typeof ModelEntryShape>): string[] => {
  const issues: string[] = [];
  const contextLimit = model.contextWindow ?? model.maxTokens;
  if (contextLimit !== undefined && model.maxOutputTokens !== undefined && model.maxOutputTokens > contextLimit) {
    issues.push('maxOutputTokens cannot exceed contextWindow (or legacy maxTokens)');
  }
  if (model.modelType === AcbModelType.ImageGeneration) {
    const invalidMode = model.generationModes?.find((mode) => !IMAGE_GENERATION_MODES.has(mode));
    if (invalidMode) issues.push(`image-generation models cannot declare generation mode "${invalidMode}"`);
  }
  if (model.modelType === AcbModelType.VideoGeneration) {
    const invalidMode = model.generationModes?.find((mode) => !VIDEO_GENERATION_MODES.has(mode));
    if (invalidMode) issues.push(`video-generation models cannot declare generation mode "${invalidMode}"`);
  }
  if (model.modelType === AcbModelType.Text && model.generationModes && model.generationModes.length > 0) {
    issues.push('text models cannot declare image/video generation modes');
  }
  return issues;
};
export const ModelEntryPublicSchema = Type.Refine(
  ModelEntryShape,
  (model) => modelIssues(model).length === 0,
  (model) => modelIssues(model).join('; '),
);
export const SkillEntryPublicSchema = openObject({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  enabled: defaulted(Type.Boolean(), true),
  order: optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
});
export const PromptEntryPublicSchema = openObject({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  title: optional(Type.String({ maxLength: 80 })),
});
export const AgentEntryPublicSchema = openObject({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  name: optional(Type.String({ maxLength: 80 })),
  model: optional(Type.String({ maxLength: 128 })),
  skillIds: defaulted(Type.Array(Type.String({ minLength: 1, maxLength: 64 })), []),
});
export const ResourceEntryPublicSchema = openObject({
  uri: Type.String({ minLength: 1, maxLength: 256 }),
  name: optional(Type.String({ maxLength: 80 })),
  mimeType: optional(Type.String({ maxLength: 128 })),
});
export const BundlePublicSchema = openObject({
  mcp: defaulted(Type.Array(McpEntryPublicSchema), []),
  models: defaulted(Type.Array(ModelEntryPublicSchema), []),
  skills: defaulted(Type.Array(SkillEntryPublicSchema), []),
  prompts: defaulted(Type.Array(PromptEntryPublicSchema), []),
  agents: defaulted(Type.Array(AgentEntryPublicSchema), []),
  resources: defaulted(Type.Array(ResourceEntryPublicSchema), []),
}, { default: { mcp: [], models: [], skills: [], prompts: [], agents: [], resources: [] } });

export const OAuthCredentialSchema = openObject({
  type: Type.String({ minLength: 1, maxLength: 32 }),
  accessToken: optional(Type.String()), refreshToken: optional(Type.String()),
  idToken: optional(Type.String()), expired: optional(Type.String()),
  accountId: optional(Type.String()), email: optional(Type.String()),
  scope: optional(Type.String()), issuer: optional(urlString()),
  clientId: optional(Type.String({ maxLength: 256 })), redirectUri: optional(urlString()),
  extra: defaulted(Type.Record(RecordKeySchema, Type.Unknown()), {}),
});
export const ProviderSecretSchema = openObject({
  apiKey: optional(Type.String()),
  env: defaulted(stringRecord(), {}),
  headers: defaulted(stringRecord(), {}),
  oauth: optional(OAuthCredentialSchema),
});
export const BundleSecretSchema = openObject({
  endpoints: defaulted(stringRecord(), {}),
  customPrompts: defaulted(stringRecord(), {}),
  providerHints: defaulted(Type.Array(openObject({
    provider: Type.String(), baseUrl: optional(Type.String()),
  })), []),
  secrets: defaulted(Type.Record(RecordKeySchema, ProviderSecretSchema), {}),
}, { default: { endpoints: {}, customPrompts: {}, providerHints: [], secrets: {} } });
export const EncryptionParamsSchema = openObject({
  alg: Type.Literal(AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm),
  iterations: Type.Integer({ minimum: ACB_PBKDF2_MIN_ITERATIONS, maximum: ACB_PBKDF2_MAX_ITERATIONS }),
  salt: Type.String({ minLength: 1 }), iv: Type.String({ minLength: 1 }), ct: Type.String({ minLength: 1 }),
});
export const PlainParamsSchema = openObject({
  alg: Type.Literal(AcbEncryptionAlgorithm.None), ct: Type.String(),
});
export const PayloadEnvelopeSchema = Type.Union([EncryptionParamsSchema, PlainParamsSchema]);
export const ConfigBundleSchema = openObject({
  schema: Type.Literal(ACB_SCHEMA_ID), v: Type.Literal(ACB_VERSION),
  created: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  label: optional(Type.String({ maxLength: 80 })),
  src: optional(Type.String({ maxLength: 32 })),
  trust: defaulted(AcbTrustModeSchema, AcbTrustMode.Shared),
  capabilities: defaulted(Type.Array(AcbCapabilitySchema), []),
  hint: optional(Type.String({ maxLength: 80 })),
  payload: PayloadEnvelopeSchema, pub: BundlePublicSchema,
});

export type McpEntryPublic = Static<typeof McpEntryPublicSchema>;
export type ModelEntryPublic = Static<typeof ModelEntryPublicSchema>;
export type SkillEntryPublic = Static<typeof SkillEntryPublicSchema>;
export type PromptEntryPublic = Static<typeof PromptEntryPublicSchema>;
export type AgentEntryPublic = Static<typeof AgentEntryPublicSchema>;
export type ResourceEntryPublic = Static<typeof ResourceEntryPublicSchema>;
export type OAuthCredential = Static<typeof OAuthCredentialSchema>;
export type ProviderSecret = Static<typeof ProviderSecretSchema>;
export type BundlePublic = Static<typeof BundlePublicSchema>;
export type BundleSecret = Static<typeof BundleSecretSchema>;
export type EncryptionParams = Static<typeof EncryptionParamsSchema>;
export type PlainParams = Static<typeof PlainParamsSchema>;
export type PayloadEnvelope = Static<typeof PayloadEnvelopeSchema>;
export type ConfigBundle = Static<typeof ConfigBundleSchema>;

// Schemas describe normalized output. Input aliases make only defaulted fields
// optional, including defaults nested inside arrays and provider records.
type DefaultInput<T, K extends keyof T, D extends keyof T> =
  Pick<T, K> & Partial<Pick<T, D>> & Record<string, unknown>;
export type McpEntryPublicInput = DefaultInput<McpEntryPublic,
  'name' | 'transport' | 'command' | 'registryId' | 'repoUrl' | 'description',
  'enabled' | 'args' | 'envKeys'>;
export type ModelEntryPublicInput = ModelEntryPublic;
export type SkillEntryPublicInput = DefaultInput<SkillEntryPublic, 'id' | 'order', 'enabled'>;
export type PromptEntryPublicInput = PromptEntryPublic;
export type AgentEntryPublicInput = DefaultInput<AgentEntryPublic, 'id' | 'name' | 'model', 'skillIds'>;
export type ResourceEntryPublicInput = ResourceEntryPublic;
export type OAuthCredentialInput = DefaultInput<OAuthCredential,
  'type' | 'accessToken' | 'refreshToken' | 'idToken' | 'expired' | 'accountId' |
  'email' | 'scope' | 'issuer' | 'clientId' | 'redirectUri', 'extra'>;
export type ProviderSecretInput = Pick<ProviderSecret, 'apiKey'> & {
  env?: Record<string, string>; headers?: Record<string, string>; oauth?: OAuthCredentialInput;
} & Record<string, unknown>;
export type BundlePublicInput = ({
  mcp?: McpEntryPublicInput[]; models?: ModelEntryPublicInput[];
  skills?: SkillEntryPublicInput[]; prompts?: PromptEntryPublicInput[];
  agents?: AgentEntryPublicInput[]; resources?: ResourceEntryPublicInput[];
} & Record<string, unknown>) | undefined;
export type BundleSecretInput = ({
  endpoints?: Record<string, string>; customPrompts?: Record<string, string>;
  providerHints?: BundleSecret['providerHints']; secrets?: Record<string, ProviderSecretInput>;
} & Record<string, unknown>) | undefined;
export type ConfigBundleInput = Pick<ConfigBundle,
  'schema' | 'v' | 'created' | 'label' | 'src' | 'hint' | 'payload'> & {
  trust?: AcbTrustMode; capabilities?: string[]; pub?: BundlePublicInput;
} & Record<string, unknown>;

export interface SchemaValidationIssue {
  readonly code: string;
  readonly path: readonly string[];
  readonly message: string;
}
export class SchemaValidationError extends Error {
  readonly issues: readonly SchemaValidationIssue[];
  constructor(issues: readonly SchemaValidationIssue[]) {
    super(issues.map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`).join('; '));
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

/**
 * Apply only declared defaults on a copy of schema-owned containers. Do not use
 * Value.Parse: its conversion/cleaning pipeline would change the v1 contract.
 * Unknown extension data is preserved without recursively walking it. In
 * particular, bounded parameter refinements see original cyclic/non-JSON input.
 */
const normalizeDefaults = (schema: TSchema, input: unknown): unknown => {
  const value = input === undefined && Object.hasOwn(schema, 'default')
    ? Value.Clone(schema.default) : input;
  if (Type.IsIntersect(schema)) {
    return schema.allOf.reduce<unknown>((result, member) => normalizeDefaults(member, result), value);
  }
  if (Type.IsUnion(schema)) {
    for (const member of schema.anyOf) {
      const candidate = normalizeDefaults(member, value);
      if (Value.Check(member, candidate)) return candidate;
    }
    return value;
  }
  if (Type.IsArray(schema) && Array.isArray(value)) {
    return value.map((item) => normalizeDefaults(schema.items, item));
  }
  if ((Type.IsObject(schema) || Type.IsRecord(schema)) && isPlainObject(value)) {
    const result: Record<string, unknown> = { ...value };
    const set = (key: string, item: unknown) => Object.defineProperty(result, key, {
      value: item, writable: true, enumerable: true, configurable: true,
    });
    if (Type.IsObject(schema)) {
      for (const [key, property] of Object.entries(schema.properties)) {
        const item = normalizeDefaults(property, Object.hasOwn(value, key) ? value[key] : undefined);
        if (item !== undefined) set(key, item);
        else if (Type.IsOptional(property)) delete result[key];
      }
    } else if (Type.IsRecord(schema)) {
      for (const [pattern, property] of Object.entries(schema.patternProperties)) {
        const regex = new RegExp(pattern);
        for (const key of Object.keys(value)) {
          if (regex.test(key)) set(key, normalizeDefaults(property, value[key]));
        }
      }
    }
    return result;
  }
  return value;
};

/** Parse an AgentConfig TypeBox schema without coercing or deleting extension fields. */
export const parseSchema = <T extends TSchema>(schema: T, input: unknown): Static<T> => {
  const value = normalizeDefaults(schema, input);
  if (Value.Check(schema, value)) return value;
  throw new SchemaValidationError(Value.Errors(schema, value).map((error) => ({
    code: error.keyword,
    path: error.instancePath === '' ? [] : error.instancePath.slice(1).split('/').map(
      (part) => part.replace(/~1/g, '/').replace(/~0/g, '~'),
    ),
    message: error.message,
  })));
};
export type SchemaParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: SchemaValidationError };
export const safeParseSchema = <T extends TSchema>(schema: T, input: unknown): SchemaParseResult<Static<T>> => {
  try { return { success: true, data: parseSchema(schema, input) }; }
  catch (error) {
    if (error instanceof SchemaValidationError) return { success: false, error };
    throw error;
  }
};
