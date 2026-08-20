package agentconfig

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

func utf8ByteLength(s string) int {
	return len([]byte(s))
}

func assertSerializedSize(serialized string) error {
	size := utf8ByteLength(serialized)
	if size > MaxBundleBytes {
		return fmt.Errorf("bundle exceeds maximum decoded size (%d > %d bytes)", size, MaxBundleBytes)
	}
	return nil
}

func HasSecrets(secret *BundleSecret) bool {
	if secret == nil {
		return false
	}
	return len(secret.Secrets) > 0
}

func AssertSecretPolicy(trust string, secret *BundleSecret, encrypted bool) error {
	if !HasSecrets(secret) {
		return nil
	}
	if trust == TrustModeShared {
		return errors.New("trust=\"shared\" bundles MUST NOT carry provider credentials")
	}
	if !encrypted {
		return fmt.Errorf("trust=\"%s\" bundles carrying credentials MUST be password-encrypted", trust)
	}
	return nil
}

func DeriveCapabilities(pub BundlePublic) []string {
	var caps []string
	if len(pub.Mcp) > 0 {
		caps = append(caps, CapabilityMcp)
	}
	if len(pub.Models) > 0 {
		caps = append(caps, CapabilityModels)
	}
	if len(pub.Skills) > 0 {
		caps = append(caps, CapabilitySkills)
	}
	if len(pub.Prompts) > 0 {
		caps = append(caps, CapabilityPrompts)
	}
	if len(pub.Agents) > 0 {
		caps = append(caps, CapabilityAgents)
	}
	if len(pub.Resources) > 0 {
		caps = append(caps, CapabilityResources)
	}
	return caps
}

func ValidateBundle(bundle *ConfigBundle) (*ConfigBundle, error) {
	if bundle.Schema != SchemaID {
		return nil, fmt.Errorf("invalid schema ID: expected \"%s\", got \"%s\"", SchemaID, bundle.Schema)
	}
	if bundle.V != Version {
		return nil, fmt.Errorf("unsupported bundle version: %d", bundle.V)
	}

	switch bundle.Payload.Alg {
	case AlgorithmPbkdf2Sha256Aes256Gcm:
		if bundle.Payload.Iterations == nil {
			return nil, errors.New("missing iterations in encrypted payload")
		}
		salt, err := fromB64(bundle.Payload.Salt, "salt")
		if err != nil {
			return nil, err
		}
		if len(salt) != SaltBytes {
			return nil, fmt.Errorf("invalid salt length: expected %d bytes, got %d", SaltBytes, len(salt))
		}
		iv, err := fromB64(bundle.Payload.IV, "IV")
		if err != nil {
			return nil, err
		}
		if len(iv) != IVBytes {
			return nil, fmt.Errorf("invalid IV length: expected %d bytes, got %d", IVBytes, len(iv))
		}
		ct, err := fromB64(bundle.Payload.CT, "ciphertext")
		if err != nil {
			return nil, err
		}
		if len(ct) < GCMTagBytes {
			return nil, errors.New("ciphertext too short (missing GCM tag)")
		}
		if err := validateIterations(*bundle.Payload.Iterations); err != nil {
			return nil, err
		}

	case AlgorithmNone:
		rawBytes, err := fromB64(bundle.Payload.CT, "plaintext secret payload")
		if err != nil {
			return nil, err
		}
		var secret BundleSecret
		if err := json.Unmarshal(rawBytes, &secret); err != nil {
			return nil, fmt.Errorf("invalid secret JSON: %w", err)
		}
		if err := AssertSecretPolicy(bundle.Trust, &secret, false); err != nil {
			return nil, err
		}

	default:
		return nil, fmt.Errorf("unknown encryption algorithm: %s", bundle.Payload.Alg)
	}

	return bundle, nil
}

type BuildBundleOptions struct {
	Label        string
	Src          string
	Hint         string
	Trust        string
	Capabilities []string
	Pub          BundlePublic
	Secret       *BundleSecret
	Password     string
	Iterations   int
}

