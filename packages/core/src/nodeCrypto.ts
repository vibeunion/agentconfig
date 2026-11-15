import crypto from 'node:crypto';
import {
  ACB_PBKDF2_MAX_ITERATIONS,
  ACB_PBKDF2_MIN_ITERATIONS,
} from './schema.js';
import type { ConfigBundle } from './schema.js';
import { canonicalSignatureInput } from './signature.js';
import type {
  PasswordEncryptResult,
  BundlePasswordDecryptor,
  BundlePasswordEncryptor,
} from './codec.js';

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const GCM_TAG_BYTES = 16;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const assertPassword = (password: string): void => {
  if (password.length === 0) throw new Error('Password must not be empty');
};

const assertIterationCount = (iterations: number): void => {
  if (
    !Number.isInteger(iterations) ||
    iterations < ACB_PBKDF2_MIN_ITERATIONS ||
    iterations > ACB_PBKDF2_MAX_ITERATIONS
  ) {
    throw new Error(
      `PBKDF2 iterations must be between ${ACB_PBKDF2_MIN_ITERATIONS} and ${ACB_PBKDF2_MAX_ITERATIONS}`,
    );
  }
};

const decodeBase64 = (name: string, value: string): Buffer => {
  if (!BASE64_PATTERN.test(value)) throw new Error(`Invalid ${name} base64`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error(`Non-canonical ${name} base64`);
  return decoded;
};

const deriveKey = (
  password: string,
  salt: Buffer,
  iterations: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, KEY_BYTES, 'sha256', (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

export const encryptWithPassword: BundlePasswordEncryptor = async (
  plaintext: string,
  password: string,
  iterations = ACB_PBKDF2_MIN_ITERATIONS,
): Promise<PasswordEncryptResult> => {
  assertPassword(password);
  assertIterationCount(iterations);
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, iterations);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([encrypted, tag]).toString('base64'),
    iterations,
  };
};

export const decryptWithPassword: BundlePasswordDecryptor = async (
  { salt, iv, ct, iterations },
  password: string,
): Promise<string> => {
  assertPassword(password);
  assertIterationCount(iterations);
  const saltBytes = decodeBase64('salt', salt);
  const ivBytes = decodeBase64('IV', iv);
  const ciphertext = decodeBase64('ciphertext', ct);
  if (saltBytes.length !== SALT_BYTES) {
    throw new Error(`Invalid salt length: expected ${SALT_BYTES} bytes`);
  }
  if (ivBytes.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_BYTES} bytes`);
  }
  if (ciphertext.length < GCM_TAG_BYTES) {
    throw new Error('Ciphertext too short (missing GCM tag)');
  }

  const encrypted = ciphertext.subarray(0, ciphertext.length - GCM_TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - GCM_TAG_BYTES);
  const key = await deriveKey(password, saltBytes, iterations);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString('utf8');
};

const SIGNATURE_BYTES = 64;

/** SPKI/DER public key, standard base64 — what an org publishes next to `keyId`. */
const decodePublicKey = (publicKey: string): crypto.KeyObject => {
  const der = decodeBase64('public key', publicKey);
  try {
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch (error) {
    throw new Error(`Invalid Ed25519 public key: ${(error as Error).message}`);
  }
};

/**
 * Verify a `managed` bundle signature (§7.3). Returns `false` for a bundle with
 * no `sig` instead of throwing: an unsigned bundle is a state clients must
 * handle, not a crash. Throws only when the key material itself is invalid.
 */
export const verifyBundleSignature = (bundle: ConfigBundle, publicKey: string): boolean => {
  if (!bundle.sig) return false;
  if (bundle.sig.alg !== 'Ed25519') return false;
  const signature = Buffer.from(bundle.sig.value, 'base64');
  if (signature.length !== SIGNATURE_BYTES) return false;
  if (signature.toString('base64') !== bundle.sig.value) {
    throw new Error('Non-canonical signature base64');
  }
  return crypto.verify(
    null,
    Buffer.from(canonicalSignatureInput(bundle), 'utf8'),
    decodePublicKey(publicKey),
    signature,
  );
};

/** Producer side of §7.3, mostly useful for tests and reference clients. */
export const signBundle = (bundle: ConfigBundle, privateKey: string): ConfigBundle => {
  const der = decodeBase64('private key', privateKey);
  const key = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const value = crypto.sign(null, Buffer.from(canonicalSignatureInput(bundle), 'utf8'), key);
  return {
    ...bundle,
    sig: {
      alg: 'Ed25519',
      issuer: bundle.sig?.issuer ?? '',
      keyId: bundle.sig?.keyId ?? '',
      value: value.toString('base64'),
    },
  };
};
