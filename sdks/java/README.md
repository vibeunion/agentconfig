# AgentConfig Java SDK

Official Java SDK for AgentConfig Bundle (`.acfg` and `agentconfig://` deep links).

## Installation

Add to `pom.xml`:

```xml
<dependency>
    <groupId>io.agentconfig</groupId>
    <artifactId>agentconfig</artifactId>
    <version>0.1.0</version>
</dependency>
```

## Quick Start

```java
import io.agentconfig.AgentConfig;
import io.agentconfig.Codec;
import io.agentconfig.Schema;
import io.agentconfig.model.*;

public class Example {
    public static void main(String[] args) {
        // Build an encrypted bundle
        BundlePublic pub = new BundlePublic();
        ModelEntryPublic model = new ModelEntryPublic();
        model.setProvider("deepseek");
        model.setId("deepseek-chat");
        model.setContextWindow(64000L);
        pub.getModels().add(model);

        BundleSecret secret = new BundleSecret();
        ProviderSecret provSecret = new ProviderSecret();
        provSecret.setApiKey("sk-...");
        secret.getSecrets().put("deepseek", provSecret);

        Codec.BuildOptions opts = new Codec.BuildOptions();
        opts.trust = Schema.TRUST_SELF;
        opts.pub = pub;
        opts.secret = secret;
        opts.password = "my-password";

        ConfigBundle bundle = AgentConfig.buildBundle(opts);

        // Export deep link
        String url = AgentConfig.bundleToDeepLink(bundle);
        System.out.println("Deep link: " + url);

        // Import and reveal
        ConfigBundle imported = AgentConfig.extractBundleFromDeepLink(url);
        BundleSecret revealed = AgentConfig.revealSecret(imported, "my-password");
        System.out.println("API Key: " + revealed.getSecrets().get("deepseek").getApiKey());
    }
}
```
