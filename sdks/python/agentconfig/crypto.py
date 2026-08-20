from __future__ import annotations
import base64
import hashlib
import os
import re
from typing import Dict, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .schema import (
    ACB_PBKDF2_MIN_ITERATIONS,
    ACB_PBKDF2_MAX_ITERATIONS,
)

SALT_BYTES: int = 16
IV_BYTES: int = 12
KEY_BYTES: int = 32
GCM_TAG_BYTES: int = 16

BASE64_PATTERN = re.compile(r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$")
BASE64URL_PATTERN = re.compile(r"^[A-Za-z0-9_-]*$")


def validate_password(password: str) -> None:
    if not password:
        raise ValueError("Password must not be empty")


def validate_iterations(iterations: int) -> None:
    if not isinstance(iterations, int) or iterations < ACB_PBKDF2_MIN_ITERATIONS or iterations > ACB_PBKDF2_MAX_ITERATIONS:
        raise ValueError(
            f"PBKDF2 iterations must be an integer between {ACB_PBKDF2_MIN_ITERATIONS} and {ACB_PBKDF2_MAX_ITERATIONS}"
        )


def to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def from_b64(value: str, field_name: str = "base64 value") -> bytes:
    if not BASE64_PATTERN.match(value):
        raise ValueError(f"Invalid {field_name}")
    try:
        decoded = base64.b64decode(value, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid {field_name}: {e}") from e
    if to_b64(decoded) != value:
        raise ValueError(f"Non-canonical {field_name}")
    return decoded


def to_b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def from_b64url(value: str) -> bytes:
    if not BASE64URL_PATTERN.match(value) or len(value) % 4 == 1:
        raise ValueError("Invalid bundle base64url payload")
    pad_len = (-len(value)) % 4
    padded = value + ("=" * pad_len)
    try:
        decoded = base64.urlsafe_b64decode(padded)
    except Exception as e:
        raise ValueError(f"Invalid base64url payload: {e}") from e
    if to_b64url(decoded) != value:
        raise ValueError("Non-canonical bundle base64url payload")
    return decoded


def derive_key(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, KEY_BYTES)


def encrypt_with_password(
    plaintext: str,
    password: str,
    iterations: int = ACB_PBKDF2_MIN_ITERATIONS,
) -> Dict[str, Any]:
    validate_password(password)
    validate_iterations(iterations)
    salt = os.urandom(SALT_BYTES)
    iv = os.urandom(IV_BYTES)
    key = derive_key(password, salt, iterations)
    aes = AESGCM(key)
    ct = aes.encrypt(iv, plaintext.encode("utf-8"), None)
    return {
        "salt": to_b64(salt),
        "iv": to_b64(iv),
        "ct": to_b64(ct),
        "iterations": iterations,
    }


def decrypt_with_password(
    salt_b64: str,
    iv_b64: str,
    ct_b64: str,
    iterations: int,
    password: str,
) -> str:
    validate_password(password)
    validate_iterations(iterations)
    salt = from_b64(salt_b64, "salt")
    iv = from_b64(iv_b64, "IV")
    ct = from_b64(ct_b64, "ciphertext")
    if len(salt) != SALT_BYTES:
        raise ValueError(f"Invalid salt length: expected {SALT_BYTES} bytes, got {len(salt)}")
    if len(iv) != IV_BYTES:
        raise ValueError(f"Invalid IV length: expected {IV_BYTES} bytes, got {len(iv)}")
    if len(ct) < GCM_TAG_BYTES:
        raise ValueError("Ciphertext too short (missing GCM tag)")

    key = derive_key(password, salt, iterations)
    aes = AESGCM(key)
    try:
        pt_bytes = aes.decrypt(iv, ct, None)
    except Exception as e:
        raise ValueError(f"Decryption failed: {e}") from e
    return pt_bytes.decode("utf-8")
