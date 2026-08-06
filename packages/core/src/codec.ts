import {
  ACB_DEEP_LINK_MAX_BYTES,
  ACB_DEEP_LINK_SCHEME,
  ACB_FILE_EXTENSION,
  ACB_MIME_TYPE,
  ACB_PBKDF2_MIN_ITERATIONS,
  ACB_SCHEMA_ID,
  ACB_VERSION,
  AcbCapability,
  AcbEncryptionAlgorithm,
  AcbTrustMode,
  ConfigBundleSchema,
  type BundlePublic,
  type BundleSecret,
  type ConfigBundle,
  type PayloadEnvelope,
} from './schema.js';

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const fromB64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));
const toB64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url');
const fromB64Url = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, 'base64url'));

export interface PasswordEncryptResult {
  salt: string;
  iv: string;
  ct: string;
  iterations: number;
}

export interface BundlePasswordEncryptor {
  (plaintext: string, password: string): Promise<PasswordEncryptResult>;
}

export interface BundlePasswordDecryptor {
  (params: { salt: string; iv: string; ct: string; iterations: number }, password: string): Promise<string>;
}

export interface BundleInput {
  label?: string;
  src?: string;
  trust?: AcbTrustMode;
  capabilities?: AcbCapability[];
  pub: BundlePublic;
  secret?: BundleSecret;
  password?: string;
  encrypt?: BundlePasswordEncryptor;
  iterations?: number;
}

const EMPTY_SECRET: BundleSecret = {
  endpoints: {},
  customPrompts: {},
  providerHints: [],
  secrets: {},
};

export const hasSecrets = (secret: BundleSecret | undefined): boolean => {
  if (!secret) return false;
  return Object.keys(secret.secrets ?? {}).length > 0;
};

const deriveCapabilities = (pub: BundlePublic): AcbCapability[] => {
  const caps: AcbCapability[] = [];
  if ((pub.mcp?.length ?? 0) > 0) caps.push(AcbCapability.Mcp);
  if ((pub.models?.length ?? 0) > 0) caps.push(AcbCapability.Models);
  if ((pub.skills?.length ?? 0) > 0) caps.push(AcbCapability.Skills);
  if ((pub.prompts?.length ?? 0) > 0) caps.push(AcbCapability.Prompts);
  if ((pub.agents?.length ?? 0) > 0) caps.push(AcbCapability.Agents);
  if ((pub.resources?.length ?? 0) > 0) caps.push(AcbCapability.Resources);
  return caps;
};

export const buildBundle = async (input: BundleInput): Promise<ConfigBundle> => {
  const secretJson = JSON.stringify(input.secret ?? EMPTY_SECRET);
  const capabilities = input.capabilities ?? deriveCapabilities(input.pub);
  const iterations = input.iterations ?? ACB_PBKDF2_MIN_ITERATIONS;
  const trust = input.trust ?? AcbTrustMode.Shared;

  if (trust !== AcbTrustMode.Shared && hasSecrets(input.secret) && !input.password) {
    throw new Error(
      `trust="${trust}" bundles carrying secrets MUST be password-encrypted; refusing to emit plaintext`,
    );
  }

  let payload: PayloadEnvelope;
  if (input.password) {
    if (!input.encrypt) {
      throw new Error('encrypt function required when password is provided');
    }
    const res = await input.encrypt(secretJson, input.password);
    payload = {
      alg: AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm,
      iterations: res.iterations ?? iterations,
      salt: res.salt,
      iv: res.iv,
      ct: res.ct,
    };
  } else {
    payload = {
      alg: AcbEncryptionAlgorithm.None,
      ct: toB64(new TextEncoder().encode(secretJson)),
    };
  }

  return {
    schema: ACB_SCHEMA_ID,
    v: ACB_VERSION,
    created: Date.now(),
    label: input.label,
    src: input.src,
    trust,
    capabilities,
    payload,
    pub: input.pub,
  };
};

export const parseBundle = (raw: unknown): ConfigBundle => {
  return ConfigBundleSchema.parse(raw);
};

export const bundleToDeepLink = (bundle: ConfigBundle, scheme = ACB_DEEP_LINK_SCHEME): string => {
  const json = JSON.stringify(bundle);
  const encoded = toB64Url(new TextEncoder().encode(json));
  if (encoded.length > ACB_DEEP_LINK_MAX_BYTES) {
    throw new Error(
      `Bundle too large for deep link (${encoded.length} > ${ACB_DEEP_LINK_MAX_BYTES}). Use ${ACB_FILE_EXTENSION} file export instead.`,
    );
  }
  return `${scheme}://import?v=${bundle.v}&bundle=${encoded}`;
};

export const bundleToFileString = (bundle: ConfigBundle): string => {
  return JSON.stringify(bundle, null, 2);
};

export const parseBundleFromFileString = (text: string): ConfigBundle => {
  return ConfigBundleSchema.parse(JSON.parse(text));
};

export const extractBundleFromDeepLink = (
  url: string,
  scheme = ACB_DEEP_LINK_SCHEME,
): ConfigBundle => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'import') {
    throw new Error(`Unexpected deep link host: ${parsed.hostname}`);
  }
  if (!parsed.protocol.startsWith(`${scheme}:`)) {
    throw new Error(`Unexpected scheme: ${parsed.protocol}`);
  }
  const encoded = parsed.searchParams.get('bundle');
  if (!encoded) {
    throw new Error('Missing bundle parameter');
  }
  const bytes = fromB64Url(encoded);
  const json = new TextDecoder().decode(bytes);
  return ConfigBundleSchema.parse(JSON.parse(json));
};

export const isPasswordRequired = (bundle: ConfigBundle): boolean =>
  bundle.payload.alg === AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm;

export const revealSecret = async (
  bundle: ConfigBundle,
  password: string | null,
  decrypt: BundlePasswordDecryptor,
): Promise<BundleSecret> => {
  const { payload } = bundle;
  if (payload.alg === AcbEncryptionAlgorithm.None) {
    const bytes = fromB64(payload.ct);
    return JSON.parse(new TextDecoder().decode(bytes)) as BundleSecret;
  }
  if (!password) {
    throw new Error('Password required');
  }
  const json = await decrypt(
    { salt: payload.salt, iv: payload.iv, ct: payload.ct, iterations: payload.iterations },
    password,
  );
  return JSON.parse(json) as BundleSecret;
};

export const estimateBundleSize = (bundle: ConfigBundle): number => {
  return JSON.stringify(bundle).length;
};

export const bundleMimeInfo = () => ({
  extension: ACB_FILE_EXTENSION,
  mimeType: ACB_MIME_TYPE,
});
