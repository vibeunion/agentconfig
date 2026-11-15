use agentconfig::*;
use serde_json::{json, Value};

const VECTOR: &str = include_str!("../../../examples/vectors/v1.5.acfg");
const PASSWORD: &str = "agentconfig-v1.5-test";

#[test]
fn shared_v15_vector_survives_both_carriers() {
    let bundle = parse_bundle(VECTOR).unwrap();
    assert_eq!(
        bundle.pub_section.agents[0].prompt_id.as_deref(),
        Some("researcher-instructions")
    );
    let file = bundle_to_file_string(&bundle).unwrap();
    let link = bundle_to_deep_link(&bundle, None).unwrap();
    for imported in [
        parse_bundle(&file).unwrap(),
        extract_bundle_from_deep_link(&link, None).unwrap(),
    ] {
        let original: Value = serde_json::from_str(VECTOR).unwrap();
        let encoded = serde_json::to_value(&imported).unwrap();
        assert_eq!(encoded["x-envelope"], original["x-envelope"]);
        assert_eq!(
            encoded["payload"]["x-payload"],
            original["payload"]["x-payload"]
        );
        assert_eq!(encoded["pub"], original["pub"]);
        let secret = reveal_secret(&imported, Some(PASSWORD)).unwrap();
        assert_eq!(
            secret.secrets["remote"].url.as_deref(),
            Some("https://mcp.example.com/sse")
        );
        assert_eq!(
            secret.custom_prompts["researcher-instructions"],
            "Inspect the workspace before proposing changes."
        );
        let secret_json = serde_json::to_value(secret).unwrap();
        assert_eq!(secret_json["x-secret"], json!({"retained": true}));
        assert_eq!(
            secret_json["providerHints"][0]["x-hint"],
            json!({"retained": true})
        );
        assert_eq!(
            secret_json["secrets"]["remote"]["x-provider"],
            json!({"retained": true})
        );
        assert_eq!(
            secret_json["secrets"]["remote"]["oauth"]["x-oauth"],
            json!({"retained": true})
        );
        assert_eq!(
            secret_json["secrets"]["remote"]["oauth"]["extra"],
            json!({"vendor": true})
        );
    }
}

#[test]
fn prompt_binding_rejects_invalid_references_and_accepts_legacy_agents() {
    for prompt_id in ["", "missing", &"x".repeat(65)] {
        let mut bundle: Value = serde_json::from_str(VECTOR).unwrap();
        bundle["pub"]["agents"][0]["promptId"] = json!(prompt_id);
        assert!(parse_bundle(&bundle.to_string()).is_err());
    }
    let mut bundle: Value = serde_json::from_str(VECTOR).unwrap();
    bundle["pub"]["agents"][0]
        .as_object_mut()
        .unwrap()
        .remove("promptId");
    let parsed = parse_bundle(&bundle.to_string()).unwrap();
    assert!(parsed.pub_section.agents[0].prompt_id.is_none());
    assert!(!bundle_to_file_string(&parsed).unwrap().contains("promptId"));
}

#[test]
fn remote_url_is_validated_before_export_and_after_decryption() {
    let mut bundle = parse_bundle(VECTOR).unwrap();
    let mut secret = reveal_secret(&bundle, Some(PASSWORD)).unwrap();
    secret.secrets.get_mut("remote").unwrap().url = Some("not a url".to_string());
    assert!(build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SELF.to_string()),
        secret: Some(secret.clone()),
        password: Some(PASSWORD.to_string()),
        ..Default::default()
    })
    .is_err());
    let encrypted =
        encrypt_with_password(&serde_json::to_string(&secret).unwrap(), PASSWORD, 100_000).unwrap();
    bundle.payload.ct = encrypted.ct;
    bundle.payload.salt = Some(encrypted.salt);
    bundle.payload.iv = Some(encrypted.iv);
    assert!(reveal_secret(&bundle, Some(PASSWORD)).is_err());
}

#[test]
fn remote_url_alone_still_requires_trust_and_encryption() {
    let secret: BundleSecret = serde_json::from_value(json!({
        "secrets": {"remote": {"url": "https://mcp.example.com/sse"}}
    }))
    .unwrap();
    for (trust, password) in [
        (TRUST_SHARED, Some(PASSWORD.to_string())),
        (TRUST_SELF, None),
    ] {
        assert!(build_bundle(BuildBundleOptions {
            trust: Some(trust.to_string()),
            secret: Some(secret.clone()),
            password,
            ..Default::default()
        })
        .is_err());
    }
}

#[test]
fn http_url_cases_match_the_shared_reference() {
    let cases: Value =
        serde_json::from_str(include_str!("../../../examples/vectors/v1.5-urls.json")).unwrap();
    for category in ["valid", "invalid"] {
        for endpoint in cases[category].as_array().unwrap() {
            let secret: BundleSecret =
                serde_json::from_value(json!({"secrets": {"remote": {"url": endpoint}}})).unwrap();
            let outcome = build_bundle(BuildBundleOptions {
                trust: Some(TRUST_SELF.to_string()),
                secret: Some(secret),
                password: Some(PASSWORD.to_string()),
                ..Default::default()
            });
            assert_eq!(outcome.is_ok(), category == "valid", "endpoint: {endpoint}");
        }
    }
}
