# SDK interoperability vectors

`v1.5.acfg` is a deterministic, encrypted `self` bundle. Its test-only password
is `agentconfig-v1.5-test`; `v1.5-secret.json` is the expected plaintext. All
credentials are placeholders. The fixed salt and IV are for this test vector
only and must never be reused by production encryption.

The vector covers `agents[].promptId`, its prompt body, a remote MCP endpoint
in `secrets.remote.url`, and unknown fields at every schema layer. TypeScript,
Rust, Go, Python and Java tests consume the same files. Envelope version remains
1; these are additive Draft v1.5 fields.

`v1.5-urls.json` supplies HTTP URL acceptance and rejection cases to all five
implementations, including Unicode/underscore hosts, missing hosts, and port
boundaries.
