import unittest
from agentconfig import (
    ACB_SCHEMA_ID,
    ACB_VERSION,
    AcbModelType,
    AcbTrustMode,
    BundlePublic,
    BundleSecret,
    McpEntryPublic,
    ModelEntryPublic,
    OAuthCredential,
    ProviderSecret,
    build_bundle,
    bundle_to_deep_link,
    bundle_to_file_string,
    extract_bundle_from_deep_link,
    parse_bundle,
    parse_bundle_from_file_string,
    reveal_secret,
)


class TestAgentConfig(unittest.TestCase):
    def test_canonical_test_vector(self):
        url = (
            "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ"
        )
        bundle = extract_bundle_from_deep_link(url)
        self.assertEqual(bundle.schema, ACB_SCHEMA_ID)
        self.assertEqual(bundle.v, ACB_VERSION)
        self.assertEqual(bundle.trust, "self")
        self.assertEqual(bundle.pub.models[0].provider, "provider-a")
        self.assertEqual(bundle.pub.models[0].id, "model-x")

        secret = reveal_secret(bundle, "test-vector-2026")
        self.assertEqual(secret.secrets["provider-a"].apiKey, "sk-test-key-abcdef")
        self.assertEqual(
            secret.secrets["github"].env["GITHUB_PERSONAL_ACCESS_TOKEN"],
            "ghp_testtoken123",
        )
        self.assertEqual(secret.endpoints["provider-a"], "https://api.example.com")
        self.assertEqual(secret.customPrompts["default"], "Be concise.")

    def test_shared_bundle_roundtrip(self):
        pub = BundlePublic(
            mcp=[
                McpEntryPublic(
                    name="filesystem",
                    transport="stdio",
                    command="npx",
                    args=["-y", "@modelcontextprotocol/server-filesystem"],
                    envKeys=["TARGET_DIR"],
                )
            ],
            models=[
                ModelEntryPublic(
                    provider="deepseek",
                    id="deepseek-chat",
                    contextWindow=64000,
                    maxOutputTokens=8192,
                    modelType=AcbModelType.Text,
                )
            ],
        )
        bundle = build_bundle(pub=pub, trust=AcbTrustMode.Shared.value)
        self.assertEqual(bundle.trust, "shared")
        self.assertEqual(bundle.payload.alg, "none")

        url = bundle_to_deep_link(bundle)
        decoded = extract_bundle_from_deep_link(url)
        self.assertEqual(decoded.pub.models[0].id, "deepseek-chat")
        self.assertEqual(decoded.pub.models[0].contextWindow, 64000)

        secret = reveal_secret(decoded)
        self.assertEqual(len(secret.secrets), 0)

    def test_encrypted_self_bundle_roundtrip(self):
        pub = BundlePublic(
            models=[
                ModelEntryPublic(
                    provider="deepseek",
                    id="deepseek-reasoner",
                    contextWindow=64000,
                    modelType=AcbModelType.Text,
                    parameters={"reasoning_effort": "high"},
                )
            ]
        )
        secret = BundleSecret(
            endpoints={"deepseek": "https://api.deepseek.com"},
            secrets={"deepseek": ProviderSecret(apiKey="sk-deepseek-test-12345")},
        )
        bundle = build_bundle(
            pub=pub,
            secret=secret,
            trust=AcbTrustMode.Self.value,
            password="test-secure-pass",
            hint="hint does not have secret",
        )
        self.assertEqual(bundle.payload.alg, "PBKDF2-SHA256-AES-256-GCM")

        file_str = bundle_to_file_string(bundle)
        parsed = parse_bundle_from_file_string(file_str)
        revealed = reveal_secret(parsed, "test-secure-pass")
        self.assertEqual(revealed.secrets["deepseek"].apiKey, "sk-deepseek-test-12345")
        self.assertEqual(revealed.endpoints["deepseek"], "https://api.deepseek.com")

    def test_oauth_credential_handling(self):
        oauth = OAuthCredential(
            type="oidc",
            accessToken="jwt-access-token",
            refreshToken="jwt-refresh-token",
            issuer="https://auth.deepseek.com",
            clientId="deepseek-client-id",
            redirectUri="agentconfig://auth/callback",
        )
        secret = BundleSecret(
            secrets={"deepseek": ProviderSecret(oauth=oauth)}
        )
        pub = BundlePublic(
            models=[ModelEntryPublic(provider="deepseek", id="deepseek-chat")]
        )
        bundle = build_bundle(
            pub=pub,
            secret=secret,
            trust=AcbTrustMode.Self.value,
            password="oauth-password",
        )
        url = bundle_to_deep_link(bundle)
        extracted = extract_bundle_from_deep_link(url)
        rev = reveal_secret(extracted, "oauth-password")
        self.assertEqual(rev.secrets["deepseek"].oauth.type, "oidc")
        self.assertEqual(rev.secrets["deepseek"].oauth.accessToken, "jwt-access-token")
        self.assertEqual(rev.secrets["deepseek"].oauth.redirectUri, "agentconfig://auth/callback")

    def test_trust_violations_rejected(self):
        # 1. shared cannot have secrets
        with self.assertRaises(ValueError):
            build_bundle(
                pub=BundlePublic(),
                secret=BundleSecret(secrets={"a": ProviderSecret(apiKey="secret")}),
                trust=AcbTrustMode.Shared.value,
            )

        # 2. self with secrets must be encrypted
        with self.assertRaises(ValueError):
            build_bundle(
                pub=BundlePublic(),
                secret=BundleSecret(secrets={"a": ProviderSecret(apiKey="secret")}),
                trust=AcbTrustMode.Self.value,
                password=None,
            )

        # 3. hint containing password rejected
        with self.assertRaises(ValueError):
            build_bundle(
                pub=BundlePublic(),
                trust=AcbTrustMode.Self.value,
                password="mypassword",
                hint="mypassword is the pass",
            )


if __name__ == "__main__":
    unittest.main()
