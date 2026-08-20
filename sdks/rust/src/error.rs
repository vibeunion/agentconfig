use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentConfigError {
    #[error("Invalid schema ID: expected {expected}, got {actual}")]
    InvalidSchema { expected: String, actual: String },

    #[error("Unsupported bundle version: {0}")]
    UnsupportedVersion(u32),

    #[error("Bundle exceeds maximum decoded size ({size} > {max} bytes)")]
    BundleTooLarge { size: usize, max: usize },

    #[error("Deep link exceeds maximum length ({len} > {max})")]
    DeepLinkTooLong { len: usize, max: usize },

    #[error("Trust policy violation: {0}")]
    TrustPolicyViolation(String),

    #[error("Password error: {0}")]
    PasswordError(String),

    #[error("Crypto error: {0}")]
    CryptoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("URL parsing error: {0}")]
    UrlError(#[from] url::ParseError),

    #[error("Base64 error: {0}")]
    Base64Error(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

pub type Result<T> = std::result::Result<T, AgentConfigError>;
