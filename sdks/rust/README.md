# AgentConfig Rust SDK

Official Rust SDK for AgentConfig Bundle (`.acfg` and `agentconfig://` deep links).

## Installation

Add to `Cargo.toml`:

```toml
[dependencies]
agentconfig = "0.1.0"
```

## Quick Start

```rust
use agentconfig::*;
use std::collections::HashMap;

fn main() -> Result<()> {
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

    let mut secrets = HashMap::new();
    secrets.insert(
        "deepseek".to_string(),
        ProviderSecret {
            api_key: Some("sk-...".to_string()),
            ..Default::default()
        },
    );

    let bundle = build_bundle(BuildBundleOptions {
        trust: Some(TRUST_SELF.to_string()),
        pub_section,
        secret: Some(BundleSecret { secrets, ..Default::default() }),
        password: Some("my-password".to_string()),
        ..Default::default()
    })?;

    let url = bundle_to_deep_link(&bundle, None)?;
    println!("Deep link: {url}");

    let extracted = extract_bundle_from_deep_link(&url, None)?;
    let secret = reveal_secret(&extracted, Some("my-password"))?;
    println!("API key: {:?}", secret.secrets.get("deepseek").and_then(|s| s.api_key.as_deref()));

    Ok(())
}
```