func BuildBundle(opts BuildBundleOptions) (*ConfigBundle, error) {
	trust := opts.Trust
	if trust == "" {
		trust = TrustModeShared
	}

	secret := opts.Secret
	if secret == nil {
		secret = &BundleSecret{
			Endpoints:     map[string]string{},
			CustomPrompts: map[string]string{},
			ProviderHints: []ProviderHint{},
			Secrets:       map[string]ProviderSecret{},
		}
	}
	if secret.Endpoints == nil {
		secret.Endpoints = map[string]string{}
	}
	if secret.CustomPrompts == nil {
		secret.CustomPrompts = map[string]string{}
	}
	if secret.ProviderHints == nil {
		secret.ProviderHints = []ProviderHint{}
	}
	if secret.Secrets == nil {
		secret.Secrets = map[string]ProviderSecret{}
	}

	encrypted := len(opts.Password) > 0
	if opts.Hint != "" && opts.Password != "" && strings.Contains(opts.Hint, opts.Password) {
		return nil, errors.New("password hint MUST NOT contain the password")
	}

	if err := AssertSecretPolicy(trust, secret, encrypted); err != nil {
		return nil, err
	}

	secretBytes, err := json.Marshal(secret)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize secret section: %w", err)
	}

	iterations := opts.Iterations
	if iterations == 0 {
		iterations = PBKDF2MinIterations
	}

	var payload EncryptionPayload
	if encrypted {
		encResult, err := EncryptWithPassword(string(secretBytes), opts.Password, iterations)
		if err != nil {
			return nil, err
		}
		payload = EncryptionPayload{
			Alg:        AlgorithmPbkdf2Sha256Aes256Gcm,
			Iterations: &encResult.Iterations,
			Salt:       encResult.Salt,
			IV:         encResult.IV,
			CT:         encResult.CT,
		}
	} else {
		payload = EncryptionPayload{
			Alg: AlgorithmNone,
			CT:  toB64(secretBytes),
		}
	}

	caps := opts.Capabilities
	if caps == nil {
		caps = DeriveCapabilities(opts.Pub)
	}

	pub := opts.Pub
	if pub.Mcp == nil {
		pub.Mcp = []McpEntryPublic{}
	}
	if pub.Models == nil {
		pub.Models = []ModelEntryPublic{}
	}
	if pub.Skills == nil {
		pub.Skills = []SkillEntryPublic{}
	}
	if pub.Prompts == nil {
		pub.Prompts = []PromptEntryPublic{}
	}
	if pub.Agents == nil {
		pub.Agents = []AgentEntryPublic{}
	}
	if pub.Resources == nil {
		pub.Resources = []ResourceEntryPublic{}
	}

	bundle := &ConfigBundle{
		Schema:       SchemaID,
		V:            Version,
		Created:      time.Now().UnixMilli(),
		Trust:        trust,
		Capabilities: caps,
		Label:        opts.Label,
		Src:          opts.Src,
		Hint:         opts.Hint,
		Payload:      payload,
		Pub:          pub,
	}

	serialized, err := json.Marshal(bundle)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize bundle: %w", err)
	}
	if err := assertSerializedSize(string(serialized)); err != nil {
		return nil, err
	}

	return ValidateBundle(bundle)
}

func ParseBundle(raw []byte) (*ConfigBundle, error) {
	if err := assertSerializedSize(string(raw)); err != nil {
		return nil, err
	}
	var bundle ConfigBundle
	if err := json.Unmarshal(raw, &bundle); err != nil {
		return nil, fmt.Errorf("invalid bundle JSON: %w", err)
	}
	return ValidateBundle(&bundle)
}

