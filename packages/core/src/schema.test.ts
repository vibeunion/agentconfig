import { describe, expect, expectTypeOf, it } from 'vitest';
import Value from 'typebox/value';
import {
  ACB_SCHEMA_ID, ACB_VERSION, ACB_PBKDF2_MIN_ITERATIONS, ACB_PBKDF2_MAX_ITERATIONS,
  AcbTrustMode, AcbTrustModeSchema, AgentEntryPublicSchema, BundlePublicSchema,
  BundleSecretSchema, ConfigBundleSchema, McpEntryPublicSchema, ModelEntryPublicSchema,
  ModelParametersSchema, OAuthCredentialSchema, PayloadEnvelopeSchema,
  SchemaValidationError, SkillEntryPublicSchema, parseSchema, safeParseSchema,
  type BundlePublic, type BundlePublicInput, type BundleSecretInput,
  type ConfigBundleInput, type McpEntryPublicInput,
} from './index.js';

const model = { provider: 'example', id: 'example-model' };
const envelope = { alg: 'none', ct: '' };

describe('native TypeBox migration', () => {
  it('exports native schemas without parser-shaped compatibility methods', () => {
    expect('parse' in ModelEntryPublicSchema).toBe(false);
    expect(Value.Check(ModelEntryPublicSchema, model)).toBe(true);
    expect(Value.Check(ModelEntryPublicSchema, { ...model, contextWindow: '4096' })).toBe(false);
    expect(JSON.parse(JSON.stringify(ConfigBundleSchema))).toHaveProperty('allOf');
  });

  it('fills defaults through arrays, records and nested OAuth credentials', () => {
    const input: BundlePublicInput = {
      mcp: [{ name: 'local', transport: 'stdio' }], skills: [{ id: 'skill' }], agents: [{ id: 'agent' }],
    };
    const parsed = parseSchema(BundlePublicSchema, input);
    expect(parsed.mcp[0]).toMatchObject({ enabled: true, args: [], envKeys: [] });
    expect(parsed.skills[0].enabled).toBe(true);
    expect(parsed.agents[0].skillIds).toEqual([]);
    expect(parsed.models).toEqual([]);
    const secret: BundleSecretInput = { secrets: { example: { oauth: { type: 'oauth2' } } } };
    const normalized = parseSchema(BundleSecretSchema, secret);
    expect(normalized.secrets.example).toMatchObject({ env: {}, headers: {}, oauth: { extra: {} } });
    expect(normalized.endpoints).toEqual({});
    expectTypeOf(parsed).toEqualTypeOf<BundlePublic>();
    expectTypeOf(parsed.mcp[0].enabled).toEqualTypeOf<boolean>();
  });

  it('keeps input defaults optional while preserving required fields and output types', () => {
    const mcp: McpEntryPublicInput = { name: 'local', transport: 'stdio' };
    expect(parseSchema(McpEntryPublicSchema, mcp).enabled).toBe(true);
    // @ts-expect-error transport remains required in input
    const missingTransport: McpEntryPublicInput = { name: 'local' };
    expect(missingTransport.name).toBe('local');
    const input: ConfigBundleInput = {
      schema: ACB_SCHEMA_ID, v: ACB_VERSION, created: 1, payload: { alg: 'none', ct: '' },
    };
    const parsed = parseSchema(ConfigBundleSchema, input);
    expect(parsed.trust).toBe(AcbTrustMode.Shared);
    expect(parsed.capabilities).toEqual([]);
    expect(parsed.pub.models).toEqual([]);
  });

  it('does not mutate inputs, including frozen nested containers', () => {
    const entry = Object.freeze({ name: 'local', transport: 'stdio' });
    const input = Object.freeze({ mcp: Object.freeze([entry]) });
    const first = parseSchema(BundlePublicSchema, input);
    const second = parseSchema(BundlePublicSchema, input);
    first.mcp[0].args.push('changed');
    first.models.push(model);
    expect(input.mcp[0]).not.toHaveProperty('args');
    expect(second.mcp[0].args).toEqual([]);
    expect(second.models).toEqual([]);
    const empty = parseSchema(BundlePublicSchema, undefined);
    empty.models.push(model);
    expect(parseSchema(BundlePublicSchema, undefined).models).toEqual([]);
  });

  it('preserves false, empty values and forward-compatible extension fields', () => {
    const parsed = parseSchema(ConfigBundleSchema, {
      schema: ACB_SCHEMA_ID, v: ACB_VERSION, created: 0, payload: { ...envelope, future: true },
      capabilities: ['future-capability'], topLevel: { retained: true },
      pub: { future: true, mcp: [{ name: 'local', transport: 'stdio', enabled: false, custom: 1 }] },
    });
    expect(parsed.topLevel).toEqual({ retained: true });
    expect(parsed.payload.future).toBe(true);
    expect(parsed.pub.future).toBe(true);
    expect(parsed.pub.mcp[0].enabled).toBe(false);
    expect(parsed.pub.mcp[0].custom).toBe(1);
    expect(parsed.capabilities).toEqual(['future-capability']);
  });

  it.each([
    [BundlePublicSchema, null], [BundlePublicSchema, { models: null }],
    [BundleSecretSchema, { secrets: null }], [AcbTrustModeSchema, 'invalid'],
    [McpEntryPublicSchema, { name: 'local', transport: 'stdio', enabled: 'true' }],
    [McpEntryPublicSchema, { name: 'local', transport: 'stdio', enabled: null }],
    [AgentEntryPublicSchema, { id: 'agent', skillIds: null }],
    [SkillEntryPublicSchema, { id: 'skill', order: -1 }],
    [OAuthCredentialSchema, { type: 'oauth2', extra: null }],
  ])('rejects invalid values instead of converting, repairing or defaulting them (%#)', (schema, input) => {
    expect(() => parseSchema(schema, input)).toThrow(SchemaValidationError);
  });

  it('accepts explicit undefined only for optional/defaulted properties', () => {
    const parsed = parseSchema(McpEntryPublicSchema, {
      name: 'local', transport: 'stdio', enabled: undefined, command: undefined,
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.command).toBeUndefined();
    expect(() => parseSchema(McpEntryPublicSchema, { name: undefined, transport: 'stdio' })).toThrow();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '4096'])('rejects invalid token limits (%s)', (limit) => {
    expect(() => parseSchema(ModelEntryPublicSchema, { ...model, contextWindow: limit })).toThrow();
  });

  it('retains context fallback and model-generation compatibility constraints', () => {
    expect(() => parseSchema(ModelEntryPublicSchema, { ...model, maxTokens: 10, maxOutputTokens: 11 })).toThrow(/cannot exceed/);
    expect(() => parseSchema(ModelEntryPublicSchema, { ...model, modelType: 'text', generationModes: ['text-to-image'] })).toThrow(/text models/);
    expect(() => parseSchema(ModelEntryPublicSchema, { ...model, modelType: 'video-generation', generationModes: ['image-to-image'] })).toThrow(/video-generation/);
    expect(Value.Check(ModelEntryPublicSchema, { ...model, modelType: 'image-generation', generationModes: ['text-to-video'] })).toBe(false);
    expect(parseSchema(ModelEntryPublicSchema, { ...model, maxTokens: 10, contextWindow: 20, maxOutputTokens: 15 }).maxOutputTokens).toBe(15);
  });

  it.each([undefined, () => 1, BigInt(1), Symbol('x'), NaN, Infinity, new Date(), new Map(), new Set(), new Array(2)])(
    'rejects non-JSON parameter values (%#)', (value) => {
      expect(() => parseSchema(ModelParametersSchema, { value })).toThrow(SchemaValidationError);
    },
  );

  it('rejects cycles and excessive depth without overflowing the stack', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => parseSchema(ModelParametersSchema, { cycle })).toThrow(/JSON values/);
    expect(Value.Check(ModelParametersSchema, { cycle })).toBe(false);
    let nested: unknown = 0;
    for (let i = 0; i < 22; i++) nested = { child: nested };
    expect(() => parseSchema(ModelParametersSchema, { nested })).toThrow(/JSON values/);
  });

  it('bounds parameter keys and collection sizes at both root and nested levels', () => {
    for (const parameters of [
      { '': 1 }, { ['x'.repeat(129)]: 1 }, { nested: { '': 1 } },
      { nested: Array.from({ length: 1001 }, () => null) },
      Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`p${i}`, i])),
    ]) expect(() => parseSchema(ModelParametersSchema, parameters)).toThrow(SchemaValidationError);
    expect(parseSchema(ModelParametersSchema, { nested: { enabled: true, values: [null, 'x', 1] } })).toEqual({
      nested: { enabled: true, values: [null, 'x', 1] },
    });
  });

  it('validates record values even for keys containing newline characters', () => {
    expect(() => parseSchema(BundleSecretSchema, { endpoints: { 'a\nb': 1 } })).toThrow();
    expect(() => parseSchema(ModelParametersSchema, { 'a\nb': () => 1 })).toThrow();
  });

  it('keeps URL validation local to each schema and compatible with absolute URLs', () => {
    expect(parseSchema(McpEntryPublicSchema, { name: 'local', transport: 'http', repoUrl: 'https://example.com/repo' }).repoUrl).toBe('https://example.com/repo');
    for (const url of ['not a url', '/relative']) {
      expect(() => parseSchema(McpEntryPublicSchema, { name: 'local', transport: 'http', repoUrl: url })).toThrow(/URL/);
      expect(() => parseSchema(OAuthCredentialSchema, { type: 'oauth2', issuer: url })).toThrow(/URL/);
      expect(() => parseSchema(OAuthCredentialSchema, { type: 'oauth2', redirectUri: url })).toThrow(/URL/);
    }
  });

  it('validates discriminated payload branches and PBKDF2 iteration bounds', () => {
    const encrypted = { alg: 'PBKDF2-SHA256-AES-256-GCM', iterations: ACB_PBKDF2_MIN_ITERATIONS, salt: 's', iv: 'i', ct: 'c' };
    expect(parseSchema(PayloadEnvelopeSchema, encrypted).alg).toBe(encrypted.alg);
    expect(parseSchema(PayloadEnvelopeSchema, envelope).alg).toBe('none');
    for (const input of [
      { alg: 'unsupported', ct: '' }, { ...encrypted, salt: '' },
      { ...encrypted, iterations: ACB_PBKDF2_MIN_ITERATIONS - 1 },
      { ...encrypted, iterations: ACB_PBKDF2_MAX_ITERATIONS + 1 },
      { ...encrypted, iterations: '100000' },
    ]) expect(() => parseSchema(PayloadEnvelopeSchema, input)).toThrow(SchemaValidationError);
  });

  it('returns typed safe-parse results and useful issue paths without leaking values', () => {
    const success = safeParseSchema(BundlePublicSchema, {});
    expect(success.success).toBe(true);
    if (success.success) expectTypeOf(success.data.models).toEqualTypeOf<BundlePublic['models']>();
    const failure = safeParseSchema(BundleSecretSchema, { secrets: { example: { apiKey: 123456789 } } });
    expect(failure.success).toBe(false);
    if (!failure.success) {
      expect(failure.error).toBeInstanceOf(SchemaValidationError);
      expect(failure.error.issues.some((issue) => issue.path.join('.') === 'secrets.example.apiKey')).toBe(true);
      expect(failure.error.message).not.toContain('123456789');
    }
  });
});
