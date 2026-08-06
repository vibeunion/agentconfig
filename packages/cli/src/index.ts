#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildBundle,
  parseBundleFromFileString,
  bundleToDeepLink,
  bundleToFileString,
  extractBundleFromDeepLink,
  revealSecret,
  isPasswordRequired,
  encryptWithPassword,
  decryptWithPassword,
  type BundleInput,
} from '@agentconfig/core';

const HELP = `AgentConfig Bundle CLI

Usage:
  agentconfig validate <file-or-url>         Validate a bundle (file path or agentconfig:// URL)
  agentconfig encode <config.json> [opts]    Encode a JSON config into a bundle
  agentconfig decode <file-or-url> [opts]    Decode a bundle back to JSON

Encode options:
  --password <pw>        Password-encrypt the secret section
  --trust <mode>         self | shared | managed (default: shared)
  --label <text>         Human-readable label
  --src <id>             Producing client id
  --out <file>           Write to file instead of stdout
  --as <url|file>        Output as deep-link URL or .acfg file (default: url)

Decode options:
  --password <pw>        Password to decrypt the secret section
  --reveal               Include the decrypted secret section in output

Examples:
  agentconfig validate ./setup.acfg
  agentconfig encode ./config.json --password hunter2 --trust self --as file --out setup.acfg
  agentconfig encode ./config.json --as url
  agentconfig decode 'agentconfig://import?v=1&bundle=...' --password hunter2 --reveal
`;

const readInput = (arg: string): string => {
  if (arg.startsWith('agentconfig://')) return arg;
  return readFileSync(resolve(arg), 'utf8');
};

const readConfigJson = (path: string): BundleInput => {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!raw || typeof raw !== 'object' || !('pub' in raw)) {
    throw new Error('Config JSON must have a "pub" field (the public section)');
  }
  return raw as BundleInput;
};

const print = (text: string, outFile?: string) => {
  if (outFile) {
    writeFileSync(resolve(outFile), text, 'utf8');
    console.error(`Written to ${outFile}`);
  } else {
    console.log(text);
  }
};

const cmdValidate = (target: string) => {
  try {
    let bundle;
    if (target.startsWith('agentconfig://')) {
      bundle = extractBundleFromDeepLink(target);
    } else {
      const text = readFileSync(resolve(target), 'utf8');
      bundle = parseBundleFromFileString(text);
    }
    const encrypted = isPasswordRequired(bundle);
    console.log('OK - valid AgentConfig Bundle');
    console.log(`  schema:        ${bundle.schema}`);
    console.log(`  version:       ${bundle.v}`);
    console.log(`  trust:         ${bundle.trust}`);
    console.log(`  capabilities:  ${bundle.capabilities.join(', ') || '(none)'}`);
    console.log(`  encrypted:     ${encrypted ? 'yes (' + bundle.payload.alg + ')' : 'no'}`);
    if (bundle.label) console.log(`  label:         ${bundle.label}`);
    if (bundle.hint) console.log(`  hint:          ${bundle.hint}`);
    const counts = {
      mcp: bundle.pub.mcp.length,
      models: bundle.pub.models.length,
      skills: bundle.pub.skills.length,
      prompts: bundle.pub.prompts.length,
      agents: bundle.pub.agents.length,
      resources: bundle.pub.resources.length,
    };
    console.log(`  sections:      ${JSON.stringify(counts)}`);
    process.exit(0);
  } catch (err) {
    console.error('INVALID:', (err as Error).message);
    process.exit(1);
  }
};

const cmdEncode = async (configPath: string, opts: Record<string, string>) => {
  const input = readConfigJson(configPath);
  input.password = opts.password;
  input.trust = opts.trust as BundleInput['trust'];
  input.label = opts.label;
  input.src = opts.src;
  if (input.password) input.encrypt = encryptWithPassword;
  try {
    const bundle = await buildBundle(input);
    const as = opts.as || 'url';
    if (as === 'file') {
      print(bundleToFileString(bundle), opts.out);
    } else {
      print(bundleToDeepLink(bundle), opts.out);
    }
    process.exit(0);
  } catch (err) {
    console.error('ENCODE FAILED:', (err as Error).message);
    process.exit(1);
  }
};

const cmdDecode = async (target: string, opts: Record<string, string>) => {
  try {
    let bundle;
    if (target.startsWith('agentconfig://')) {
      bundle = extractBundleFromDeepLink(target);
    } else {
      const text = readFileSync(resolve(target), 'utf8');
      bundle = parseBundleFromFileString(text);
    }
    const out: Record<string, unknown> = { ...bundle };
    if (opts.reveal) {
      if (!isPasswordRequired(bundle)) {
        out.__secret = await revealSecret(bundle, null, decryptWithPassword);
      } else if (opts.password) {
        out.__secret = await revealSecret(bundle, opts.password, decryptWithPassword);
        console.error('Secret section decrypted.');
      } else {
        console.error('Bundle is password-encrypted; --password required to --reveal.');
      }
    }
    print(JSON.stringify(out, null, 2), opts.out);
    process.exit(0);
  } catch (err) {
    console.error('DECODE FAILED:', (err as Error).message);
    process.exit(1);
  }
};

const parseOpts = (args: string[]): { positional: string[]; opts: Record<string, string> } => {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        opts[key] = 'true';
      } else {
        opts[key] = next;
        i += 1;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(HELP);
    process.exit(0);
  }
  const cmd = args[0];
  const { positional, opts } = parseOpts(args.slice(1));
  switch (cmd) {
    case 'validate':
      if (!positional[0]) { console.error('validate needs a target'); process.exit(2); }
      return cmdValidate(positional[0]);
    case 'encode':
      if (!positional[0]) { console.error('encode needs a config.json path'); process.exit(2); }
      return cmdEncode(positional[0], opts);
    case 'decode':
      if (!positional[0]) { console.error('decode needs a target'); process.exit(2); }
      return cmdDecode(positional[0], opts);
    default:
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      process.exit(2);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
