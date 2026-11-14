import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACB_SCHEMA_ID,
  ACB_VERSION,
  AcbTrustMode,
  ConfigBundleSchema,
  parseSchema,
} from './schema.js';
import type { ConfigBundle } from './schema.js';
import {
  bundleSignatureState,
  canonicalSignatureInput,
  isUnverifiedManagedBundle,
} from './signature.js';
import { signBundle, verifyBundleSignature } from './nodeCrypto.js';

const keyPair = () => crypto.generateKeyPairSync('ed25519');
const exportPrivate = (key: crypto.KeyObject): string =>
  key.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const exportPublic = (key: crypto.KeyObject): string =>
  key.export({ format: 'der', type: 'spki' }).toString('base64');

const managed = (overrides: Partial<ConfigBundle> = {}): ConfigBundle => parseSchema(
  ConfigBundleSchema,
  {
    schema: ACB_SCHEMA_ID,
    v: ACB_VERSION,
    created: 1_787_210_000_000,
    label: 'Acme baseline',
    src: 'acme-config',
    trust: AcbTrustMode.Managed,
    capabilities: ['models'],
    payload: { alg: 'none', ct: '' },
    pub: { models: [{ provider: 'provider-a', id: 'model-x', enabled: true }] },
    ...overrides,
  },
);

describe('managed bundle signatures', () => {
  it('signs and verifies a canonical envelope', () => {
    const { privateKey, publicKey } = keyPair();
    const unsigned = managed();
    const signed = signBundle(
      { ...unsigned, sig: { alg: 'Ed25519', issuer: 'acme.example.com', keyId: 'acme-2026-11', value: '' } },
      exportPrivate(privateKey),
    );
    expect(signed.sig?.value).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    expect(verifyBundleSignature(signed, exportPublic(publicKey))).toBe(true);
  });

  it('canonicalizes key order and whitespace, so re-encoding does not break it', () => {
    const { privateKey, publicKey } = keyPair();
    const signed = signBundle(
      { ...managed(), sig: { alg: 'Ed25519', issuer: 'acme.example.com', keyId: 'k', value: '' } },
      exportPrivate(privateKey),
    );
    // 客户端把包重新序列化（改键序、加缩进）后签名仍然有效。
    const shuffled = JSON.parse(
      JSON.stringify({
        pub: { models: [Object.fromEntries(Object.entries(signed.pub.models[0]).reverse())] },
        payload: signed.payload,
        capabilities: signed.capabilities,
        trust: signed.trust,
        src: signed.src,
        label: signed.label,
        created: signed.created,
        v: signed.v,
        schema: signed.schema,
        sig: signed.sig,
      }),
    ) as ConfigBundle;
    expect(canonicalSignatureInput(shuffled)).toBe(canonicalSignatureInput(signed));
    expect(verifyBundleSignature(shuffled, exportPublic(publicKey))).toBe(true);
  });

  it('rejects a tampered public section or payload', () => {
    const { privateKey, publicKey } = keyPair();
    const signed = signBundle(
      { ...managed(), sig: { alg: 'Ed25519', issuer: 'acme.example.com', keyId: 'k', value: '' } },
      exportPrivate(privateKey),
    );
    const tamperedModel = {
      ...signed,
      pub: { ...signed.pub, models: [{ ...signed.pub.models[0], enabled: false }] },
    };
    expect(verifyBundleSignature(tamperedModel, exportPublic(publicKey))).toBe(false);
    const tamperedTrust = { ...signed, trust: AcbTrustMode.Self };
    expect(verifyBundleSignature(tamperedTrust, exportPublic(publicKey))).toBe(false);
    // 换一把公钥也不行。
    expect(verifyBundleSignature(signed, exportPublic(keyPair().publicKey))).toBe(false);
  });

  it('reports an unsigned managed bundle as unverified instead of throwing', () => {
    const unsigned = managed();
    expect(bundleSignatureState(unsigned)).toBe('unsigned');
    expect(isUnverifiedManagedBundle(unsigned)).toBe(true);
    const { publicKey } = keyPair();
    expect(verifyBundleSignature(unsigned, exportPublic(publicKey))).toBe(false);
    // self/shared 不需要签名，也不该被标成"未验证的企业包"。
    expect(isUnverifiedManagedBundle({ ...unsigned, trust: AcbTrustMode.Self })).toBe(false);
  });

  it('validates the signature envelope shape', () => {
    const shape = (sig: unknown) => () => parseSchema(ConfigBundleSchema, {
      schema: ACB_SCHEMA_ID, v: ACB_VERSION, created: 1, payload: { alg: 'none', ct: '' }, pub: {}, sig,
    });
    expect(shape({ alg: 'Ed25519', issuer: 'acme.example.com', keyId: 'k', value: 'AAAA' })()).toBeTruthy();
    expect(shape({ alg: 'RSA', issuer: 'acme.example.com', keyId: 'k', value: 'AAAA' })).toThrow(/alg/);
    expect(shape({ alg: 'Ed25519', issuer: '', keyId: 'k', value: 'AAAA' })).toThrow(/issuer/);
    expect(shape({ alg: 'Ed25519', issuer: 'acme.example.com', value: 'AAAA' })).toThrow(/keyId/);
  });
});