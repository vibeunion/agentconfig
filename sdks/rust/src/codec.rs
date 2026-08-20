use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

use crate::crypto::{
    decrypt_with_password, encrypt_with_password, from_b64, from_b64url, to_b64, to_b64url,
    validate_iterations, GCM_TAG_BYTES, IV_BYTES, SALT_BYTES,
};
use crate::error::{AgentConfigError, Result};
use crate::schema::*;

pub fn assert_serialized_size(serialized: &str) -> Result<()> {
    let size = serialized.len();
    if size > ACB_MAX_BUNDLE_BYTES {
        return Err(AgentConfigError::BundleTooLarge {
            size,
            max: ACB_MAX_BUNDLE_BYTES,
        });
    }
    Ok(())
}

pub fn has_secrets(secret: Option<&BundleSecret>) -> bool {
    secret.map_or(false, |s| !s.secrets.is_empty())
}

pub fn assert_secret_policy(trust: &str, secret: Option<&BundleSecret>, encrypted: bool) -> Result<()> {
    if !has_secrets(secret) {
        return Ok(());
    }
    if trust == TRUST_SHARED {
        return Err(AgentConfigError::TrustPolicyViolation(
            "trust=\"shared\" bundles MUST NOT carry provider credentials".to_string(),
        ));
    }
    if !encrypted {
        return Err(AgentConfigError::TrustPolicyViolation(format!(
            "trust=\"{trust}\" bundles carrying credentials MUST be password-encrypted"
        )));
    }
    Ok(())
}

pub fn derive_capabilities(pub_section: &BundlePublic) -> Vec<String> {
    let mut caps = Vec::new();
    if !pub_section.mcp.is_empty() {
        caps.push(CAPABILITY_MCP.to_string());
    }
    if !pub_section.models.is_empty() {
        caps.push(CAPABILITY_MODELS.to_string());
    }
    if !pub_section.skills.is_empty() {
        caps.push(CAPABILITY_SKILLS.to_string());
    }
    if !pub_section.prompts.is_empty() {
        caps.push(CAPABILITY_PROMPTS.to_string());
    }
    if !pub_section.agents.is_empty() {
        caps.push(CAPABILITY_AGENTS.to_string());
    }
    if !pub_section.resources.is_empty() {
        caps.push(CAPABILITY_RESOURCES.to_string());
    }
    caps
}

pub fn validate_bundle(bundle: &ConfigBundle) -> Result<()> {
    if bundle.schema != ACB_SCHEMA_ID {
        return Err(AgentConfigError::InvalidSchema {
            expected: ACB_SCHEMA_ID.to_string(),
            actual: bundle.schema.clone(),
        });
    }
    if bundle.v != ACB_VERSION {
        return Err(AgentConfigError::UnsupportedVersion(bundle.v));
    }

    match bundle.payload.alg.as_str() {
        ALG_PBKDF2_SHA256_AES256_GCM => {
            let iter = bundle
                .payload
                .iterations
                .ok_or_else(|| AgentConfigError::ValidationError("Missing iterations".to_string()))?;
            let salt_str = bundle
                .payload
                .salt
                .as_ref()
                .ok_or_else(|| AgentConfigError::ValidationError("Missing salt".to_string()))?;
            let iv_str = bundle
                .payload
                .iv
                .as_ref()
                .ok_or_else(|| AgentConfigError::ValidationError("Missing IV".to_string()))?;

            let salt = from_b64(salt_str, "salt")?;
            if salt.len() != SALT_BYTES {
                return Err(AgentConfigError::ValidationError(format!(
                    "Invalid salt length: expected {SALT_BYTES} bytes, got {}",
                    salt.len()
                )));
            }
            let iv = from_b64(iv_str, "IV")?;
            if iv.len() != IV_BYTES {
                return Err(AgentConfigError::ValidationError(format!(
                    "Invalid IV length: expected {IV_BYTES} bytes, got {}",
                    iv.len()
                )));
            }
            let ct = from_b64(&bundle.payload.ct, "ciphertext")?;
            if ct.len() < GCM_TAG_BYTES {
                return Err(AgentConfigError::ValidationError(
                    "Ciphertext too short (missing GCM tag)".to_string(),
                ));
            }
            validate_iterations(iter)?;
        }
        ALG_NONE => {
            let raw_bytes = from_b64(&bundle.payload.ct, "plaintext secret payload")?;
            let secret_str = String::from_utf8(raw_bytes)
                .map_err(|e| AgentConfigError::ValidationError(format!("Invalid UTF-8: {e}")))?;
            let secret: BundleSecret = serde_json::from_str(&secret_str)?;
            assert_secret_policy(&bundle.trust, Some(&secret), false)?;
        }
        other => {
            return Err(AgentConfigError::ValidationError(format!(
                "Unknown encryption algorithm: {other}"
            )));
        }
    }

    Ok(())
}

