import {
  ACB_DEEP_LINK_MAX_BYTES,
  ACB_DEEP_LINK_SCHEME,
  ACB_FILE_EXTENSION,
  ACB_MAX_BUNDLE_BYTES,
  ACB_MIME_TYPE,
  ACB_PBKDF2_MAX_ITERATIONS,
  ACB_PBKDF2_MIN_ITERATIONS,
  ACB_SCHEMA_ID,
  ACB_VERSION,
  AcbCapability,
  AcbEncryptionAlgorithm,
  AcbTrustMode,
  AcbTrustModeSchema,
  BundlePublicSchema,
  BundleSecretSchema,
  ConfigBundleSchema,
  type BundlePublic,
  type BundlePublicInput,
  type BundleSecret,
  type BundleSecretInput,
  type ConfigBundle,
  type PayloadEnvelope,
} from './schema.js';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

const utf8Bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const utf8ByteLength = (value: string): number => utf8Bytes(value).byteLength;
const decodeUtf8 = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const fromB64 = (value: string, field = 'base64 value'): Uint8Array => {
  if (!BASE64_PATTERN.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if (toB64(bytes) !== value) {
    throw new Error(`Non-canonical ${field}`);
  }
  return bytes;
};
const toB64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const fromB64Url = (value: string): Uint8Array => {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid bundle base64url payload');
  }
  const bytes = new Uint8Array(Buffer.from(value, 'base64url'));
  if (toB64Url(bytes) !== value) {
    throw new Error('Non-canonical bundle base64url payload');
  }
  return bytes;
};

const assertSerializedSize = (serialized: string): void => {
  const size = utf8ByteLength(serialized);
  if (size > ACB_MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle exceeds maximum decoded size (${size} > ${ACB_MAX_BUNDLE_BYTES} bytes)`);
  }
};

const serializeUnknown = (raw: unknown): string => {
  try {
    const serialized = JSON.stringify(raw);
    if (serialized === undefined) throw new Error('value is not JSON-serializable');
    return serialized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundle must be JSON-serializable: ${message}`);
  }
};