func BundleToDeepLink(bundle *ConfigBundle, scheme ...string) (string, error) {
	s := DeepLinkScheme
	if len(scheme) > 0 && scheme[0] != "" {
		s = scheme[0]
	}
	validated, err := ValidateBundle(bundle)
	if err != nil {
		return "", err
	}
	jsonBytes, err := json.Marshal(validated)
	if err != nil {
		return "", fmt.Errorf("failed to marshal bundle: %w", err)
	}
	encoded := toB64URL(jsonBytes)
	if len(encoded) > DeepLinkMaxBytes {
		return "", fmt.Errorf("bundle too large for deep link (%d > %d). Use %s file export instead.", len(encoded), DeepLinkMaxBytes, FileExtension)
	}
	return fmt.Sprintf("%s://import?v=%d&bundle=%s", s, validated.V, encoded), nil
}

func ExtractBundleFromDeepLink(rawURL string, scheme ...string) (*ConfigBundle, error) {
	s := DeepLinkScheme
	if len(scheme) > 0 && scheme[0] != "" {
		s = scheme[0]
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid deep link URL: %w", err)
	}
	if u.Scheme != s {
		return nil, fmt.Errorf("unexpected scheme: %s", u.Scheme)
	}
	hostname := u.Hostname()
	if hostname == "" {
		hostname = u.Host
	}
	if hostname != "import" {
		return nil, fmt.Errorf("unexpected deep link host: %s", hostname)
	}

	v := u.Query().Get("v")
	if v != fmt.Sprintf("%d", Version) {
		return nil, fmt.Errorf("unsupported deep link version: %s", v)
	}

	encoded := u.Query().Get("bundle")
	if encoded == "" {
		return nil, errors.New("missing bundle parameter")
	}
	if len(encoded) > DeepLinkMaxBytes {
		return nil, fmt.Errorf("deep link payload exceeds maximum size (%d > %d)", len(encoded), DeepLinkMaxBytes)
	}

	jsonBytes, err := fromB64URL(encoded)
	if err != nil {
		return nil, err
	}
	if err := assertSerializedSize(string(jsonBytes)); err != nil {
		return nil, err
	}

	bundle, err := ParseBundle(jsonBytes)
	if err != nil {
		return nil, err
	}
	if fmt.Sprintf("%d", bundle.V) != v {
		return nil, fmt.Errorf("deep link version %s does not match bundle version %d", v, bundle.V)
	}
	return bundle, nil
}

func BundleToFileString(bundle *ConfigBundle) (string, error) {
	validated, err := ValidateBundle(bundle)
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(validated, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func ParseBundleFromFileString(text string) (*ConfigBundle, error) {
	return ParseBundle([]byte(text))
}

func IsPasswordRequired(bundle *ConfigBundle) bool {
	return bundle.Payload.Alg == AlgorithmPbkdf2Sha256Aes256Gcm
}

func RevealSecret(bundle *ConfigBundle, password ...string) (*BundleSecret, error) {
	validated, err := ValidateBundle(bundle)
	if err != nil {
		return nil, err
	}
	var secretJSON string
	if validated.Payload.Alg == AlgorithmNone {
		rawBytes, err := fromB64(validated.Payload.CT, "plaintext secret payload")
		if err != nil {
			return nil, err
		}
		secretJSON = string(rawBytes)
	} else {
		if len(password) == 0 || password[0] == "" {
			return nil, errors.New("password required")
		}
		if validated.Payload.Iterations == nil {
			return nil, errors.New("missing iterations in encrypted payload")
		}
		plaintext, err := DecryptWithPassword(
			validated.Payload.Salt,
			validated.Payload.IV,
			validated.Payload.CT,
			*validated.Payload.Iterations,
			password[0],
		)
		if err != nil {
			return nil, err
		}
		secretJSON = plaintext
	}

	var secret BundleSecret
	if err := json.Unmarshal([]byte(secretJSON), &secret); err != nil {
		return nil, fmt.Errorf("invalid secret JSON: %w", err)
	}

	if err := AssertSecretPolicy(validated.Trust, &secret, validated.Payload.Alg == AlgorithmPbkdf2Sha256Aes256Gcm); err != nil {
		return nil, err
	}

	return &secret, nil
}
