from __future__ import annotations
import json
import time
from typing import Any, Dict, List, Optional, Union
from urllib.parse import parse_qs, urlparse

from .crypto import (
    decrypt_with_password,
    encrypt_with_password,
    from_b64,
    from_b64url,
    to_b64,
    to_b64url,
    validate_iterations,
)
from .schema import (
    ACB_DEEP_LINK_MAX_BYTES,
    ACB_DEEP_LINK_SCHEME,
    ACB_FILE_EXTENSION,
    ACB_MAX_BUNDLE_BYTES,
    ACB_MIME_TYPE,
    ACB_PBKDF2_MIN_ITERATIONS,
    ACB_SCHEMA_ID,
    ACB_VERSION,
    AcbCapability,
    AcbEncryptionAlgorithm,
    AcbTrustMode,
    BundlePublic,
    BundleSecret,
    ConfigBundle,
    EncryptionPayload,
)


def utf8_byte_length(value: str) -> int:
    return len(value.encode("utf-8"))


def assert_serialized_size(serialized: str) -> None:
    size = utf8_byte_length(serialized)
    if size > ACB_MAX_BUNDLE_BYTES:
        raise ValueError(f"Bundle exceeds maximum decoded size ({size} > {ACB_MAX_BUNDLE_BYTES} bytes)")


def has_secrets(secret: Optional[Union[BundleSecret, Dict[str, Any]]]) -> bool:
    if secret is None:
        return False
    if isinstance(secret, BundleSecret):
        return len(secret.secrets) > 0
    if isinstance(secret, dict):
        return len(secret.get("secrets", {})) > 0
    return False


def assert_secret_policy(trust: str, secret: Optional[Union[BundleSecret, Dict[str, Any]]], encrypted: bool) -> None:
    if not has_secrets(secret):
        return
    if trust == AcbTrustMode.Shared.value:
        raise ValueError('trust="shared" bundles MUST NOT carry provider credentials')
    if not encrypted:
        raise ValueError(f'trust="{trust}" bundles carrying credentials MUST be password-encrypted')


def derive_capabilities(pub: BundlePublic) -> List[str]:
    caps: List[str] = []
    if len(pub.mcp) > 0:
        caps.append(AcbCapability.Mcp.value)
    if len(pub.models) > 0:
        caps.append(AcbCapability.Models.value)
    if len(pub.skills) > 0:
        caps.append(AcbCapability.Skills.value)
    if len(pub.prompts) > 0:
        caps.append(AcbCapability.Prompts.value)
    if len(pub.agents) > 0:
        caps.append(AcbCapability.Agents.value)
    if len(pub.resources) > 0:
        caps.append(AcbCapability.Resources.value)
    return caps


def validate_bundle(bundle: ConfigBundle) -> ConfigBundle:
    if bundle.schema != ACB_SCHEMA_ID:
        raise ValueError(f'Invalid schema ID: expected "{ACB_SCHEMA_ID}", got "{bundle.schema}"')
    if bundle.v != ACB_VERSION:
        raise ValueError(f"Unsupported bundle version: {bundle.v}")
    if bundle.payload.alg == AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm.value:
        if not bundle.payload.salt or not bundle.payload.iv or not bundle.payload.ct or not bundle.payload.iterations:
            raise ValueError("Missing required fields in encrypted payload")
        salt = from_b64(bundle.payload.salt, "salt")
        iv = from_b64(bundle.payload.iv, "IV")
        ct = from_b64(bundle.payload.ct, "ciphertext")
        if len(salt) != 16:
            raise ValueError("Invalid salt length: expected 16 bytes")
        if len(iv) != 12:
            raise ValueError("Invalid IV length: expected 12 bytes")
        if len(ct) < 16:
            raise ValueError("Ciphertext too short (missing GCM tag)")
        validate_iterations(bundle.payload.iterations)
    elif bundle.payload.alg == AcbEncryptionAlgorithm.NoneAlg.value:
        raw_bytes = from_b64(bundle.payload.ct, "plaintext secret payload")
        secret_json = raw_bytes.decode("utf-8")
        secret_data = json.loads(secret_json)
        assert_secret_policy(bundle.trust, secret_data, False)
    else:
        raise ValueError(f"Unknown encryption algorithm: {bundle.payload.alg}")
    return bundle


