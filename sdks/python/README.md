# AgentConfig Python SDK

Official Python SDK for AgentConfig Bundle (`.acfg` and `agentconfig://` deep links).

## Installation

```bash
pip install agentconfig
```

## Quick Start

```python
from agentconfig import (
    AcbTrustMode,
    AcbModelType,
    BundlePublic,
    ModelEntryPublic,
    BundleSecret,
    ProviderSecret,
    build_bundle,
    bundle_to_deep_link,
    extract_bundle_from_deep_link,
    reveal_secret,
)

# Export an encrypted bundle
bundle = build_bundle(
    trust=AcbTrustMode.Self.value,
    pub=BundlePublic(
        models=[
            ModelEntryPublic(
                provider="deepseek",
                id="deepseek-chat",
                contextWindow=64000,
                modelType=AcbModelType.Text,
            )
        ]
    ),
    secret=BundleSecret(
        secrets={
            "deepseek": ProviderSecret(apiKey="sk-...")
        }
    ),
    password="my-secure-password",
)

url = bundle_to_deep_link(bundle)
print("Deep link:", url)

# Import and reveal secret
imported = extract_bundle_from_deep_link(url)
secret = reveal_secret(imported, "my-secure-password")
print("API Key:", secret.secrets["deepseek"].apiKey)
```
