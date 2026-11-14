import { ConfigBundleSchema, parseSchema } from './schema.js';
import type { ConfigBundle, JsonValue } from './schema.js';

/**
 * Canonical signing input for `managed` bundle signatures (§7.3).
 *
 * The bytes that get signed are the UTF-8 encoding of the envelope **without
 * `sig`**, serialized with object keys sorted by UTF-16 code unit order and no
 * insignificant whitespace. For the JSON subset this format allows (finite
 * numbers, strings, arrays, plain objects) that is exactly RFC 8785 JCS, so a
 * producer in any language can reproduce it without implementing a bespoke
 * serializer.
 *
 * Deliberately canonical rather than "the bytes the producer happened to emit":
 * a signature that covered the original JSON text would break the moment a
 * client pretty-printed or re-encoded the bundle, which every copy-paste path
 * does.
 *
 * Declared defaults (§3, §5) are applied first, so the input is identical for a
 * bundle and for its normalized form — a verifier must not have to know whether
 * the producer chose to spell out `"agents": []`.
 */
const sortKeysDeep = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      // defineProperty keeps keys such as `__proto__` as own data properties.
      Object.defineProperty(sorted, key, {
        value: sortKeysDeep(value[key] as JsonValue),
        writable: true, enumerable: true, configurable: true,
      });
    }
    return sorted;
  }
  return value;
};

export const canonicalSignatureInput = (bundle: ConfigBundle): string => {
  const { sig: _sig, ...unsigned } = bundle;
  const normalized = parseSchema(ConfigBundleSchema, unsigned) as ConfigBundle;
  const { sig: _ignored, ...payload } = normalized;
  return JSON.stringify(sortKeysDeep(payload as JsonValue));
};

export type BundleSignatureState =
  /** A `sig` object is present. Verification is a separate, key-dependent step. */
  | 'signed'
  /** No `sig`: only acceptable when the bundle is not `managed`. */
  | 'unsigned';

export const bundleSignatureState = (bundle: ConfigBundle): BundleSignatureState =>
  bundle.sig ? 'signed' : 'unsigned';

/**
 * Importers MUST NOT present an unsigned `managed` bundle as organization-
 * approved (§7.3). This is the single predicate clients and the CLI use to
 * decide whether to show the "unverified managed bundle" warning.
 */
export const isUnverifiedManagedBundle = (bundle: ConfigBundle): boolean =>
  bundle.trust === 'managed' && bundleSignatureState(bundle) === 'unsigned';