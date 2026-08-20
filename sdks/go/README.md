# AgentConfig Go SDK

Official Go SDK for AgentConfig Bundle (`.acfg` files and `agentconfig://` deep links). Pure Go with zero external dependencies.

## Installation

```bash
go get github.com/vibeunion/agentconfig/sdks/go
```

## Quick Start

```go
package main

import (
	"fmt"
	"github.com/vibeunion/agentconfig/sdks/go"
)

func main() {
	// Build an encrypted bundle
	bundle, err := agentconfig.BuildBundle(agentconfig.BuildBundleOptions{
		Trust: agentconfig.TrustModeSelf,
		Pub: agentconfig.BundlePublic{
			Models: []agentconfig.ModelEntryPublic{
				{
					Provider:  "deepseek",
					ID:        "deepseek-chat",
					ModelType: agentconfig.ModelTypeText,
				},
			},
		},
		Secret: &agentconfig.BundleSecret{
			Secrets: map[string]agentconfig.ProviderSecret{
				"deepseek": {APIKey: "sk-..."},
			},
		},
		Password: "my-password",
	})
	if err != nil {
		panic(err)
	}

	// Export deep link
	url, err := agentconfig.BundleToDeepLink(bundle)
	if err != nil {
		panic(err)
	}
	fmt.Println("Deep link:", url)

	// Import and reveal
	imported, err := agentconfig.ExtractBundleFromDeepLink(url)
	if err != nil {
		panic(err)
	}
	secret, err := agentconfig.RevealSecret(imported, "my-password")
	if err != nil {
		panic(err)
	}
	fmt.Println("Decrypted key:", secret.Secrets["deepseek"].APIKey)
}
```
