package io.agentconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.agentconfig.model.*;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class Codec {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Codec() {}

    public static ObjectMapper getMapper() {
        return MAPPER;
    }

    public static void assertSerializedSize(String serialized) {
        int size = serialized.getBytes(StandardCharsets.UTF_8).length;
        if (size > Schema.MAX_BUNDLE_BYTES) {
            throw new AgentConfigException("Bundle exceeds maximum decoded size (" + size + " > " + Schema.MAX_BUNDLE_BYTES + " bytes)");
        }
    }

    public static boolean hasSecrets(BundleSecret secret) {
        return secret != null && secret.getSecrets() != null && !secret.getSecrets().isEmpty();
    }

    public static void assertSecretPolicy(String trust, BundleSecret secret, boolean encrypted) {
        if (!hasSecrets(secret)) {
            return;
        }
        if (Schema.TRUST_SHARED.equals(trust)) {
            throw new AgentConfigException("trust=\"shared\" bundles MUST NOT carry provider credentials");
        }
        if (!encrypted) {
            throw new AgentConfigException("trust=\"" + trust + "\" bundles carrying credentials MUST be password-encrypted");
        }
    }

    public static List<String> deriveCapabilities(BundlePublic pub) {
        List<String> caps = new ArrayList<>();
        if (pub.getMcp() != null && !pub.getMcp().isEmpty()) caps.add(Schema.CAPABILITY_MCP);
        if (pub.getModels() != null && !pub.getModels().isEmpty()) caps.add(Schema.CAPABILITY_MODELS);
        if (pub.getSkills() != null && !pub.getSkills().isEmpty()) caps.add(Schema.CAPABILITY_SKILLS);
        if (pub.getPrompts() != null && !pub.getPrompts().isEmpty()) caps.add(Schema.CAPABILITY_PROMPTS);
        if (pub.getAgents() != null && !pub.getAgents().isEmpty()) caps.add(Schema.CAPABILITY_AGENTS);
        if (pub.getResources() != null && !pub.getResources().isEmpty()) caps.add(Schema.CAPABILITY_RESOURCES);
        return caps;
    }

    public static ConfigBundle validateBundle(ConfigBundle bundle) {
        if (!Schema.SCHEMA_ID.equals(bundle.getSchema())) {
            throw new AgentConfigException("Invalid schema ID: expected \"" + Schema.SCHEMA_ID + "\", got \"" + bundle.getSchema() + "\"");
        }
        if (bundle.getV() != Schema.VERSION) {
            throw new AgentConfigException("Unsupported bundle version: " + bundle.getV());
        }

        EncryptionPayload payload = bundle.getPayload();
        if (payload == null) {
            throw new AgentConfigException("Missing payload section");
        }

        if (Schema.ALG_PBKDF2_SHA256_AES256_GCM.equals(payload.getAlg())) {
            if (payload.getIterations() == null) throw new AgentConfigException("Missing iterations in encrypted payload");
            if (payload.getSalt() == null) throw new AgentConfigException("Missing salt in encrypted payload");
            if (payload.getIv() == null) throw new AgentConfigException("Missing IV in encrypted payload");
            if (payload.getCt() == null) throw new AgentConfigException("Missing ciphertext in encrypted payload");

            byte[] salt = Crypto.fromB64(payload.getSalt(), "salt");
            if (salt.length != Crypto.SALT_BYTES) {
                throw new AgentConfigException("Invalid salt length: expected " + Crypto.SALT_BYTES + " bytes, got " + salt.length);
            }
            byte[] iv = Crypto.fromB64(payload.getIv(), "IV");
            if (iv.length != Crypto.IV_BYTES) {
                throw new AgentConfigException("Invalid IV length: expected " + Crypto.IV_BYTES + " bytes, got " + iv.length);
            }
            byte[] ct = Crypto.fromB64(payload.getCt(), "ciphertext");
            if (ct.length < Crypto.GCM_TAG_BYTES) {
                throw new AgentConfigException("Ciphertext too short (missing GCM tag)");
            }
            Crypto.validateIterations(payload.getIterations());
        } else if (Schema.ALG_NONE.equals(payload.getAlg())) {
            byte[] rawBytes = Crypto.fromB64(payload.getCt(), "plaintext secret payload");
            try {
                String secretJson = new String(rawBytes, StandardCharsets.UTF_8);
                BundleSecret secret = MAPPER.readValue(secretJson, BundleSecret.class);
                assertSecretPolicy(bundle.getTrust(), secret, false);
            } catch (Exception e) {
                throw new AgentConfigException("Invalid plaintext secret payload: " + e.getMessage(), e);
            }
        } else {
            throw new AgentConfigException("Unknown encryption algorithm: " + payload.getAlg());
        }

        return bundle;
    }

    public static class BuildOptions {
        public String label;
        public String src;
        public String hint;
        public String trust = Schema.TRUST_SHARED;
        public List<String> capabilities;
        public BundlePublic pub = new BundlePublic();
        public BundleSecret secret;
        public String password;
        public Integer iterations = Schema.PBKDF2_MIN_ITERATIONS;
    }

    public static ConfigBundle buildBundle(BuildOptions options) {
        String trust = options.trust != null ? options.trust : Schema.TRUST_SHARED;
        BundleSecret secret = options.secret != null ? options.secret : new BundleSecret();
        int iterations = options.iterations != null ? options.iterations : Schema.PBKDF2_MIN_ITERATIONS;
        Crypto.validateIterations(iterations);

        boolean encrypted = options.password != null && !options.password.isEmpty();
        if (options.hint != null && options.password != null && options.hint.contains(options.password)) {
            throw new AgentConfigException("Password hint MUST NOT contain the password");
        }

        assertSecretPolicy(trust, secret, encrypted);

        try {
            String secretJson = MAPPER.writeValueAsString(secret);
            EncryptionPayload payload = new EncryptionPayload();

            if (encrypted) {
                Crypto.EncryptResult encResult = Crypto.encryptWithPassword(secretJson, options.password, iterations);
                payload.setAlg(Schema.ALG_PBKDF2_SHA256_AES256_GCM);
                payload.setIterations(encResult.iterations);
                payload.setSalt(encResult.salt);
                payload.setIv(encResult.iv);
                payload.setCt(encResult.ct);
            } else {
                payload.setAlg(Schema.ALG_NONE);
                payload.setCt(Crypto.toB64(secretJson.getBytes(StandardCharsets.UTF_8)));
            }

            ConfigBundle bundle = new ConfigBundle();
            bundle.setSchema(Schema.SCHEMA_ID);
            bundle.setV(Schema.VERSION);
            bundle.setCreated(System.currentTimeMillis());
            bundle.setTrust(trust);
            bundle.setLabel(options.label);
            bundle.setSrc(options.src);
            bundle.setHint(options.hint);
            bundle.setPayload(payload);
            bundle.setPub(options.pub != null ? options.pub : new BundlePublic());
            bundle.setCapabilities(options.capabilities != null ? options.capabilities : deriveCapabilities(bundle.getPub()));

            String serialized = MAPPER.writeValueAsString(bundle);
            assertSerializedSize(serialized);

            return validateBundle(bundle);
        } catch (AgentConfigException e) {
            throw e;
        } catch (Exception e) {
            throw new AgentConfigException("Failed to build bundle: " + e.getMessage(), e);
        }
    }

    public static ConfigBundle parseBundle(String json) {
        assertSerializedSize(json);
        try {
            ConfigBundle bundle = MAPPER.readValue(json, ConfigBundle.class);
            return validateBundle(bundle);
        } catch (AgentConfigException e) {
            throw e;
        } catch (Exception e) {
            throw new AgentConfigException("Invalid bundle JSON: " + e.getMessage(), e);
        }
    }

    public static String bundleToDeepLink(ConfigBundle bundle, String scheme) {
        validateBundle(bundle);
        String s = scheme != null ? scheme : Schema.DEEP_LINK_SCHEME;
        try {
            String json = MAPPER.writeValueAsString(bundle);
            String encoded = Crypto.toB64Url(json.getBytes(StandardCharsets.UTF_8));
            if (encoded.length() > Schema.DEEP_LINK_MAX_BYTES) {
                throw new AgentConfigException("Bundle too large for deep link (" + encoded.length() + " > " + Schema.DEEP_LINK_MAX_BYTES + "). Use " + Schema.FILE_EXTENSION + " file export instead.");
            }
            return s + "://import?v=" + bundle.getV() + "&bundle=" + encoded;
        } catch (AgentConfigException e) {
            throw e;
        } catch (Exception e) {
            throw new AgentConfigException("Failed to serialize deep link: " + e.getMessage(), e);
        }
    }

    public static ConfigBundle extractBundleFromDeepLink(String url, String scheme) {
        String s = scheme != null ? scheme : Schema.DEEP_LINK_SCHEME;
        try {
            URI uri = URI.create(url);
            if (!s.equals(uri.getScheme())) {
                throw new AgentConfigException("Unexpected scheme: " + uri.getScheme());
            }
            if (!"import".equals(uri.getHost()) && !"import".equals(uri.getAuthority())) {
                throw new AgentConfigException("Unexpected deep link host: " + uri.getHost());
            }

            String query = uri.getRawQuery();
            if (query == null) {
                throw new AgentConfigException("Missing query parameters");
            }

            Map<String, String> queryParams = new HashMap<>();
            for (String param : query.split("&")) {
                String[] pair = param.split("=", 2);
                if (pair.length == 2) {
                    queryParams.put(pair[0], URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
                }
            }

            String version = queryParams.get("v");
            if (!String.valueOf(Schema.VERSION).equals(version)) {
                throw new AgentConfigException("Unsupported deep link version: " + version);
            }

            String bundleParam = queryParams.get("bundle");
            if (bundleParam == null || bundleParam.isEmpty()) {
                throw new AgentConfigException("Missing bundle parameter");
            }

            if (bundleParam.length() > Schema.DEEP_LINK_MAX_BYTES) {
                throw new AgentConfigException("Deep link payload exceeds maximum size (" + bundleParam.length() + " > " + Schema.DEEP_LINK_MAX_BYTES + ")");
            }

            byte[] jsonBytes = Crypto.fromB64Url(bundleParam);
            String json = new String(jsonBytes, StandardCharsets.UTF_8);
            assertSerializedSize(json);

            ConfigBundle bundle = parseBundle(json);
            if (!String.valueOf(bundle.getV()).equals(version)) {
                throw new AgentConfigException("Deep link version " + version + " does not match bundle version " + bundle.getV());
            }

            return bundle;
        } catch (AgentConfigException e) {
            throw e;
        } catch (Exception e) {
            throw new AgentConfigException("Invalid deep link URL: " + e.getMessage(), e);
        }
    }

    public static String bundleToFileString(ConfigBundle bundle) {
        validateBundle(bundle);
        try {
            return MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(bundle);
        } catch (Exception e) {
            throw new AgentConfigException("Failed to format bundle file: " + e.getMessage(), e);
        }
    }

    public static BundleSecret revealSecret(ConfigBundle bundle, String password) {
        validateBundle(bundle);
        EncryptionPayload payload = bundle.getPayload();
        String secretJson;

        if (Schema.ALG_NONE.equals(payload.getAlg())) {
            byte[] rawBytes = Crypto.fromB64(payload.getCt(), "plaintext secret payload");
            secretJson = new String(rawBytes, StandardCharsets.UTF_8);
        } else {
            if (password == null || password.isEmpty()) {
                throw new AgentConfigException("Password required for decryption");
            }
            secretJson = Crypto.decryptWithPassword(payload.getSalt(), payload.getIv(), payload.getCt(), payload.getIterations(), password);
        }

        try {
            BundleSecret secret = MAPPER.readValue(secretJson, BundleSecret.class);
            assertSecretPolicy(bundle.getTrust(), secret, Schema.ALG_PBKDF2_SHA256_AES256_GCM.equals(payload.getAlg()));
            return secret;
        } catch (AgentConfigException e) {
            throw e;
        } catch (Exception e) {
            throw new AgentConfigException("Invalid secret JSON: " + e.getMessage(), e);
        }
    }
}
