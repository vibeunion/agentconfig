import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const root = new URL('../../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;

describe('schema dependency boundary', () => {
  it('uses TypeBox 1.x without direct or locked Zod packages', () => {
    const core = readJson('packages/core/package.json') as Manifest;
    expect(core.dependencies?.typebox).toMatch(/1\./);
    const manifests = [readJson('package.json') as Manifest];
    for (const directory of readdirSync(new URL('packages/', root), { withFileTypes: true })) {
      if (directory.isDirectory()) manifests.push(readJson(`packages/${directory.name}/package.json`) as Manifest);
    }
    for (const manifest of manifests) {
      for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        expect(Object.keys(manifest[group] ?? {}).filter((name) => name === 'zod' || name.startsWith('zod/'))).toEqual([]);
      }
    }
    const lock = readJson('package-lock.json') as { packages: Record<string, { version?: string }> };
    expect(lock.packages['node_modules/typebox']?.version).toMatch(/^1\./);
    expect(Object.keys(lock.packages).filter((path) => /(^|\/)node_modules\/zod$/.test(path))).toEqual([]);
  });

  it('contains no Zod runtime imports or schema.parse calls in production TypeScript', () => {
    for (const name of readdirSync(new URL('./', import.meta.url))) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"]zod(?:\/[^'"]*)?['"]/);
      expect(source).not.toMatch(/\b\w+Schema\.(?:parse|safeParse)\(/);
    }
  });
});
