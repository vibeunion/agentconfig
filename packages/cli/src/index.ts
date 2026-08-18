#!/usr/bin/env node
import { closeSync, fchmodSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AcbTrustMode,
  buildBundle,
  bundleToDeepLink,
  bundleToFileString,
  decryptWithPassword,
  encryptWithPassword,
  extractBundleFromDeepLink,
  isPasswordRequired,
  parseBundleFromFileString,
  revealSecret,
  type BundleInput,
  type ConfigBundle,
} from '@agentconfig/core';

const HELP = `AgentConfig Bundle CLI

Usage:
  agentconfig validate <file-or-url>         Validate a bundle (file path or agentconfig:// URL)
  agentconfig encode <config.json> [opts]    Encode a JSON config into a bundle
  agentconfig decode <file-or-url> [opts]    Decode a bundle back to JSON

Encode options:
  --password <pw>        Password-encrypt the secret section
  --password-env <name>  Read the password from an environment variable
  --trust <mode>         self | shared | managed (otherwise keep config/default)
  --label <text>         Human-readable label
  --src <id>             Producing client id
  --hint <text>          Password hint (must not contain the password)
  --out <file>           Write to file instead of stdout
  --as <url|file>        Output as deep-link URL or .acfg file (default: url)

Decode options:
  --password <pw>        Password to decrypt the secret section
  --password-env <name>  Read the password from an environment variable
  --reveal               Include the validated secret section in output
  --out <file>           Write to file instead of stdout

Examples:
  agentconfig validate ./setup.acfg
  ACB_PASSWORD='...' agentconfig encode ./config.json --password-env ACB_PASSWORD --trust self --as file --out setup.acfg
  agentconfig encode ./config.json --as url
  ACB_PASSWORD='...' agentconfig decode ./setup.acfg --password-env ACB_PASSWORD --reveal
`;

const VALUE_OPTIONS = new Set([
  'password',
  'password-env',
  'trust',
  'label',
  'src',
  'hint',
  'out',
  'as',
]);
const FLAG_OPTIONS = new Set(['reveal']);
const TRUST_MODES = new Set<string>(Object.values(AcbTrustMode));

type ParsedOptions = Record<string, string | boolean>;

class CliUsageError extends Error {}

const readBundleTarget = (target: string): ConfigBundle => {
  if (target.startsWith('agentconfig://')) {
    return extractBundleFromDeepLink(target);
  }
  return parseBundleFromFileString(readFileSync(resolve(target), 'utf8'));
};

const readConfigJson = (path: string): BundleInput => {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || !('pub' in raw)) {
    throw new CliUsageError('Config JSON must have a "pub" field (the public section)');
  }
  if ('password' in raw) {
    throw new CliUsageError(
      'Do not store passwords in config JSON; use --password or --password-env',
    );
  }
  return raw as BundleInput;
};

const writePrivateFile = (path: string, text: string): void => {
  const fd = openSync(path, 'w', 0o600);
  try {
    if (process.platform !== 'win32') fchmodSync(fd, 0o600);
    writeFileSync(fd, text, { encoding: 'utf8' });
  } finally {
    closeSync(fd);
  }
};

const print = (text: string, outFile?: string): void => {
  if (outFile) {
    writePrivateFile(resolve(outFile), text);
    console.error(`Written to ${outFile}`);
  } else {
    console.log(text);
  }
};

const stringOption = (opts: ParsedOptions, key: string): string | undefined => {
  const value = opts[key];
  return typeof value === 'string' ? value : undefined;
};

const resolvePassword = (opts: ParsedOptions): string | undefined => {
  const inline = stringOption(opts, 'password');
  const envName = stringOption(opts, 'password-env');
  if (inline !== undefined && envName !== undefined) {
    throw new CliUsageError('Use only one of --password or --password-env');
  }
  if (!envName) return inline;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
    throw new CliUsageError(`Invalid environment variable name: ${envName}`);
  }
  const value = process.env[envName];
  if (!value) {
    throw new CliUsageError(`Environment variable ${envName} is missing or empty`);
  }
  return value;
};

const assertAllowedOptions = (opts: ParsedOptions, allowed: Set<string>): void => {
  for (const key of Object.keys(opts)) {
    if (!allowed.has(key)) throw new CliUsageError(`Option --${key} is not valid for this command`);
  }
};