const parseJson = (text: string, label: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${label} JSON: ${message}`);
  }
};

export interface PasswordEncryptResult {
  salt: string;
  iv: string;
  ct: string;
  iterations: number;
}

export interface BundlePasswordEncryptor {
  (
    plaintext: string,
    password: string,
    iterations: number,
  ): Promise<PasswordEncryptResult>;
}

export interface BundlePasswordDecryptor {
  (
    params: { salt: string; iv: string; ct: string; iterations: number },
    password: string,
  ): Promise<string>;
}

export interface BundleInput {
  label?: string;
  src?: string;
  hint?: string;
  trust?: AcbTrustMode;
  capabilities?: string[];
  pub: BundlePublicInput;
  secret?: BundleSecretInput;
  password?: string;
  encrypt?: BundlePasswordEncryptor;
  iterations?: number;
}

const EMPTY_SECRET: BundleSecretInput = {
  endpoints: {},
  customPrompts: {},
  providerHints: [],
  secrets: {},
};

export const hasSecrets = (secret: BundleSecretInput | BundleSecret | undefined): boolean => {
  if (!secret) return false;
  return Object.keys(secret.secrets ?? {}).length > 0;
};

const assertIterationCount = (iterations: number): void => {
  if (
    !Number.isInteger(iterations) ||
    iterations < ACB_PBKDF2_MIN_ITERATIONS ||
    iterations > ACB_PBKDF2_MAX_ITERATIONS
  ) {
    throw new Error(
      `PBKDF2 iterations must be an integer between ${ACB_PBKDF2_MIN_ITERATIONS} and ${ACB_PBKDF2_MAX_ITERATIONS}`,
    );
  }
};

const assertSecretPolicy = (
  trust: AcbTrustMode,
  secret: BundleSecret,
  encrypted: boolean,
): void => {
  if (!hasSecrets(secret)) return;
  if (trust === AcbTrustMode.Shared) {
    throw new Error('trust="shared" bundles MUST NOT carry provider credentials');
  }
  if (!encrypted) {
    throw new Error(
      `trust="${trust}" bundles carrying credentials MUST be password-encrypted`,
    );
  }
};

const deriveCapabilities = (pub: BundlePublic): string[] => {
  const caps: string[] = [];
  if (pub.mcp.length > 0) caps.push(AcbCapability.Mcp);
  if (pub.models.length > 0) caps.push(AcbCapability.Models);
  if (pub.skills.length > 0) caps.push(AcbCapability.Skills);
  if (pub.prompts.length > 0) caps.push(AcbCapability.Prompts);
  if (pub.agents.length > 0) caps.push(AcbCapability.Agents);
  if (pub.resources.length > 0) caps.push(AcbCapability.Resources);
  return caps;
};

const parseSecretJson = (json: string): BundleSecret => {
  return BundleSecretSchema.parse(parseJson(json, 'secret section'));
};

const parsePlainSecret = (bundle: ConfigBundle): BundleSecret | null => {
  if (bundle.payload.alg !== AcbEncryptionAlgorithm.None) return null;
  const bytes = fromB64(bundle.payload.ct, 'plaintext secret payload');
  return parseSecretJson(decodeUtf8(bytes));
};

const validateParsedBundle = (bundle: ConfigBundle): ConfigBundle => {
  if (bundle.payload.alg === AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm) {
    const salt = fromB64(bundle.payload.salt, 'salt');
    const iv = fromB64(bundle.payload.iv, 'IV');
    const ciphertext = fromB64(bundle.payload.ct, 'ciphertext');
    if (salt.byteLength !== 16) throw new Error('Invalid salt length: expected 16 bytes');
    if (iv.byteLength !== 12) throw new Error('Invalid IV length: expected 12 bytes');
    if (ciphertext.byteLength < 16) throw new Error('Ciphertext too short (missing GCM tag)');
  }
  const plainSecret = parsePlainSecret(bundle);
  if (plainSecret) {
    assertSecretPolicy(bundle.trust, plainSecret, false);
  }
  return bundle;
};

export const buildBundle = async (input: BundleInput): Promise<ConfigBundle> => {
  const pub = BundlePublicSchema.parse(input.pub);
  const secret = BundleSecretSchema.parse(input.secret ?? EMPTY_SECRET);
  const trust = AcbTrustModeSchema.parse(input.trust ?? AcbTrustMode.Shared);
  const iterations = input.iterations ?? ACB_PBKDF2_MIN_ITERATIONS;
  assertIterationCount(iterations);

  const encrypted = Boolean(input.password);
  if (input.hint && input.password && input.hint.includes(input.password)) {
    throw new Error('Password hint MUST NOT contain the password');
  }
  assertSecretPolicy(trust, secret, encrypted);
  const secretJson = JSON.stringify(secret);

  let payload: PayloadEnvelope;
  if (input.password) {
    if (!input.encrypt) {
      throw new Error('encrypt function required when password is provided');
    }
    const result = await input.encrypt(secretJson, input.password, iterations);
    assertIterationCount(result.iterations);
    payload = {
      alg: AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm,
      iterations: result.iterations,
      salt: result.salt,
      iv: result.iv,
      ct: result.ct,
    };
  } else {
    payload = {
      alg: AcbEncryptionAlgorithm.None,
      ct: toB64(utf8Bytes(secretJson)),
    };
  }

  const bundle = ConfigBundleSchema.parse({
    schema: ACB_SCHEMA_ID,
    v: ACB_VERSION,
    created: Date.now(),
    label: input.label,
    src: input.src,
    hint: input.hint,
    trust,
    capabilities: input.capabilities ?? deriveCapabilities(pub),
    payload,
    pub,
  });
  assertSerializedSize(JSON.stringify(bundle));
  return validateParsedBundle(bundle);
};

export const parseBundle = (raw: unknown): ConfigBundle => {
  const serialized = serializeUnknown(raw);
  assertSerializedSize(serialized);
  return validateParsedBundle(ConfigBundleSchema.parse(raw));
};

export const bundleToDeepLink = (
  bundle: ConfigBundle,
  scheme = ACB_DEEP_LINK_SCHEME,
): string => {
  const validated = parseBundle(bundle);
  const json = JSON.stringify(validated);
  const encoded = toB64Url(utf8Bytes(json));
  if (encoded.length > ACB_DEEP_LINK_MAX_BYTES) {
    throw new Error(
      `Bundle too large for deep link (${encoded.length} > ${ACB_DEEP_LINK_MAX_BYTES}). Use ${ACB_FILE_EXTENSION} file export instead.`,
    );
  }
  return `${scheme}://import?v=${validated.v}&bundle=${encoded}`;
};

