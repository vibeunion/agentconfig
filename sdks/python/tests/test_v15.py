import json
from pathlib import Path
import unittest

from agentconfig import (
    AcbTrustMode, BundlePublic, BundleSecret, ProviderSecret,
    build_bundle, bundle_to_deep_link, bundle_to_file_string,
    extract_bundle_from_deep_link, parse_bundle, reveal_secret,
)
from agentconfig.crypto import encrypt_with_password

VECTOR = Path(__file__).resolve().parents[3] / "examples/vectors/v1.5.acfg"
PASSWORD = "agentconfig-v1.5-test"


class TestV15(unittest.TestCase):
    def test_shared_vector_survives_both_carriers(self):
        original = json.loads(VECTOR.read_text())
        bundle = parse_bundle(original)
        self.assertEqual(bundle.pub.agents[0].promptId, "researcher-instructions")
        imports = [parse_bundle(bundle_to_file_string(bundle)),
                   extract_bundle_from_deep_link(bundle_to_deep_link(bundle))]
        for imported in imports:
            encoded = imported.to_dict()
            self.assertEqual(encoded["x-envelope"], original["x-envelope"])
            self.assertEqual(encoded["payload"]["x-payload"], original["payload"]["x-payload"])
            for section, entries in original["pub"].items():
                if section == "x-public":
                    self.assertEqual(encoded["pub"][section], entries)
                else:
                    for key, extension in entries[0].items():
                        if key.startswith("x-"):
                            self.assertEqual(encoded["pub"][section][0][key], extension)
            secret = reveal_secret(imported, PASSWORD)
            self.assertEqual(secret.secrets["remote"].url, "https://mcp.example.com/sse")
            self.assertEqual(secret.customPrompts["researcher-instructions"], "Inspect the workspace before proposing changes.")
            encoded_secret = secret.to_dict()
            self.assertEqual(encoded_secret["x-secret"], {"retained": True})
            self.assertEqual(encoded_secret["providerHints"][0]["x-hint"], {"retained": True})
            provider = encoded_secret["secrets"]["remote"]
            self.assertEqual(provider["x-provider"], {"retained": True})
            self.assertEqual(provider["oauth"]["x-oauth"], {"retained": True})
            self.assertEqual(provider["oauth"]["extra"], {"vendor": True})

    def test_prompt_binding_and_legacy_omission(self):
        for prompt_id in ["", "missing", "x" * 65, 42, False]:
            with self.subTest(prompt_id=prompt_id):
                original = json.loads(VECTOR.read_text())
                original["pub"]["agents"][0]["promptId"] = prompt_id
                with self.assertRaises(ValueError):
                    parse_bundle(original)
        original = json.loads(VECTOR.read_text())
        del original["pub"]["agents"][0]["promptId"]
        bundle = parse_bundle(original)
        self.assertIsNone(bundle.pub.agents[0].promptId)
        self.assertNotIn("promptId", bundle.pub.agents[0].to_dict())
        self.assertNotIn("url", ProviderSecret().to_dict())

    def test_remote_url_is_validated_before_export_and_after_decryption(self):
        bundle = parse_bundle(VECTOR.read_text())
        secret = reveal_secret(bundle, PASSWORD)
        secret.secrets["remote"].url = "not a url"
        with self.assertRaises(ValueError):
            build_bundle(pub=BundlePublic(), secret=secret,
                         trust=AcbTrustMode.Self.value, password=PASSWORD)
        encrypted = encrypt_with_password(json.dumps(secret.to_dict()), PASSWORD)
        bundle.payload.ct = encrypted["ct"]
        bundle.payload.salt = encrypted["salt"]
        bundle.payload.iv = encrypted["iv"]
        with self.assertRaises(ValueError):
            reveal_secret(bundle, PASSWORD)

    def test_remote_url_alone_still_requires_trust_and_encryption(self):
        secret = BundleSecret(secrets={"remote": ProviderSecret(url="https://mcp.example.com/sse")})
        for trust, password in [("shared", PASSWORD), ("self", None)]:
            with self.subTest(trust=trust), self.assertRaises(ValueError):
                build_bundle(pub=BundlePublic(), secret=secret, trust=trust, password=password)

    def test_http_url_cases_match_the_shared_reference(self):
        cases = json.loads(VECTOR.with_name("v1.5-urls.json").read_text())
        for category, endpoints in cases.items():
            for endpoint in endpoints:
                with self.subTest(endpoint=endpoint):
                    secret = BundleSecret(secrets={"remote": ProviderSecret(url=endpoint)})
                    if category == "valid":
                        build_bundle(pub=BundlePublic(), secret=secret, trust="self", password=PASSWORD)
                    else:
                        with self.assertRaises(ValueError):
                            build_bundle(pub=BundlePublic(), secret=secret, trust="self", password=PASSWORD)
