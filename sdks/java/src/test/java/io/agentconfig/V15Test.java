package io.agentconfig;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.agentconfig.model.*;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

public class V15Test {
    private static final String PASSWORD = "agentconfig-v1.5-test";

    private String vector() throws Exception {
        return Files.readString(Path.of("../../examples/vectors/v1.5.acfg"));
    }

    @Test
    public void testVectorSurvivesBothCarriers() throws Exception {
        ConfigBundle bundle = AgentConfig.parseBundle(vector());
        assertEquals("researcher-instructions", bundle.getPub().getAgents().get(0).getPromptId());
        ConfigBundle[] imports = {
            AgentConfig.parseBundleFromFileString(AgentConfig.bundleToFileString(bundle)),
            AgentConfig.extractBundleFromDeepLink(AgentConfig.bundleToDeepLink(bundle))
        };
        JsonNode original = Codec.getMapper().readTree(vector());
        for (ConfigBundle imported : imports) {
            JsonNode encoded = Codec.getMapper().valueToTree(imported);
            assertEquals(original.get("x-envelope"), encoded.get("x-envelope"));
            assertEquals(original.at("/payload/x-payload"), encoded.at("/payload/x-payload"));
            assertEquals(original.at("/pub/x-public"), encoded.at("/pub/x-public"));
            for (String section : new String[]{"mcp", "models", "skills", "prompts", "agents", "resources"}) {
                original.at("/pub/" + section + "/0").fields().forEachRemaining(field -> {
                    if (field.getKey().startsWith("x-")) {
                        assertEquals(field.getValue(), encoded.at("/pub/" + section + "/0/" + field.getKey()));
                    }
                });
            }
            BundleSecret secret = AgentConfig.revealSecret(imported, PASSWORD);
            assertEquals("https://mcp.example.com/sse", secret.getSecrets().get("remote").getUrl());
            assertEquals("Inspect the workspace before proposing changes.", secret.getCustomPrompts().get("researcher-instructions"));
            JsonNode encodedSecret = Codec.getMapper().valueToTree(secret);
            JsonNode expected = Codec.getMapper().readTree(Files.readString(Path.of("../../examples/vectors/v1.5-secret.json")));
            for (String pointer : new String[]{"/x-secret", "/providerHints/0/x-hint", "/secrets/remote/x-provider", "/secrets/remote/oauth/x-oauth", "/secrets/remote/oauth/extra"}) {
                assertEquals(expected.at(pointer), encodedSecret.at(pointer), pointer);
            }
        }
    }

    @Test
    public void testPromptBindingAndLegacyOmission() throws Exception {
        for (String promptId : new String[]{"", "missing", "x".repeat(65)}) {
            ObjectNode encoded = (ObjectNode) Codec.getMapper().readTree(vector());
            ((ObjectNode) encoded.at("/pub/agents/0")).put("promptId", promptId);
            assertThrows(AgentConfigException.class, () -> AgentConfig.parseBundle(encoded.toString()));
        }
        ObjectNode encoded = (ObjectNode) Codec.getMapper().readTree(vector());
        ((ObjectNode) encoded.at("/pub/agents/0")).remove("promptId");
        ConfigBundle bundle = AgentConfig.parseBundle(encoded.toString());
        assertNull(bundle.getPub().getAgents().get(0).getPromptId());
        assertFalse(AgentConfig.bundleToFileString(bundle).contains("promptId"));
        assertFalse(Codec.getMapper().valueToTree(new ProviderSecret()).has("url"));
    }

    @Test
    public void testRemoteUrlIsValidatedBeforeExportAndAfterDecryption() throws Exception {
        ConfigBundle bundle = AgentConfig.parseBundle(vector());
        BundleSecret secret = AgentConfig.revealSecret(bundle, PASSWORD);
        secret.getSecrets().get("remote").setUrl("not a url");
        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.trust = Schema.TRUST_SELF;
        opts.secret = secret;
        opts.password = PASSWORD;
        assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts));
        Crypto.EncryptResult encrypted = Crypto.encryptWithPassword(Codec.getMapper().writeValueAsString(secret), PASSWORD, Schema.PBKDF2_MIN_ITERATIONS);
        bundle.getPayload().setCt(encrypted.ct);
        bundle.getPayload().setSalt(encrypted.salt);
        bundle.getPayload().setIv(encrypted.iv);
        assertThrows(AgentConfigException.class, () -> AgentConfig.revealSecret(bundle, PASSWORD));
    }

    @Test
    public void testRemoteUrlAloneStillRequiresTrustAndEncryption() {
        BundleSecret secret = new BundleSecret();
        ProviderSecret remote = new ProviderSecret();
        remote.setUrl("https://mcp.example.com/sse");
        secret.getSecrets().put("remote", remote);
        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.secret = secret;
        opts.password = PASSWORD;
        assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts));
        opts.trust = Schema.TRUST_SELF;
        opts.password = null;
        assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts));
    }
    @Test
    public void testHttpUrlCasesMatchSharedReference() throws Exception {
        JsonNode cases = Codec.getMapper().readTree(Files.readString(Path.of("../../examples/vectors/v1.5-urls.json")));
        for (String category : new String[]{"valid", "invalid"}) {
            for (JsonNode endpoint : cases.get(category)) {
                BundleSecret secret = new BundleSecret();
                ProviderSecret remote = new ProviderSecret();
                remote.setUrl(endpoint.asText());
                secret.getSecrets().put("remote", remote);
                Codec.BuildOptions opts = new Codec.BuildOptions();
                opts.secret = secret;
                opts.trust = Schema.TRUST_SELF;
                opts.password = PASSWORD;
                if (category.equals("valid")) assertDoesNotThrow(() -> AgentConfig.buildBundle(opts), endpoint.asText());
                else assertThrows(AgentConfigException.class, () -> AgentConfig.buildBundle(opts), endpoint.asText());
            }
        }
    }

    @Test
    public void testPromptIdDoesNotCoerceScalarsToStrings() throws Exception {
        for (String scalar : new String[]{"42", "true", "false"}) {
            ObjectNode encoded = (ObjectNode) Codec.getMapper().readTree(vector());
            ((ObjectNode) encoded.at("/pub/prompts/0")).put("id", scalar);
            ((ObjectNode) encoded.at("/pub/agents/0")).set("promptId", Codec.getMapper().readTree(scalar));
            assertThrows(AgentConfigException.class, () -> AgentConfig.parseBundle(encoded.toString()));
        }
    }

}
