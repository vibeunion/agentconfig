package agentconfig

import "encoding/json"

const (
	Version          = 1
	SchemaID         = "agentconfig-bundle"
	DeepLinkMaxBytes = 20000
	MaxBundleBytes   = 1000000
	DeepLinkScheme   = "agentconfig"
	FileExtension    = ".acfg"
	MimeType         = "application/x-agentconfig+json"

	PBKDF2MinIterations = 100000
	PBKDF2MaxIterations = 1000000
)

const (
	AlgorithmPbkdf2Sha256Aes256Gcm = "PBKDF2-SHA256-AES-256-GCM"
	AlgorithmNone                  = "none"
)

const (
	TrustModeShared  = "shared"
	TrustModeSelf    = "self"
	TrustModeManaged = "managed"
)

const (
	CapabilityMcp       = "mcp"
	CapabilityModels    = "models"
	CapabilitySkills    = "skills"
	CapabilityPrompts   = "prompts"
	CapabilityAgents    = "agents"
	CapabilityResources = "resources"
)

const (
	ModelTypeText            = "text"
	ModelTypeMultimodal      = "multimodal"
	ModelTypeImageGeneration = "image-generation"
	ModelTypeVideoGeneration = "video-generation"
)

const (
	GenerationModeTextToImage  = "text-to-image"
	GenerationModeImageToImage = "image-to-image"
	GenerationModeTextToVideo  = "text-to-video"
	GenerationModeImageToVideo = "image-to-video"
)

type McpEntryPublic struct {
	Name        string                     `json:"name"`
	Transport   string                     `json:"transport"`
	Enabled     bool                       `json:"enabled"`
	Command     string                     `json:"command,omitempty"`
	Args        []string                   `json:"args,omitempty"`
	EnvKeys     []string                   `json:"envKeys,omitempty"`
	RegistryID  string                     `json:"registryId,omitempty"`
	RepoURL     string                     `json:"repoUrl,omitempty"`
	Description string                     `json:"description,omitempty"`
	Extra       map[string]json.RawMessage `json:"-"`
}

type ModelEntryPublic struct {
	Provider        string                     `json:"provider"`
	ID              string                     `json:"id"`
	Alias           string                     `json:"alias,omitempty"`
	MaxTokens       *int                       `json:"maxTokens,omitempty"`
	ContextWindow   *int                       `json:"contextWindow,omitempty"`
	MaxOutputTokens *int                       `json:"maxOutputTokens,omitempty"`
	ModelType       string                     `json:"modelType,omitempty"`
	GenerationModes []string                   `json:"generationModes,omitempty"`
	Parameters      map[string]interface{}     `json:"parameters,omitempty"`
	Extra           map[string]json.RawMessage `json:"-"`
}

type SkillEntryPublic struct {
	ID      string                     `json:"id"`
	Enabled bool                       `json:"enabled"`
	Order   *int                       `json:"order,omitempty"`
	Extra   map[string]json.RawMessage `json:"-"`
}

type PromptEntryPublic struct {
	ID    string                     `json:"id"`
	Title string                     `json:"title,omitempty"`
	Extra map[string]json.RawMessage `json:"-"`
}

type AgentEntryPublic struct {
	ID       string                     `json:"id"`
	Name     string                     `json:"name,omitempty"`
	Model    string                     `json:"model,omitempty"`
	SkillIDs []string                   `json:"skillIds,omitempty"`
	PromptID *string                    `json:"promptId,omitempty"`
	Extra    map[string]json.RawMessage `json:"-"`
}

type ResourceEntryPublic struct {
	URI      string                     `json:"uri"`
	Name     string                     `json:"name,omitempty"`
	MimeType string                     `json:"mimeType,omitempty"`
	Extra    map[string]json.RawMessage `json:"-"`
}

type BundlePublic struct {
	Mcp       []McpEntryPublic           `json:"mcp"`
	Models    []ModelEntryPublic         `json:"models"`
	Skills    []SkillEntryPublic         `json:"skills"`
	Prompts   []PromptEntryPublic        `json:"prompts"`
	Agents    []AgentEntryPublic         `json:"agents"`
	Resources []ResourceEntryPublic      `json:"resources"`
	Extra     map[string]json.RawMessage `json:"-"`
}

type OAuthCredential struct {
	Type          string                     `json:"type"`
	AccessToken   string                     `json:"accessToken,omitempty"`
	RefreshToken  string                     `json:"refreshToken,omitempty"`
	IDToken       string                     `json:"idToken,omitempty"`
	Expired       string                     `json:"expired,omitempty"`
	AccountID     string                     `json:"accountId,omitempty"`
	Email         string                     `json:"email,omitempty"`
	Scope         string                     `json:"scope,omitempty"`
	Issuer        string                     `json:"issuer,omitempty"`
	ClientID      string                     `json:"clientId,omitempty"`
	RedirectURI   string                     `json:"redirectUri,omitempty"`
	Extra         map[string]interface{}     `json:"extra,omitempty"`
	UnknownFields map[string]json.RawMessage `json:"-"`
}

type ProviderSecret struct {
	APIKey  string                     `json:"apiKey,omitempty"`
	Env     map[string]string          `json:"env,omitempty"`
	Headers map[string]string          `json:"headers,omitempty"`
	OAuth   *OAuthCredential           `json:"oauth,omitempty"`
	URL     *string                    `json:"url,omitempty"`
	Extra   map[string]json.RawMessage `json:"-"`
}

type ProviderHint struct {
	Provider string                     `json:"provider"`
	BaseURL  string                     `json:"baseUrl,omitempty"`
	Extra    map[string]json.RawMessage `json:"-"`
}

type BundleSecret struct {
	Endpoints     map[string]string          `json:"endpoints"`
	CustomPrompts map[string]string          `json:"customPrompts"`
	ProviderHints []ProviderHint             `json:"providerHints"`
	Secrets       map[string]ProviderSecret  `json:"secrets"`
	Extra         map[string]json.RawMessage `json:"-"`
}

type EncryptionPayload struct {
	Alg        string                     `json:"alg"`
	CT         string                     `json:"ct"`
	Iterations *int                       `json:"iterations,omitempty"`
	Salt       string                     `json:"salt,omitempty"`
	IV         string                     `json:"iv,omitempty"`
	Extra      map[string]json.RawMessage `json:"-"`
}

type ConfigBundle struct {
	Schema       string                     `json:"schema"`
	V            int                        `json:"v"`
	Created      int64                      `json:"created"`
	Trust        string                     `json:"trust"`
	Capabilities []string                   `json:"capabilities"`
	Label        string                     `json:"label,omitempty"`
	Src          string                     `json:"src,omitempty"`
	Hint         string                     `json:"hint,omitempty"`
	Payload      EncryptionPayload          `json:"payload"`
	Pub          BundlePublic               `json:"pub"`
	Extra        map[string]json.RawMessage `json:"-"`
}
