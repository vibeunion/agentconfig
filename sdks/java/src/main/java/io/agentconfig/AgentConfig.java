package io.agentconfig;

import io.agentconfig.model.BundleSecret;
import io.agentconfig.model.ConfigBundle;

public final class AgentConfig {
    private AgentConfig() {}

    public static ConfigBundle buildBundle(Codec.BuildOptions options) {
        return Codec.buildBundle(options);
    }

    public static ConfigBundle parseBundle(String json) {
        return Codec.parseBundle(json);
    }

    public static String bundleToDeepLink(ConfigBundle bundle) {
        return Codec.bundleToDeepLink(bundle, Schema.DEEP_LINK_SCHEME);
    }

    public static String bundleToDeepLink(ConfigBundle bundle, String scheme) {
        return Codec.bundleToDeepLink(bundle, scheme);
    }

    public static ConfigBundle extractBundleFromDeepLink(String url) {
        return Codec.extractBundleFromDeepLink(url, Schema.DEEP_LINK_SCHEME);
    }

    public static ConfigBundle extractBundleFromDeepLink(String url, String scheme) {
        return Codec.extractBundleFromDeepLink(url, scheme);
    }

    public static String bundleToFileString(ConfigBundle bundle) {
        return Codec.bundleToFileString(bundle);
    }

    public static ConfigBundle parseBundleFromFileString(String text) {
        return Codec.parseBundle(text);
    }

    public static BundleSecret revealSecret(ConfigBundle bundle) {
        return Codec.revealSecret(bundle, null);
    }

    public static BundleSecret revealSecret(ConfigBundle bundle, String password) {
        return Codec.revealSecret(bundle, password);
    }
}