#[derive(Default)]
pub struct BuildBundleOptions {
    pub label: Option<String>,
    pub src: Option<String>,
    pub hint: Option<String>,
    pub trust: Option<String>,
    pub capabilities: Option<Vec<String>>,
    pub pub_section: BundlePublic,
    pub secret: Option<BundleSecret>,
    pub password: Option<String>,
    pub iterations: Option<u32>,
}

pub fn build_bundle(opts: BuildBundleOptions) -> Result<ConfigBundle> {
    let trust = opts.trust.unwrap_or_else(|| TRUST_SHARED.to_string());
    let default_secret = BundleSecret::default();
    let secret = opts.secret.as_ref().unwrap_or(&default_secret);
    let iterations = opts.iterations.unwrap_or(ACB_PBKDF2_MIN_ITERATIONS);
    validate_iterations(iterations)?;

    let encrypted = opts.password.is_some();
    if let (Some(hint), Some(password)) = (&opts.hint, &opts.password) {
        if hint.contains(password) {
            return Err(AgentConfigError::PasswordError(
                "Password hint MUST NOT contain the password".to_string(),
            ));
        }
    }

    assert_secret_policy(&trust, Some(secret), encrypted)?;
    let secret_json = serde_json::to_string(secret)?;

    let payload = if let Some(password) = &opts.password {
        let enc_res = encrypt_with_password(&secret_json, password, iterations)?;
        EncryptionPayload {
            alg: ALG_PBKDF2_SHA256_AES256_GCM.to_string(),
            ct: enc_res.ct,
            iterations: Some(enc_res.iterations),
            salt: Some(enc_res.salt),
            iv: Some(enc_res.iv),
            extra: Default::default(),
        }
    } else {
        EncryptionPayload {
            alg: ALG_NONE.to_string(),
            ct: to_b64(secret_json.as_bytes()),
            iterations: None,
            salt: None,
            iv: None,
            extra: Default::default(),
        }
    };

    let capabilities = opts
        .capabilities
        .unwrap_or_else(|| derive_capabilities(&opts.pub_section));

    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let bundle = ConfigBundle {
        schema: ACB_SCHEMA_ID.to_string(),
        v: ACB_VERSION,
        created,
        trust,
        capabilities,
        label: opts.label,
        src: opts.src,
        hint: opts.hint,
        payload,
        pub_section: opts.pub_section,
        extra: Default::default(),
    };

    let serialized = serde_json::to_string(&bundle)?;
    assert_serialized_size(&serialized)?;
    validate_bundle(&bundle)?;
    Ok(bundle)
}

pub fn parse_bundle(raw: &str) -> Result<ConfigBundle> {
    assert_serialized_size(raw)?;
    let bundle: ConfigBundle = serde_json::from_str(raw)?;
    validate_bundle(&bundle)?;
    Ok(bundle)
}

pub fn bundle_to_deep_link(bundle: &ConfigBundle, scheme: Option<&str>) -> Result<String> {
    validate_bundle(bundle)?;
    let s = scheme.unwrap_or(ACB_DEEP_LINK_SCHEME);
    let json_str = serde_json::to_string(bundle)?;
    let encoded = to_b64url(json_str.as_bytes());
    if encoded.len() > ACB_DEEP_LINK_MAX_BYTES {
        return Err(AgentConfigError::DeepLinkTooLong {
            len: encoded.len(),
            max: ACB_DEEP_LINK_MAX_BYTES,
        });
    }
    Ok(format!("{s}://import?v={}&bundle={encoded}", bundle.v))
}

