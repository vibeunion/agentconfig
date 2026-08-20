package io.agentconfig;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

public final class Crypto {
    private Crypto() {}

    public static final int SALT_BYTES = 16;
    public static final int IV_BYTES = 12;
    public static final int KEY_BYTES = 32;
    public static final int GCM_TAG_BYTES = 16;
    public static final int GCM_TAG_BITS = 128;

    private static final Pattern BASE64_PATTERN = Pattern.compile("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$");
    private static final Pattern BASE64URL_PATTERN = Pattern.compile("^[A-Za-z0-9_-]*$");
    private static final SecureRandom RANDOM = new SecureRandom();

    public static void validatePassword(String password) {
        if (password == null || password.isEmpty()) {
            throw new AgentConfigException("Password must not be empty");
        }
    }

    public static void validateIterations(int iterations) {
        if (iterations < Schema.PBKDF2_MIN_ITERATIONS || iterations > Schema.PBKDF2_MAX_ITERATIONS) {
            throw new AgentConfigException("PBKDF2 iterations must be between " + Schema.PBKDF2_MIN_ITERATIONS + " and " + Schema.PBKDF2_MAX_ITERATIONS);
        }
    }

    public static String toB64(byte[] data) {
        return Base64.getEncoder().encodeToString(data);
    }

    public static byte[] fromB64(String value, String fieldName) {
        if (value == null || !BASE64_PATTERN.matcher(value).matches()) {
            throw new AgentConfigException("Invalid " + fieldName);
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (!toB64(decoded).equals(value)) {
                throw new AgentConfigException("Non-canonical " + fieldName);
            }
            return decoded;
        } catch (IllegalArgumentException e) {
            throw new AgentConfigException("Invalid " + fieldName + ": " + e.getMessage(), e);
        }
    }

    public static String toB64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    public static byte[] fromB64Url(String value) {
        if (value == null || !BASE64URL_PATTERN.matcher(value).matches() || value.length() % 4 == 1) {
            throw new AgentConfigException("Invalid bundle base64url payload");
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (!toB64Url(decoded).equals(value)) {
                throw new AgentConfigException("Non-canonical bundle base64url payload");
            }
            return decoded;
        } catch (IllegalArgumentException e) {
            throw new AgentConfigException("Invalid base64url payload: " + e.getMessage(), e);
        }
    }

    public static byte[] deriveKey(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BYTES * 8);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return factory.generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new AgentConfigException("Key derivation failed: " + e.getMessage(), e);
        }
    }

    public static class EncryptResult {
        public final String salt;
        public final String iv;
        public final String ct;
        public final int iterations;

        public EncryptResult(String salt, String iv, String ct, int iterations) {
            this.salt = salt;
            this.iv = iv;
            this.ct = ct;
            this.iterations = iterations;
        }
    }

    public static EncryptResult encryptWithPassword(String plaintext, String password, int iterations) {
        validatePassword(password);
        validateIterations(iterations);

        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);

        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);

        try {
            byte[] key = deriveKey(password, salt, iterations);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_BITS, iv);
            SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, parameterSpec);
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            return new EncryptResult(toB64(salt), toB64(iv), toB64(ciphertext), iterations);
        } catch (Exception e) {
            throw new AgentConfigException("Encryption failed: " + e.getMessage(), e);
        }
    }

    public static String decryptWithPassword(String saltB64, String ivB64, String ctB64, int iterations, String password) {
        validatePassword(password);
        validateIterations(iterations);

        byte[] salt = fromB64(saltB64, "salt");
        if (salt.length != SALT_BYTES) {
            throw new AgentConfigException("Invalid salt length: expected " + SALT_BYTES + " bytes, got " + salt.length);
        }

        byte[] iv = fromB64(ivB64, "IV");
        if (iv.length != IV_BYTES) {
            throw new AgentConfigException("Invalid IV length: expected " + IV_BYTES + " bytes, got " + iv.length);
        }

        byte[] ct = fromB64(ctB64, "ciphertext");
        if (ct.length < GCM_TAG_BYTES) {
            throw new AgentConfigException("Ciphertext too short (missing GCM tag)");
        }

        try {
            byte[] key = deriveKey(password, salt, iterations);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_BITS, iv);
            SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, parameterSpec);
            byte[] plaintext = cipher.doFinal(ct);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new AgentConfigException("Decryption failed: " + e.getMessage(), e);
        }
    }
}
