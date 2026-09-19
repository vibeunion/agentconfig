# @agentconfig/core

AgentConfig Bundle schemas, codecs, and encryption helpers. The TypeScript
implementation uses **TypeBox 1.x** (`typebox`, not `@sinclair/typebox`).

## Schema validation

All exported `*Schema` values are native TypeBox schemas. Use `parseSchema` to
apply AgentConfig defaults and validate an input without mutation, coercion, or
removal of unknown extension fields:

```ts
import {
  BundlePublicSchema,
  parseSchema,
  safeParseSchema,
  type BundlePublicInput,
} from '@agentconfig/core';

const input: BundlePublicInput = {
  mcp: [{ name: 'local', transport: 'stdio' }],
  models: [{ provider: 'example', id: 'example-model', contextWindow: 128_000 }],
};

const pub = parseSchema(BundlePublicSchema, input);
// pub.mcp[0].enabled === true; args and envKeys default to []
// pub.skills, pub.prompts, pub.agents and pub.resources default to []

const result = safeParseSchema(BundlePublicSchema, input);
if (!result.success) {
  console.error(result.error.issues); // code, path, message; no raw credential values
}
```

`Static<typeof Schema>` and the exported output types describe normalized data.
The exported `*Input` types also allow omitted defaulted fields, including nested
MCP, skill, agent, provider-secret, and OAuth defaults. Required fields remain
required. Defaults apply to missing/undefined values, **not null**. String values
are never converted to numbers or booleans. Each parse gets independent default
arrays and objects; caller-owned configuration containers are not mutated.

For already-normalized data, native `Value.Check(Schema, value)` from
`typebox/value` is supported and includes TypeBox refinements. It does not fill
defaults. Avoid substituting `Value.Parse` for `parseSchema`: its normalization
pipeline has different conversion and cleaning semantics.

## Migrating direct schema consumers

Replace `SomeSchema.parse(value)` with `parseSchema(SomeSchema, value)` and
`SomeSchema.safeParse(value)` with `safeParseSchema(SomeSchema, value)`. Schema
objects no longer expose Zod methods or Zod error classes. Catch
`SchemaValidationError` or inspect the safe-parse result. There is no Zod runtime,
compatibility facade, or transitive Zod package in the npm lockfile.

High-level APIs such as `buildBundle`, `parseBundle`, `revealSecret`, file export,
and deep-link parsing keep their existing signatures and ACB v1 wire format.
A schema check alone is **not** a substitute for `parseBundle`: the codec also
checks base64 encoding, crypto lengths, serialized sizes, and credential policy.

## Validation boundaries

Token limits and timestamps must be safe integers. Output tokens cannot exceed
the context window (or legacy `maxTokens`), and model kinds must match their
image/video generation modes. Absolute URLs retain WHATWG URL validation.

Model parameters contain finite JSON values only, with maximum depth 20 per
parameter value, at most 1,000 entries per collection, and object keys 1–128
characters long. The parameter root is also limited to 1,000 keys. Cyclic values,
sparse arrays, functions, undefined values, bigints, symbols, dates, maps, and
sets are rejected rather than silently changed by serialization. The root-entry
limit and explicit sparse-array rejection tighten the previous implementation.

**Serialization limitation:** TypeBox refinements are executable runtime rules.
Serializing a schema to JSON does not carry those functions. A generic JSON
Schema validator cannot reproduce the cross-field, WHATWG URL, or bounded JSON
parameter refinements merely from that serialization. Validate complete
AgentConfig contracts using the exported schemas in TypeBox plus `parseSchema`
(or the high-level codec APIs), not only a serialized schema snapshot.

## Development

From the repository root:

```sh
npm ci
npm run check
```

The check builds all TypeScript workspaces, checks their types, runs the tests,
and validates the standalone browser site. CI also runs CLI smoke tests and the
canonical encrypted cross-SDK integration vector. Python/Go/Rust/Java SDKs and
the standalone browser implementation do not depend on Zod and are not migrated
by this TypeScript dependency change.