pub fn extract_bundle_from_deep_link(raw_url: &str, scheme: Option<&str>) -> Result<ConfigBundle> {
    let s = scheme.unwrap_or(ACB_DEEP_LINK_SCHEME);
    let parsed = Url::parse(raw_url)?;
    if parsed.scheme() != s {
        return Err(AgentConfigError::ValidationError(format!(
            "Unexpected scheme: {}",
            parsed.scheme()
        )));
    }
    if parsed.host_str() != Some("import") {
        return Err(AgentConfigError::ValidationError(format!(
            "Unexpected deep link host: {:?}",
            parsed.host_str()
        )));
    }

    let mut version = None;
    let mut bundle_param = None;

    for (k, v) in parsed.query_pairs() {
        if k == "v" {
            version = Some(v.to_string());
        } else if k == "bundle" {
            bundle_param = Some(v.to_string());
        }
    }

    let v_str = version.ok_or_else(|| {
        AgentConfigError::ValidationError("Missing version parameter".to_string())
    })?;
    if v_str != ACB_VERSION.to_string() {
        return Err(AgentConfigError::UnsupportedVersion(
            v_str.parse().unwrap_or(0),
        ));
    }

    let encoded = bundle_param.ok_or_else(|| {
        AgentConfigError::ValidationError("Missing bundle parameter".to_string())
    })?;
    if encoded.len() > ACB_DEEP_LINK_MAX_BYTES {
        return Err(AgentConfigError::DeepLinkTooLong {
            len: encoded.len(),
            max: ACB_DEEP_LINK_MAX_BYTES,
        });
    }

    let raw_bytes = from_b64url(&encoded)?;
    let json_str = String::from_utf8(raw_bytes)
        .map_err(|e| AgentConfigError::ValidationError(format!("Invalid UTF-8 payload: {e}")))?;
    assert_serialized_size(&json_str)?;

    let bundle = parse_bundle(&json_str)?;
    if bundle.v.to_string() != v_str {
        return Err(AgentConfigError::ValidationError(format!(
            "Deep link version {v_str} does not match bundle version {}",
            bundle.v
        )));
    }
    Ok(bundle)
}

pub fn bundle_to_file_string(bundle: &ConfigBundle) -> Result<String> {
    validate_bundle(bundle)?;
    Ok(serde_json::to_string_pretty(bundle)?)
}

pub fn parse_bundle_from_file_string(text: &str) -> Result<ConfigBundle> {
    parse_bundle(text)
}

pub fn is_password_required(bundle: &ConfigBundle) -> bool {
    bundle.payload.alg == ALG_PBKDF2_SHA256_AES256_GCM
}

pub fn reveal_secret(bundle: &ConfigBundle, password: Option<&str>) -> Result<BundleSecret> {
    validate_bundle(bundle)?;
    let secret_json = if bundle.payload.alg == ALG_NONE {
        let raw_bytes = from_b64(&bundle.payload.ct, "plaintext secret payload")?;
        String::from_utf8(raw_bytes)
            .map_err(|e| AgentConfigError::ValidationError(format!("Invalid UTF-8: {e}")))?
    } else {
        let pwd = password.ok_or_else(|| {
            AgentConfigError::PasswordError("Password required for decryption".to_string())
        })?;
        let salt = bundle
            .payload
            .salt
            .as_ref()
            .ok_or_else(|| AgentConfigError::ValidationError("Missing salt".to_string()))?;
        let iv = bundle
            .payload
            .iv
            .as_ref()
            .ok_or_else(|| AgentConfigError::ValidationError("Missing IV".to_string()))?;
        let iter = bundle
            .payload
            .iterations
            .ok_or_else(|| AgentConfigError::ValidationError("Missing iterations".to_string()))?;

        decrypt_with_password(salt, iv, &bundle.payload.ct, iter, pwd)?
    };

    let secret: BundleSecret = serde_json::from_str(&secret_json)?;
    assert_secret_policy(
        &bundle.trust,
        Some(&secret),
        bundle.payload.alg == ALG_PBKDF2_SHA256_AES256_GCM,
    )?;
    Ok(secret)
}