const cmdValidate = (target: string): void => {
  const bundle = readBundleTarget(target);
  const encrypted = isPasswordRequired(bundle);
  console.log('OK - valid AgentConfig Bundle');
  console.log(`  schema:        ${bundle.schema}`);
  console.log(`  version:       ${bundle.v}`);
  console.log(`  trust:         ${bundle.trust}`);
  console.log(`  capabilities:  ${bundle.capabilities.join(', ') || '(none)'}`);
  console.log(`  encrypted:     ${encrypted ? `yes (${bundle.payload.alg})` : 'no'}`);
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
};

const cmdEncode = async (configPath: string, opts: ParsedOptions): Promise<void> => {
  assertAllowedOptions(
    opts,
    new Set(['password', 'password-env', 'trust', 'label', 'src', 'hint', 'out', 'as']),
  );
  const input = readConfigJson(configPath);
  const password = resolvePassword(opts);
  if (password !== undefined) input.password = password;

  const trust = stringOption(opts, 'trust');
  if (trust !== undefined) {
    if (!TRUST_MODES.has(trust)) {
      throw new CliUsageError(`Invalid trust mode: ${trust}`);
    }
    input.trust = trust as BundleInput['trust'];
  }

  const label = stringOption(opts, 'label');
  const src = stringOption(opts, 'src');
  const hint = stringOption(opts, 'hint');
  if (label !== undefined) input.label = label;
  if (src !== undefined) input.src = src;
  if (hint !== undefined) input.hint = hint;
  if (input.password) input.encrypt = encryptWithPassword;

  const outputKind = stringOption(opts, 'as') ?? 'url';
  if (outputKind !== 'url' && outputKind !== 'file') {
    throw new CliUsageError(`Invalid --as value: ${outputKind}; expected url or file`);
  }

  const bundle = await buildBundle(input);
  const output = outputKind === 'file' ? bundleToFileString(bundle) : bundleToDeepLink(bundle);
  print(output, stringOption(opts, 'out'));
};

const cmdDecode = async (target: string, opts: ParsedOptions): Promise<void> => {
  assertAllowedOptions(opts, new Set(['password', 'password-env', 'reveal', 'out']));
  const bundle = readBundleTarget(target);
  const output: Record<string, unknown> = { ...bundle };
  if (opts.reveal === true) {
    const password = resolvePassword(opts);
    if (isPasswordRequired(bundle) && !password) {
      throw new CliUsageError(
        'Bundle is password-encrypted; --password or --password-env is required with --reveal',
      );
    }
    output.__secret = await revealSecret(bundle, password ?? null, decryptWithPassword);
    if (isPasswordRequired(bundle)) console.error('Secret section decrypted and validated.');
  }
  print(JSON.stringify(output, null, 2), stringOption(opts, 'out'));
};

const parseOpts = (args: string[]): { positional: string[]; opts: ParsedOptions } => {
  const positional: string[] = [];
  const opts: ParsedOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (!key || (!VALUE_OPTIONS.has(key) && !FLAG_OPTIONS.has(key))) {
      throw new CliUsageError(`Unknown option: ${arg}`);
    }
    if (key in opts) throw new CliUsageError(`Duplicate option: ${arg}`);

    if (FLAG_OPTIONS.has(key)) {
      opts[key] = true;
      continue;
    }

    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new CliUsageError(`Option ${arg} requires a value`);
    }
    opts[key] = value;
    i += 1;
  }
  return { positional, opts };
};

const requireSingleTarget = (command: string, positional: string[]): string => {
  if (positional.length !== 1) {
    throw new CliUsageError(`${command} needs exactly one target`);
  }
  return positional[0];
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(HELP);
    return;
  }

  const command = args[0];
  const { positional, opts } = parseOpts(args.slice(1));
  switch (command) {
    case 'validate':
      assertAllowedOptions(opts, new Set());
      cmdValidate(requireSingleTarget('validate', positional));
      return;
    case 'encode':
      await cmdEncode(requireSingleTarget('encode', positional), opts);
      return;
    case 'decode':
      await cmdDecode(requireSingleTarget('decode', positional), opts);
      return;
    default:
      throw new CliUsageError(`Unknown command: ${command}`);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error instanceof CliUsageError ? `USAGE ERROR: ${message}` : `FAILED: ${message}`);
  if (error instanceof CliUsageError) console.error(`\n${HELP}`);
  process.exitCode = error instanceof CliUsageError ? 2 : 1;
});
