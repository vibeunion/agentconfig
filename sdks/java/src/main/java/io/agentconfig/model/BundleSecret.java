package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class BundleSecret {
    private Map<String, String> endpoints = new HashMap<>();
    private Map<String, String> customPrompts = new HashMap<>();
    private List<ProviderHint> providerHints = new ArrayList<>();
    private Map<String, ProviderSecret> secrets = new HashMap<>();
    private Map<String, Object> extra = new HashMap<>();

    public BundleSecret() {}

    public Map<String, String> getEndpoints() { return endpoints; }
    public void setEndpoints(Map<String, String> endpoints) { this.endpoints = endpoints != null ? endpoints : new HashMap<>(); }

    public Map<String, String> getCustomPrompts() { return customPrompts; }
    public void setCustomPrompts(Map<String, String> customPrompts) { this.customPrompts = customPrompts != null ? customPrompts : new HashMap<>(); }

    public List<ProviderHint> getProviderHints() { return providerHints; }
    public void setProviderHints(List<ProviderHint> providerHints) { this.providerHints = providerHints != null ? providerHints : new ArrayList<>(); }

    public Map<String, ProviderSecret> getSecrets() { return secrets; }
    public void setSecrets(Map<String, ProviderSecret> secrets) { this.secrets = secrets != null ? secrets : new HashMap<>(); }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
