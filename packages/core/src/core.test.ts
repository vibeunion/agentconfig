import { describe, expect, it } from 'vitest';
import {
  ACB_MAX_BUNDLE_BYTES,
  ACB_PBKDF2_MAX_ITERATIONS,
  ACB_PBKDF2_MIN_ITERATIONS,
  ACB_SCHEMA_ID,
  ACB_VERSION,
  AcbEncryptionAlgorithm,
  AcbModelGenerationMode,
  AcbModelType,
  AcbTrustMode,
  BundlePublicSchema,
  ModelEntryPublicSchema,
  buildBundle,
  bundleToDeepLink,
  decryptWithPassword,
  encryptWithPassword,
  extractBundleFromDeepLink,
  parseBundle,
  parseBundleFromFileString,
  revealSecret,
} from './index.js';

const emptyPublic = {
  mcp: [],
  models: [],
  skills: [],
  prompts: [],
  agents: [],
  resources: [],
};

const plaintextBundle = (secret: unknown, trust = AcbTrustMode.Shared) => ({
  schema: ACB_SCHEMA_ID,
  v: ACB_VERSION,
  created: 1,
  trust,
  capabilities: [],
  payload: {
    alg: AcbEncryptionAlgorithm.None,
    ct: Buffer.from(JSON.stringify(secret), 'utf8').toString('base64'),
  },
  pub: emptyPublic,
});

describe('model metadata schema', () => {
  it('keeps legacy model entries valid', () => {
    const parsed = BundlePublicSchema.parse({
      models: [{ provider: 'provider-a', id: 'model-x', maxTokens: 200_000 }],
    });
    expect(parsed.models[0]).toMatchObject({
      provider: 'provider-a',
      id: 'model-x',
      maxTokens: 200_000,
    });
  });

  it('supports context, model kinds, generation modes, and custom parameters', () => {
    const parsed = ModelEntryPublicSchema.parse({
      provider: 'provider-media',
      id: 'video-x',
      alias: 'video',
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      modelType: AcbModelType.VideoGeneration,
      generationModes: [
        AcbModelGenerationMode.TextToVideo,
        AcbModelGenerationMode.ImageToVideo,
      ],
      parameters: {
        durationSeconds: 8,
        aspectRatio: '16:9',
        safety: { enabled: true, thresholds: [0.4, 0.8] },
      },
      futureField: 'preserved',
    });

    expect(parsed.contextWindow).toBe(128_000);
    expect(parsed.modelType).toBe(AcbModelType.VideoGeneration);
    expect(parsed.parameters?.durationSeconds).toBe(8);
    expect(parsed.futureField).toBe('preserved');
  });

  it('rejects inconsistent generation modes and non-JSON parameters', () => {
    expect(() =>
      ModelEntryPublicSchema.parse({
        provider: 'provider-media',
        id: 'image-x',
        modelType: AcbModelType.ImageGeneration,
        generationModes: [AcbModelGenerationMode.TextToVideo],
      }),
    ).toThrow(/image-generation/);

    expect(() =>
      ModelEntryPublicSchema.parse({
        provider: 'provider-a',
        id: 'model-x',
        parameters: { callback: () => undefined },
      }),
    ).toThrow(/JSON values/);
  });

  it('rejects output limits larger than the declared context', () => {
    expect(() =>
      ModelEntryPublicSchema.parse({
        provider: 'provider-a',
        id: 'model-x',
        contextWindow: 4_096,
        maxOutputTokens: 8_192,
      }),
    ).toThrow(/cannot exceed/);
  });
});

describe('bundle trust and crypto policy', () => {
  it('rejects credentials in shared bundles even when encrypted', async () => {
    await expect(
      buildBundle({
        trust: AcbTrustMode.Shared,
        pub: {},
        secret: { secrets: { 'provider-a': { apiKey: 'EXAMPLE_ONLY' } } },
        password: 'not-a-real-secret',
        encrypt: encryptWithPassword,
      }),
    ).rejects.toThrow(/shared/);
  });

  it('requires encryption for self bundles carrying credentials', async () => {
    await expect(
      buildBundle({
        trust: AcbTrustMode.Self,
        pub: {},
        secret: { secrets: { 'provider-a': { apiKey: 'EXAMPLE_ONLY' } } },
      }),
    ).rejects.toThrow(/password-encrypted/);
  });

  it('rejects a malicious plaintext shared bundle with credentials', () => {
    expect(() =>
      parseBundle(
        plaintextBundle({
          endpoints: {},
          customPrompts: {},
          providerHints: [],
          secrets: { 'provider-a': { apiKey: 'EXAMPLE_ONLY' } },
        }),
      ),
    ).toThrow(/shared/);
  });

  it('round-trips encrypted credentials and honors custom iterations', async () => {
    const bundle = await buildBundle({
      trust: AcbTrustMode.Self,
      pub: {
        models: [
          {
            provider: 'provider-a',
            id: 'model-x',
            contextWindow: 128_000,
            modelType: AcbModelType.Multimodal,
          },
        ],
      },
      secret: { secrets: { 'provider-a': { apiKey: 'EXAMPLE_ONLY' } } },
      password: 'not-a-real-secret',
      iterations: ACB_PBKDF2_MIN_ITERATIONS,
      encrypt: encryptWithPassword,
    });

    expect(bundle.payload.alg).toBe(AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm);
    if (bundle.payload.alg !== AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm) {
      throw new Error('expected encrypted payload');
    }
    expect(bundle.payload.iterations).toBe(ACB_PBKDF2_MIN_ITERATIONS);
    const secret = await revealSecret(bundle, 'not-a-real-secret', decryptWithPassword);
    expect(secret.secrets['provider-a']?.apiKey).toBe('EXAMPLE_ONLY');
  });

  it('bounds PBKDF2 work before invoking crypto', async () => {
    await expect(
      encryptWithPassword('{}', 'not-a-real-secret', ACB_PBKDF2_MAX_ITERATIONS + 1),
    ).rejects.toThrow(/iterations/);
  });
});

describe('carrier validation', () => {
  it('validates the deep-link version and protocol', async () => {
    const bundle = await buildBundle({ trust: AcbTrustMode.Shared, pub: {} });
    const link = bundleToDeepLink(bundle);
    expect(extractBundleFromDeepLink(link).schema).toBe(ACB_SCHEMA_ID);
    expect(() => extractBundleFromDeepLink(link.replace('?v=1', '?v=2'))).toThrow(
      /version/,
    );
    expect(() => extractBundleFromDeepLink(link.replace('agentconfig:', 'https:'))).toThrow(
      /scheme|host/,
    );
  });

  it('rejects files above the decoded bundle size limit', () => {
    const oversized = JSON.stringify({
      ...plaintextBundle({}),
      futurePayload: 'x'.repeat(ACB_MAX_BUNDLE_BYTES),
    });
    expect(() => parseBundleFromFileString(oversized)).toThrow(/maximum decoded size/);
  });
});
