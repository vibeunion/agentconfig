use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const ACB_VERSION: u32 = 1;
pub const ACB_SCHEMA_ID: &str = "agentconfig-bundle";
pub const ACB_DEEP_LINK_MAX_BYTES: usize = 20_000;
pub const ACB_MAX_BUNDLE_BYTES: usize = 1_000_000;
pub const ACB_DEEP_LINK_SCHEME: &str = "agentconfig";
pub const ACB_FILE_EXTENSION: &str = ".acfg";
pub const ACB_MIME_TYPE: &str = "application/x-agentconfig+json";

pub const ACB_PBKDF2_MIN_ITERATIONS: u32 = 100_000;
pub const ACB_PBKDF2_MAX_ITERATIONS: u32 = 1_000_000;

pub const ALG_PBKDF2_SHA256_AES256_GCM: &str = "PBKDF2-SHA256-AES-256-GCM";
pub const ALG_NONE: &str = "none";

pub const TRUST_SHARED: &str = "shared";
pub const TRUST_SELF: &str = "self";
pub const TRUST_MANAGED: &str = "managed";

pub const CAPABILITY_MCP: &str = "mcp";
pub const CAPABILITY_MODELS: &str = "models";
pub const CAPABILITY_SKILLS: &str = "skills";
pub const CAPABILITY_PROMPTS: &str = "prompts";
pub const CAPABILITY_AGENTS: &str = "agents";
pub const CAPABILITY_RESOURCES: &str = "resources";

pub const MODEL_TYPE_TEXT: &str = "text";
pub const MODEL_TYPE_MULTIMODAL: &str = "multimodal";
pub const MODEL_TYPE_IMAGE_GENERATION: &str = "image-generation";
pub const MODEL_TYPE_VIDEO_GENERATION: &str = "video-generation";

pub const GENERATION_MODE_TEXT_TO_IMAGE: &str = "text-to-image";
pub const GENERATION_MODE_IMAGE_TO_IMAGE: &str = "image-to-image";
pub const GENERATION_MODE_TEXT_TO_VIDEO: &str = "text-to-video";
pub const GENERATION_MODE_IMAGE_TO_VIDEO: &str = "image-to-video";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpEntryPublic {
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub transport: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub env_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntryPublic {
    pub provider: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_modes: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<HashMap<String, serde_json::Value>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntryPublic {
    pub id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i64>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptEntryPublic {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntryPublic {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skill_ids: Vec<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEntryPublic {
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BundlePublic {
    #[serde(default)]
    pub mcp: Vec<McpEntryPublic>,
    #[serde(default)]
    pub models: Vec<ModelEntryPublic>,
    #[serde(default)]
    pub skills: Vec<SkillEntryPublic>,
    #[serde(default)]
    pub prompts: Vec<PromptEntryPublic>,
    #[serde(default)]
    pub agents: Vec<AgentEntryPublic>,
    #[serde(default)]
    pub resources: Vec<ResourceEntryPublic>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCredential {
    #[serde(rename = "type")]
    pub credential_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expired: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
    #[serde(default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSecret {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth: Option<OAuthCredential>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHint {
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BundleSecret {
    #[serde(default)]
    pub endpoints: HashMap<String, String>,
    #[serde(default)]
    pub custom_prompts: HashMap<String, String>,
    #[serde(default)]
    pub provider_hints: Vec<ProviderHint>,
    #[serde(default)]
    pub secrets: HashMap<String, ProviderSecret>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionPayload {
    pub alg: String,
    pub ct: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub salt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iv: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBundle {
    pub schema: String,
    pub v: u32,
    pub created: i64,
    #[serde(default = "default_shared")]
    pub trust: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub payload: EncryptionPayload,
    #[serde(rename = "pub")]`n    pub pub_section: BundlePublic,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn default_shared() -> String {
    TRUST_SHARED.to_string()
}