def build_bundle(
    pub: Union[BundlePublic, Dict[str, Any]],
    secret: Optional[Union[BundleSecret, Dict[str, Any]]] = None,
    trust: str = AcbTrustMode.Shared.value,
    password: Optional[str] = None,
    iterations: int = ACB_PBKDF2_MIN_ITERATIONS,
    label: Optional[str] = None,
    src: Optional[str] = None,
    hint: Optional[str] = None,
    capabilities: Optional[List[str]] = None,
) -> ConfigBundle:
    pub_obj = pub if isinstance(pub, BundlePublic) else BundlePublic.from_dict(pub)
    secret_obj = (
        secret
        if isinstance(secret, BundleSecret)
        else BundleSecret.from_dict(secret or {})
    )

    encrypted = bool(password)
    if hint and password and password in hint:
        raise ValueError("Password hint MUST NOT contain the password")

    assert_secret_policy(trust, secret_obj, encrypted)
    secret_json = json.dumps(secret_obj.to_dict(), separators=(",", ":"))

    if password:
        enc_res = encrypt_with_password(secret_json, password, iterations)
        payload = EncryptionPayload(
            alg=AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm.value,
            iterations=enc_res["iterations"],
            salt=enc_res["salt"],
            iv=enc_res["iv"],
            ct=enc_res["ct"],
        )
    else:
        payload = EncryptionPayload(
            alg=AcbEncryptionAlgorithm.NoneAlg.value,
            ct=to_b64(secret_json.encode("utf-8")),
        )

    caps = capabilities if capabilities is not None else derive_capabilities(pub_obj)

    bundle = ConfigBundle(
        schema=ACB_SCHEMA_ID,
        v=ACB_VERSION,
        created=int(time.time() * 1000),
        label=label,
        src=src,
        trust=trust,
        capabilities=caps,
        hint=hint,
        payload=payload,
        pub=pub_obj,
    )
    serialized = json.dumps(bundle.to_dict())
    assert_serialized_size(serialized)
    return validate_bundle(bundle)


def parse_bundle(raw: Union[Dict[str, Any], str]) -> ConfigBundle:
    if isinstance(raw, str):
        assert_serialized_size(raw)
        data = json.loads(raw)
    elif isinstance(raw, dict):
        serialized = json.dumps(raw)
        assert_serialized_size(serialized)
        data = raw
    else:
        raise TypeError("raw bundle must be a dict or JSON string")
    bundle = ConfigBundle.from_dict(data)
    return validate_bundle(bundle)


def bundle_to_deep_link(bundle: ConfigBundle, scheme: str = ACB_DEEP_LINK_SCHEME) -> str:
    validated = validate_bundle(bundle)
    json_str = json.dumps(validated.to_dict(), separators=(",", ":"))
    encoded = to_b64url(json_str.encode("utf-8"))
    if len(encoded) > ACB_DEEP_LINK_MAX_BYTES:
        raise ValueError(
            f"Bundle too large for deep link ({len(encoded)} > {ACB_DEEP_LINK_MAX_BYTES}). Use {ACB_FILE_EXTENSION} file export instead."
        )
    return f"{scheme}://import?v={validated.v}&bundle={encoded}"


def extract_bundle_from_deep_link(url: str, scheme: str = ACB_DEEP_LINK_SCHEME) -> ConfigBundle:
    parsed = urlparse(url)
    if parsed.scheme != scheme:
        raise ValueError(f"Unexpected scheme: {parsed.scheme}")
    if parsed.netloc != "import" and parsed.path != "//import":
        # Handle cases where urlparse splits agentconfig://import differently
        hostname = parsed.hostname or parsed.netloc
        if hostname != "import":
            raise ValueError(f"Unexpected deep link host: {hostname}")
    qs = parse_qs(parsed.query)
    v_list = qs.get("v")
    if not v_list or v_list[0] != str(ACB_VERSION):
        raise ValueError(f"Unsupported deep link version: {v_list[0] if v_list else '(missing)'}")
    bundle_list = qs.get("bundle")
    if not bundle_list or not bundle_list[0]:
        raise ValueError("Missing bundle parameter")
    encoded = bundle_list[0]
    if len(encoded) > ACB_DEEP_LINK_MAX_BYTES:
        raise ValueError(f"Deep link payload exceeds maximum size ({len(encoded)} > {ACB_DEEP_LINK_MAX_BYTES})")
    raw_bytes = from_b64url(encoded)
    json_str = raw_bytes.decode("utf-8")
    assert_serialized_size(json_str)
    bundle = parse_bundle(json_str)
    if bundle.v != int(v_list[0]):
        raise ValueError(f"Deep link version {v_list[0]} does not match bundle version {bundle.v}")
    return bundle


def bundle_to_file_string(bundle: ConfigBundle) -> str:
    validated = validate_bundle(bundle)
    return json.dumps(validated.to_dict(), indent=2)


def parse_bundle_from_file_string(text: str) -> ConfigBundle:
    assert_serialized_size(text)
    return parse_bundle(text)


def is_password_required(bundle: ConfigBundle) -> bool:
    return bundle.payload.alg == AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm.value


def reveal_secret(bundle: ConfigBundle, password: Optional[str] = None) -> BundleSecret:
    validated = validate_bundle(bundle)
    payload = validated.payload
    if payload.alg == AcbEncryptionAlgorithm.NoneAlg.value:
        raw_bytes = from_b64(payload.ct, "plaintext secret payload")
        secret_json = raw_bytes.decode("utf-8")
    else:
        if not password:
            raise ValueError("Password required")
        if not payload.salt or not payload.iv or not payload.ct or not payload.iterations:
            raise ValueError("Incomplete encryption parameters")
        secret_json = decrypt_with_password(
            salt_b64=payload.salt,
            iv_b64=payload.iv,
            ct_b64=payload.ct,
            iterations=payload.iterations,
            password=password,
        )

    secret_data = json.loads(secret_json)
    secret = BundleSecret.from_dict(secret_data)
    assert_secret_policy(
        validated.trust,
        secret,
        payload.alg == AcbEncryptionAlgorithm.Pbkdf2Sha256Aes256Gcm.value,
    )
    return secret
