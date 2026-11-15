import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bundleToDeepLink, bundleToFileString, decryptWithPassword,
  extractBundleFromDeepLink, parseBundleFromFileString, revealSecret,
  BundleSecretSchema, safeParseSchema,
} from './index.js';

const vector = readFileSync(new URL('../../../examples/vectors/v1.5.acfg', import.meta.url), 'utf8');
const expectedSecret = JSON.parse(readFileSync(new URL('../../../examples/vectors/v1.5-secret.json', import.meta.url), 'utf8'));

describe('shared SDK vectors', () => {
  it('preserves Draft v1.5 fields and unknown extensions through both carriers', async () => {
    const bundle = parseBundleFromFileString(vector);
    expect(bundle.pub.agents[0].promptId).toBe('researcher-instructions');
    for (const imported of [parseBundleFromFileString(bundleToFileString(bundle)), extractBundleFromDeepLink(bundleToDeepLink(bundle))]) {
      expect(imported).toEqual(bundle);
      const secret = await revealSecret(imported, 'agentconfig-v1.5-test', decryptWithPassword);
      expect(secret).toMatchObject(expectedSecret);
      expect(secret.secrets.remote.url).toBe('https://mcp.example.com/sse');
      expect(secret.secrets.remote.oauth?.extra).toEqual({ vendor: true });
    }
  });
});


describe('shared HTTP URL cases', () => {
  const cases = JSON.parse(readFileSync(new URL('../../../examples/vectors/v1.5-urls.json', import.meta.url), 'utf8')) as Record<string, string[]>;
  for (const [category, endpoints] of Object.entries(cases)) {
    for (const endpoint of endpoints) {
      it(`${category}: ${endpoint}`, () => {
        const parsed = safeParseSchema(BundleSecretSchema, { secrets: { remote: { url: endpoint } } });
        expect(parsed.success).toBe(category === 'valid');
      });
    }
  }
});
