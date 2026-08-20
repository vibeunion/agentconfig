package agentconfig

import (
	"strings"
	"testing"
)

func TestCanonicalIntegrationTestVector(t *testing.T) {
	rawURL := "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ"

	bundle, err := ExtractBundleFromDeepLink(rawURL)
	if err != nil {
		t.Fatalf("failed to extract deep link: %v", err)
	}

	if bundle.Schema != SchemaID {
		t.Fatalf("expected schema %s, got %s", SchemaID, bundle.Schema)
	}
	if bundle.V != Version {
		t.Fatalf("expected version %d, got %d", Version, bundle.V)
	}
	if bundle.Trust != TrustModeSelf {
		t.Fatalf("expected trust self, got %s", bundle.Trust)
	}
	if len(bundle.Pub.Models) != 1 || bundle.Pub.Models[0].ID != "model-x" {
		t.Fatalf("unexpected models: %+v", bundle.Pub.Models)
	}

	secret, err := RevealSecret(bundle, "test-vector-2026")
	if err != nil {
		t.Fatalf("failed to reveal secret: %v", err)
	}

	if secret.Secrets["provider-a"].APIKey != "sk-test-key-abcdef" {
		t.Fatalf("expected sk-test-key-abcdef, got %s", secret.Secrets["provider-a"].APIKey)
	}
	if secret.Secrets["github"].Env["GITHUB_PERSONAL_ACCESS_TOKEN"] != "ghp_testtoken123" {
		t.Fatalf("expected ghp_testtoken123, got %s", secret.Secrets["github"].Env["GITHUB_PERSONAL_ACCESS_TOKEN"])
	}
	if secret.Endpoints["provider-a"] != "https://api.example.com" {
		t.Fatalf("expected https://api.example.com, got %s", secret.Endpoints["provider-a"])
	}
	if secret.CustomPrompts["default"] != "Be concise." {
		t.Fatalf("expected Be concise., got %s", secret.CustomPrompts["default"])
	}
}

func TestSharedBundleRoundtrip(t *testing.T) {
	ctxWin := 64000
	maxOut := 8192
	pub := BundlePublic{
		Mcp: []McpEntryPublic{
			{
				Name:      "filesystem",
				Transport: "stdio",
				Command:   "npx",
				Args:      []string{"-y", "@modelcontextprotocol/server-filesystem"},
				EnvKeys:   []string{"TARGET_DIR"},
				Enabled:   true,
			},
		},
		Models: []ModelEntryPublic{
			{
				Provider:        "deepseek",
				ID:              "deepseek-chat",
				ContextWindow:   &ctxWin,
				MaxOutputTokens: &maxOut,
				ModelType:       ModelTypeText,
			},
		},
	}

	bundle, err := BuildBundle(BuildBundleOptions{
		Trust: TrustModeShared,
		Pub:   pub,
	})
	if err != nil {
		t.Fatalf("BuildBundle failed: %v", err)
	}

	if bundle.Payload.Alg != AlgorithmNone {
		t.Fatalf("expected alg none, got %s", bundle.Payload.Alg)
	}

	url, err := BundleToDeepLink(bundle)
	if err != nil {
		t.Fatalf("BundleToDeepLink failed: %v", err)
	}

	extracted, err := ExtractBundleFromDeepLink(url)
	if err != nil {
		t.Fatalf("ExtractBundleFromDeepLink failed: %v", err)
	}

	if len(extracted.Pub.Models) != 1 || *extracted.Pub.Models[0].ContextWindow != 64000 {
		t.Fatalf("unexpected extracted models: %+v", extracted.Pub.Models)
	}

	secret, err := RevealSecret(extracted)
	if err != nil {
		t.Fatalf("RevealSecret failed: %v", err)
	}
	if len(secret.Secrets) != 0 {
		t.Fatalf("expected 0 secrets in shared bundle, got %d", len(secret.Secrets))
	}
}

