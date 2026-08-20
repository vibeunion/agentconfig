use agentconfig::*;
use std::collections::HashMap;

#[test]
fn test_canonical_integration_test_vector() {
    let raw_url = "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ";

    let bundle = extract_bundle_from_deep_link(raw_url, None).expect("failed to extract");
    assert_eq!(bundle.schema, ACB_SCHEMA_ID);
    assert_eq!(bundle.v, ACB_VERSION);
    assert_eq!(bundle.trust, TRUST_SELF);
    assert_eq!(bundle.pub_section.models[0].provider, "provider-a");
    assert_eq!(bundle.pub_section.models[0].id, "model-x");

    let secret = reveal_secret(&bundle, Some("test-vector-2026")).expect("failed to reveal");
    assert_eq!(
        secret.secrets.get("provider-a").and_then(|s| s.api_key.as_deref()),
        Some("sk-test-key-abcdef")
    );
    assert_eq!(
        secret.secrets.get("github").and_then(|s| s.env.get("GITHUB_PERSONAL_ACCESS_TOKEN")).map(|s| s.as_str()),
        Some("ghp_testtoken123")
    );
    assert_eq!(
        secret.endpoints.get("provider-a").map(|s| s.as_str()),
        Some("https://api.example.com")
    );
    assert_eq!(
        secret.custom_prompts.get("default").map(|s| s.as_str()),
        Some("Be concise.")
    );
}

#[test]
fn test_shared_bundle_roundtrip() {
    let pub_section = BundlePublic {
        models: vec![ModelEntryPublic {
            provider: "deepseek".to_string(),
            id: "deepseek-chat".to_string(),
            alias: None,
            max_tokens: None,
            context_window: Some(64000),
            max_output_tokens: Some(8192),
            model_type: Some(MODEL_TYPE_TEXT.to_string()),
            generation_modes: None,
            parameters: None,
            extra: HashMap::new(),
        }],
        ..Default::default()
    };

    let bundle = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SHARED.to_string()),
        pub_section,
        ..Default::default()
    })
    .expect("build shared bundle");

    assert_eq!(bundle.payload.alg, ALG_NONE);

    let url = bundle_to_deep_link(&bundle, None).expect("to deep link");
    let extracted = extract_bundle_from_deep_link(&url, None).expect("extract deep link");
    assert_eq!(extracted.pub_section.models[0].id, "deepseek-chat");

    let secret = reveal_secret(&extracted, None).expect("reveal secret");
    assert_eq!(secret.secrets.len(), 0);
}

#[test]
fn test_encrypted_self_bundle_roundtrip() {
    let mut secrets = HashMap::new();
    secrets.insert(
        "deepseek".to_string(),
        ProviderSecret {
            api_key: Some("sk-deepseek-rust-key".to_string()),
            ..Default::default()
        },
    );
    let secret = BundleSecret {
        secrets,
        ..Default::default()
    };

    let bundle = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SELF.to_string()),
        secret: Some(secret),
        password: Some("rust-secret-password".to_string()),
        hint: Some("rust unit test".to_string()),
        ..Default::default()
    })
    .expect("build self bundle");

    let file_str = bundle_to_file_string(&bundle).expect("to file string");
    let parsed = parse_bundle_from_file_string(&file_str).expect("parse file string");
    let revealed = reveal_secret(&parsed, Some("rust-secret-password")).expect("reveal");

    assert_eq!(
        revealed.secrets.get("deepseek").and_then(|s| s.api_key.as_deref()),
        Some("sk-deepseek-rust-key")
    );
}

#[test]
fn test_trust_violations() {
    let mut secrets = HashMap::new();
    secrets.insert(
        "deepseek".to_string(),
        ProviderSecret {
            api_key: Some("sk-test".to_string()),
            ..Default::default()
        },
    );

    // 1. shared cannot have secrets
    let res = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SHARED.to_string()),
        secret: Some(BundleSecret {
            secrets: secrets.clone(),
            ..Default::default()
        }),
        ..Default::default()
    });
    assert!(res.is_err());

    // 2. self with secrets must have password
    let res2 = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SELF.to_string()),
        secret: Some(BundleSecret {
            secrets,
            ..Default::default()
        }),
        password: None,
        ..Default::default()
    });
    assert!(res2.is_err());
}
