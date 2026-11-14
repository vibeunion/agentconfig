package agentconfig

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

const vectorPassword = "agentconfig-v1.5-test"

func v15Bundle(t *testing.T) *ConfigBundle {
	t.Helper()
	raw, err := os.ReadFile("../../examples/vectors/v1.5.acfg")
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := ParseBundle(raw)
	if err != nil {
		t.Fatal(err)
	}
	return bundle
}

func TestV15VectorSurvivesBothCarriers(t *testing.T) {
	bundle := v15Bundle(t)
	if bundle.Pub.Agents[0].PromptID == nil || *bundle.Pub.Agents[0].PromptID != "researcher-instructions" {
		t.Fatal("agent promptId was lost")
	}
	file, err := BundleToFileString(bundle)
	if err != nil {
		t.Fatal(err)
	}
	link, err := BundleToDeepLink(bundle)
	if err != nil {
		t.Fatal(err)
	}
	fileBundle, err := ParseBundleFromFileString(file)
	if err != nil {
		t.Fatal(err)
	}
	linkBundle, err := ExtractBundleFromDeepLink(link)
	if err != nil {
		t.Fatal(err)
	}
	for _, imported := range []*ConfigBundle{fileBundle, linkBundle} {
		secret, err := RevealSecret(imported, vectorPassword)
		if err != nil {
			t.Fatal(err)
		}
		if secret.Secrets["remote"].URL == nil || *secret.Secrets["remote"].URL != "https://mcp.example.com/sse" {
			t.Fatal("remote MCP URL was lost")
		}
		if secret.CustomPrompts["researcher-instructions"] != "Inspect the workspace before proposing changes." {
			t.Fatal("agent instructions were lost")
		}
		extensions := []struct {
			fields map[string]json.RawMessage
			name   string
		}{
			{imported.Extra, "x-envelope"}, {imported.Payload.Extra, "x-payload"},
			{imported.Pub.Extra, "x-public"}, {imported.Pub.Mcp[0].Extra, "x-mcp"},
			{imported.Pub.Models[0].Extra, "x-model"}, {imported.Pub.Skills[0].Extra, "x-skill"},
			{imported.Pub.Prompts[0].Extra, "x-prompt"}, {imported.Pub.Agents[0].Extra, "x-agent"},
			{imported.Pub.Resources[0].Extra, "x-resource"}, {secret.Extra, "x-secret"},
			{secret.ProviderHints[0].Extra, "x-hint"}, {secret.Secrets["remote"].Extra, "x-provider"},
			{secret.Secrets["remote"].OAuth.UnknownFields, "x-oauth"},
		}
		for _, extension := range extensions {
			var decoded map[string]bool
			if err := json.Unmarshal(extension.fields[extension.name], &decoded); err != nil {
				t.Fatal(extension.name, err)
			}
			if !decoded["retained"] {
				t.Fatalf("extension %s was lost", extension.name)
			}
		}
		encoded, err := json.Marshal(secret)
		if err != nil {
			t.Fatal(err)
		}
		var decoded map[string]interface{}
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatal(err)
		}
		oauth := decoded["secrets"].(map[string]interface{})["remote"].(map[string]interface{})["oauth"].(map[string]interface{})
		if !reflect.DeepEqual(oauth["extra"], map[string]interface{}{"vendor": true}) || oauth["x-oauth"] == nil {
			t.Fatal("OAuth extensions changed location")
		}
	}
}

func TestV15PromptBindingAndLegacyOmission(t *testing.T) {
	for _, promptID := range []string{"", "missing", strings.Repeat("x", 65)} {
		bundle := v15Bundle(t)
		bundle.Pub.Agents[0].PromptID = &promptID
		if _, err := ValidateBundle(bundle); err == nil {
			t.Fatalf("accepted promptId %q", promptID)
		}
	}
	bundle := v15Bundle(t)
	bundle.Pub.Agents[0].PromptID = nil
	if _, err := ValidateBundle(bundle); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(bundle.Pub.Agents[0])
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "promptId") {
		t.Fatal("absent promptId was emitted")
	}
	encoded, err = json.Marshal(ProviderSecret{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), `"url"`) {
		t.Fatal("absent URL was emitted")
	}
}

