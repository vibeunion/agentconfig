package io.agentconfig;

import static org.junit.jupiter.api.Assertions.*;

import io.agentconfig.model.*;
import java.util.Collections;
import org.junit.jupiter.api.Test;

public class AgentConfigTest {

    @Test
    public void testCanonicalIntegrationTestVector() {
        String rawUrl = "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ";

        ConfigBundle bundle = AgentConfig.extractBundleFromDeepLink(rawUrl);
        assertEquals(Schema.SCHEMA_ID, bundle.getSchema());
        assertEquals(Schema.VERSION, bundle.getV());
        assertEquals(Schema.TRUST_SELF, bundle.getTrust());
        assertEquals("provider-a", bundle.getPub().getModels().get(0).getProvider());
        assertEquals("model-x", bundle.getPub().getModels().get(0).getId());

        BundleSecret secret = AgentConfig.revealSecret(bundle, "test-vector-2026");
        assertEquals("sk-test-key-abcdef", secret.getSecrets().get("provider-a").getApiKey());
        assertEquals("ghp_testtoken123", secret.getSecrets().get("github").getEnv().get("GITHUB_PERSONAL_ACCESS_TOKEN"));
        assertEquals("https://api.example.com", secret.getEndpoints().get("provider-a"));
        assertEquals("Be concise.", secret.getCustomPrompts().get("default"));
    }

    @Test
    public void testSharedBundleRoundtrip() {
        BundlePublic pub = new BundlePublic();
        ModelEntryPublic model = new ModelEntryPublic();
        model.setProvider("deepseek");
        model.setId("deepseek-chat");
        model.setContextWindow(64000L);
        model.setMaxOutputTokens(8192L);
        model.setModelType(Schema.MODEL_TYPE_TEXT);
        pub.getModels().add(model);

        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.trust = Schema.TRUST_SHARED;
        opts.pub = pub;

        ConfigBundle bundle = AgentConfig.buildBundle(opts);
        assertEquals(Schema.ALG_NONE, bundle.getPayload().getAlg());

        String deepLink = AgentConfig.bundleToDeepLink(bundle);
        ConfigBundle extracted = AgentConfig.extractBundleFromDeepLink(deepLink);
        assertEquals("deepseek-chat", extracted.getPub().getModels().get(0).getId());

        BundleSecret secret = AgentConfig.revealSecret(extracted);
        assertTrue(secret.getSecrets().isEmpty());
    }

    @Test
    public void testEncryptedSelfBundleRoundtrip() {
        BundlePublic pub = new BundlePublic();
        ModelEntryPublic model = new ModelEntryPublic();
        model.setProvider("deepseek");
        model.setId("deepseek-reasoner");
        pub.getModels().add(model);

        BundleSecret secret = new BundleSecret();
        ProviderSecret provSecret = new ProviderSecret();
        provSecret.setApiKey("sk-deepseek-java-key");
        secret.getSecrets().put("deepseek", provSecret);

        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.trust = Schema.TRUST_SELF;
        opts.pub = pub;
        opts.secret = secret;
        opts.password = "java-test-password";
        opts.hint = "unit test";

        ConfigBundle bundle = AgentConfig.buildBundle(opts);
        assertEquals(Schema.ALG_PBKDF2_SHA256_AES256_GCM, bundle.getPayload().getAlg());

        String fileStr = AgentConfig.bundleToFileString(bundle);
        ConfigBundle parsed = AgentConfig.parseBundleFromFileString(fileStr);
        BundleSecret revealed = AgentConfig.revealSecret(parsed, "java-test-password");
        assertEquals("sk-deepseek-java-key", revealed.getSecrets().get("deepseek").getApiKey());
    }

    @Test
    public void testTrustViolations() {
        BundleSecret secret = new BundleSecret();
        ProviderSecret provSecret = new ProviderSecret();
        provSecret.setApiKey("sk-secret");
        secret.getSecrets().put("deepseek", provSecret);

        // 1. shared cannot have secrets
        Codec.BuildOptions opts1 = new Codec.BuildOptions();
        opts1.trust = Schema.TRUST_SHARED;
        opts1.secret = secret;
        assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts1));

        // 2. self with secrets must be encrypted
        Codec.BuildOptions opts2 = new Codec.BuildOptions();
        opts2.trust = Schema.TRUST_SELF;
        opts2.secret = secret;
        assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts2));
    }
}
