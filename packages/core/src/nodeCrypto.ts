import crypto from 'node:crypto';
import {
  ACB_PBKDF2_MIN_ITERATIONS,
} from './schema.js';
import type {
  PasswordEncryptResult,
  BundlePasswordEncryptor,
  BundlePasswordDecryptor,
} from './codec.js';

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

export const encryptWithPassword: BundlePasswordEncryptor = async (
  plaintext: string,
  password: string,
): Promise<PasswordEncryptResult> => {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, ACB_PBKDF2_MIN_ITERATIONS, KEY_BYTES, 'sha256');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([enc, tag]).toString('base64'),
    iterations: ACB_PBKDF2_MIN_ITERATIONS,
  };
};

export const decryptWithPassword: BundlePasswordDecryptor = async (
  { salt, iv, ct, iterations },
  password: string,
): Promise<string> => {
  const saltBytes = Buffer.from(salt, 'base64');
  const ivBytes = Buffer.from(iv, 'base64');
  const ctBytes = Buffer.from(ct, 'base64');
  if (ctBytes.length < 16) {
    throw new Error('Ciphertext too short (missing GCM tag)');
  }
  const enc = ctBytes.subarray(0, ctBytes.length - 16);
  const tag = ctBytes.subarray(ctBytes.length - 16);
  const key = crypto.pbkdf2Sync(password, saltBytes, iterations, KEY_BYTES, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
};