func TestV15RemoteURLValidation(t *testing.T) {
	bundle := v15Bundle(t)
	secret, err := RevealSecret(bundle, vectorPassword)
	if err != nil {
		t.Fatal(err)
	}
	provider := secret.Secrets["remote"]
	invalidURL := "not a url"
	provider.URL = &invalidURL
	secret.Secrets["remote"] = provider
	if _, err := BuildBundle(BuildBundleOptions{Trust: TrustModeSelf, Secret: secret, Password: vectorPassword}); err == nil {
		t.Fatal("accepted invalid remote URL before encryption")
	}
	encoded, err := json.Marshal(secret)
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := EncryptWithPassword(string(encoded), vectorPassword, PBKDF2MinIterations)
	if err != nil {
		t.Fatal(err)
	}
	bundle.Payload.CT, bundle.Payload.Salt, bundle.Payload.IV = encrypted.CT, encrypted.Salt, encrypted.IV
	if _, err := RevealSecret(bundle, vectorPassword); err == nil {
		t.Fatal("accepted invalid URL after decryption")
	}
}

func TestV15UnknownFieldsCannotOverwriteKnownFields(t *testing.T) {
	bundle := v15Bundle(t)
	bundle.Extra["trust"] = json.RawMessage(`"shared"`)
	if _, err := BundleToFileString(bundle); err == nil {
		t.Fatal("extension overwrote trust")
	}
	endpoint := ProviderSecret{Extra: map[string]json.RawMessage{"apiKey": json.RawMessage(`"EXAMPLE_ONLY"`)}}
	if _, err := json.Marshal(endpoint); err == nil {
		t.Fatal("extension overwrote omitted declared field")
	}
}

func TestV15UnknownNumberPrecisionSurvives(t *testing.T) {
	original := `{"id":"agent","futureCounter":9007199254740993}`
	var agent AgentEntryPublic
	if err := json.Unmarshal([]byte(original), &agent); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(agent)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"futureCounter":9007199254740993`) {
		t.Fatal("unknown integer lost precision")
	}
}

func TestV15RemoteURLStillRequiresEncryptedSelfBundle(t *testing.T) {
	endpoint := "https://mcp.example.com/sse"
	secret := &BundleSecret{Secrets: map[string]ProviderSecret{"remote": {URL: &endpoint}}}
	for _, opts := range []BuildBundleOptions{
		{Trust: TrustModeShared, Secret: secret, Password: vectorPassword},
		{Trust: TrustModeSelf, Secret: secret},
	} {
		if _, err := BuildBundle(opts); err == nil {
			t.Fatal("URL-only secrets bypassed credential policy")
		}
	}
}

func TestV15CaseDistinctExtensionsDoNotOverwriteDeclaredFields(t *testing.T) {
	var provider ProviderSecret
	raw := []byte(`{"apiKey":"original","apikey":"extension"}`)
	if err := json.Unmarshal(raw, &provider); err != nil {
		t.Fatal(err)
	}
	if provider.APIKey != "original" || string(provider.Extra["apikey"]) != `"extension"` {
		t.Fatal("case-distinct extension overwrote the declared credential")
	}
	encoded, err := json.Marshal(provider)
	if err != nil {
		t.Fatal(err)
	}
	var restored ProviderSecret
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.APIKey != provider.APIKey || string(restored.Extra["apikey"]) != `"extension"` {
		t.Fatal("case-distinct extension failed roundtrip")
	}
}

func TestV15HTTPURLCasesMatchSharedReference(t *testing.T) {
	raw, err := os.ReadFile("../../examples/vectors/v1.5-urls.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases map[string][]string
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for category, endpoints := range cases {
		for _, endpoint := range endpoints {
			t.Run(endpoint, func(t *testing.T) {
				secret := &BundleSecret{Secrets: map[string]ProviderSecret{"remote": {URL: &endpoint}}}
				_, err := BuildBundle(BuildBundleOptions{Trust: TrustModeSelf, Secret: secret, Password: vectorPassword})
				if (err == nil) != (category == "valid") {
					t.Fatalf("endpoint %q: %v", endpoint, err)
				}
			})
		}
	}
}