export const bundleToFileString = (bundle: ConfigBundle): string => {
  return JSON.stringify(parseBundle(bundle), null, 2);
};

export const parseBundleFromFileString = (text: string): ConfigBundle => {
  assertSerializedSize(text);
  return parseBundle(parseJson(text, `${ACB_FILE_EXTENSION} file`));
};

export const extractBundleFromDeepLink = (
  url: string,
  scheme = ACB_DEEP_LINK_SCHEME,
): ConfigBundle => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid deep link URL: ${message}`);
  }
  if (parsed.protocol !== `${scheme}:`) {
    throw new Error(`Unexpected scheme: ${parsed.protocol}`);
  }
  if (parsed.hostname !== 'import') {
    throw new Error(`Unexpected deep link host: ${parsed.hostname}`);
  }
  const version = parsed.searchParams.get('v');
  if (version !== String(ACB_VERSION)) {
    throw new Error(`Unsupported deep link version: ${version ?? '(missing)'}`);
  }
  const encoded = parsed.searchParams.get('bundle');
  if (!encoded) {
    throw new Error('Missing bundle parameter');
  }
  if (encoded.length > ACB_DEEP_LINK_MAX_BYTES) {
    throw new Error(
      `Deep link payload exceeds maximum size (${encoded.length} > ${ACB_DEEP_LINK_MAX_BYTES})`,
    );
  }
  const json = decodeUtf8(fromB64Url(encoded));
  assertSerializedSize(json);
  const bundle = parseBundle(parseJson(json, 'deep link bundle'));
  if (bundle.v !== Number(version)) {
    throw new Error(`Deep link version ${version} does not match bundle version ${bundle.v}`);
  }
  return bundle;
};

export const isPasswordRequired = (bundle: ConfigBundle): boolean =>
  bundle.payload.alg === AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm;

export const revealSecret = async (
  bundleInput: ConfigBundle,
  password: string | null,
  decrypt: BundlePasswordDecryptor,
): Promise<BundleSecret> => {
  const bundle = parseBundle(bundleInput);
  const { payload } = bundle;
  let secret: BundleSecret;
  if (payload.alg === AcbEncryptionAlgorithm.None) {
    secret = parseSecretJson(decodeUtf8(fromB64(payload.ct, 'plaintext secret payload')));
  } else {
    if (!password) {
      throw new Error('Password required');
    }
    const json = await decrypt(
      {
        salt: payload.salt,
        iv: payload.iv,
        ct: payload.ct,
        iterations: payload.iterations,
      },
      password,
    );
    secret = parseSecretJson(json);
  }
  assertSecretPolicy(
    bundle.trust,
    secret,
    payload.alg === AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm,
  );
  return secret;
};

export const estimateBundleSize = (bundle: ConfigBundle): number => {
  return utf8ByteLength(JSON.stringify(bundle));
};

export const bundleMimeInfo = () => ({
  extension: ACB_FILE_EXTENSION,
  mimeType: ACB_MIME_TYPE,
});