func TestEncryptedSelfBundleRoundtrip(t *testing.T) {
	pub := BundlePublic{
		Models: []ModelEntryPublic{
			{
				Provider:  "deepseek",
				ID:        "deepseek-reasoner",
				ModelType: ModelTypeText,
			},
		},
	}
	secret := &BundleSecret{
		Endpoints: map[string]string{"deepseek": "https://api.deepseek.com"},
		Secrets: map[string]ProviderSecret{
			"deepseek": {APIKey: "sk-deepseek-go-key"},
		},
	}

	bundle, err := BuildBundle(BuildBundleOptions{
		Trust:    TrustModeSelf,
		Pub:      pub,
		Secret:   secret,
		Password: "go-test-password",
		Hint:     "go sdk unit test",
	})
	if err != nil {
		t.Fatalf("BuildBundle failed: %v", err)
	}

	fileStr, err := BundleToFileString(bundle)
	if err != nil {
		t.Fatalf("BundleToFileString failed: %v", err)
	}

	parsed, err := ParseBundleFromFileString(fileStr)
	if err != nil {
		t.Fatalf("ParseBundleFromFileString failed: %v", err)
	}

	revealed, err := RevealSecret(parsed, "go-test-password")
	if err != nil {
		t.Fatalf("RevealSecret failed: %v", err)
	}

	if revealed.Secrets["deepseek"].APIKey != "sk-deepseek-go-key" {
		t.Fatalf("expected sk-deepseek-go-key, got %s", revealed.Secrets["deepseek"].APIKey)
	}
}

func TestOAuthCredentialHandling(t *testing.T) {
	pub := BundlePublic{
		Models: []ModelEntryPublic{
			{Provider: "deepseek", ID: "deepseek-chat"},
		},
	}
	secret := &BundleSecret{
		Secrets: map[string]ProviderSecret{
			"deepseek": {
				OAuth: &OAuthCredential{
					Type:        "oidc",
					AccessToken: "go-access-token",
					RedirectURI: "agentconfig://auth/callback",
				},
			},
		},
	}

	bundle, err := BuildBundle(BuildBundleOptions{
		Trust:    TrustModeSelf,
		Pub:      pub,
		Secret:   secret,
		Password: "oauth-password",
	})
	if err != nil {
		t.Fatalf("BuildBundle failed: %v", err)
	}

	revealed, err := RevealSecret(bundle, "oauth-password")
	if err != nil {
		t.Fatalf("RevealSecret failed: %v", err)
	}

	if revealed.Secrets["deepseek"].OAuth == nil || revealed.Secrets["deepseek"].OAuth.Type != "oidc" {
		t.Fatalf("unexpected oauth credential: %+v", revealed.Secrets["deepseek"].OAuth)
	}
	if revealed.Secrets["deepseek"].OAuth.AccessToken != "go-access-token" {
		t.Fatalf("unexpected access token: %s", revealed.Secrets["deepseek"].OAuth.AccessToken)
	}
}

func TestTrustViolations(t *testing.T) {
	secret := &BundleSecret{
		Secrets: map[string]ProviderSecret{
			"deepseek": {APIKey: "sk-secret"},
		},
	}

	// 1. shared cannot have secrets
	_, err := BuildBundle(BuildBundleOptions{
		Trust:  TrustModeShared,
		Pub:    BundlePublic{},
		Secret: secret,
	})
	if err == nil || !strings.Contains(err.Error(), "shared") {
		t.Fatalf("expected error for shared bundle with secrets, got %v", err)
	}

	// 2. self with secrets must be encrypted
	_, err = BuildBundle(BuildBundleOptions{
		Trust:    TrustModeSelf,
		Pub:      BundlePublic{},
		Secret:   secret,
		Password: "",
	})
	if err == nil || !strings.Contains(err.Error(), "encrypted") {
		t.Fatalf("expected error for plaintext self bundle with secrets, got %v", err)
	}

	// 3. hint cannot contain password
	_, err = BuildBundle(BuildBundleOptions{
		Trust:    TrustModeSelf,
		Pub:      BundlePublic{},
		Password: "hunter2",
		Hint:     "mypass is hunter2 ok",
	})
	if err == nil || !strings.Contains(err.Error(), "hint") {
		t.Fatalf("expected error for hint containing password, got %v", err)
	}
}
