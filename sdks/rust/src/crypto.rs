use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;

use crate::error::{AgentConfigError, Result};
use crate::schema::{ACB_PBKDF2_MAX_ITERATIONS, ACB_PBKDF2_MIN_ITERATIONS};

pub const SALT_BYTES: usize = 16;
pub const IV_BYTES: usize = 12;
pub const KEY_BYTES: usize = 32;
pub const GCM_TAG_BYTES: usize = 16;

pub fn validate_password(password: &str) -> Result<()> {
    if password.is_empty() {
        return Err(AgentConfigError::PasswordError(
            "Password must not be empty".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_iterations(iterations: u32) -> Result<()> {
    if iterations < ACB_PBKDF2_MIN_ITERATIONS || iterations > ACB_PBKDF2_MAX_ITERATIONS {
        return Err(AgentConfigError::ValidationError(format!(
            "PBKDF2 iterations must be between {} and {}",
            ACB_PBKDF2_MIN_ITERATIONS, ACB_PBKDF2_MAX_ITERATIONS
        )));
    }
    Ok(())
}

pub fn to_b64(data: &[u8]) -> String {
    STANDARD.encode(data)
}

pub fn from_b64(value: &str, field_name: &str) -> Result<Vec<u8>> {
    let decoded = STANDARD
        .decode(value)
        .map_err(|e| AgentConfigError::Base64Error(format!("Invalid {field_name}: {e}")))?;
    if to_b64(&decoded) != value {
        return Err(AgentConfigError::Base64Error(format!(
            "Non-canonical {field_name}"
        )));
    }
    Ok(decoded)
}

pub fn to_b64url(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

pub fn from_b64url(value: &str) -> Result<Vec<u8>> {
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|e| AgentConfigError::Base64Error(format!("Invalid base64url: {e}")))?;
    if to_b64url(&decoded) != value {
        return Err(AgentConfigError::Base64Error(
            "Non-canonical bundle base64url payload".to_string(),
        ));
    }
    Ok(decoded)
}

pub fn derive_key(password: &str, salt: &[u8], iterations: u32) -> [u8; KEY_BYTES] {
    let mut key = [0u8; KEY_BYTES];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut key);
    key
}

pub struct EncryptResult {
    pub salt: String,
    pub iv: String,
    pub ct: String,
    pub iterations: u32,
}

pub fn encrypt_with_password(
    plaintext: &str,
    password: &str,
    iterations: u32,
) -> Result<EncryptResult> {
    validate_password(password)?;
    validate_iterations(iterations)?;

    let mut salt = [0u8; SALT_BYTES];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut iv = [0u8; IV_BYTES];
    rand::thread_rng().fill_bytes(&mut iv);

    let key = derive_key(password, &salt, iterations);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AgentConfigError::CryptoError(e.to_string()))?;
    let nonce = Nonce::from_slice(&iv);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AgentConfigError::CryptoError(e.to_string()))?;

    Ok(EncryptResult {
        salt: to_b64(&salt),
        iv: to_b64(&iv),
        ct: to_b64(&ciphertext),
        iterations,
    })
}

pub fn decrypt_with_password(
    salt_b64: &str,
    iv_b64: &str,
    ct_b64: &str,
    iterations: u32,
    password: &str,
) -> Result<String> {
    validate_password(password)?;
    validate_iterations(iterations)?;

    let salt = from_b64(salt_b64, "salt")?;
    if salt.len() != SALT_BYTES {
        return Err(AgentConfigError::ValidationError(format!(
            "Invalid salt length: expected {SALT_BYTES} bytes, got {}",
            salt.len()
        )));
    }

    let iv = from_b64(iv_b64, "IV")?;
    if iv.len() != IV_BYTES {
        return Err(AgentConfigError::ValidationError(format!(
            "Invalid IV length: expected {IV_BYTES} bytes, got {}",
            iv.len()
        )));
    }

    let ct = from_b64(ct_b64, "ciphertext")?;
    if ct.len() < GCM_TAG_BYTES {
        return Err(AgentConfigError::ValidationError(
            "Ciphertext too short (missing GCM tag)".to_string(),
        ));
    }

    let key = derive_key(password, &salt, iterations);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AgentConfigError::CryptoError(e.to_string()))?;
    let nonce = Nonce::from_slice(&iv);

    let plaintext_bytes = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|e| AgentConfigError::CryptoError(format!("Decryption failed: {e}")))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|e| AgentConfigError::ValidationError(format!("Invalid UTF-8 plaintext: {e}")))
}
