package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.HashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProviderSecret {
    private String apiKey;
    @JsonDeserialize(using = StrictStringDeserializer.class)
    private String url;
    private Map<String, String> env = new HashMap<>();
    private Map<String, String> headers = new HashMap<>();
    private OAuthCredential oauth;
    private Map<String, Object> extra = new HashMap<>();

    public ProviderSecret() {}

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public Map<String, String> getEnv() { return env; }
    public void setEnv(Map<String, String> env) { this.env = env != null ? env : new HashMap<>(); }

    public Map<String, String> getHeaders() { return headers; }
    public void setHeaders(Map<String, String> headers) { this.headers = headers != null ? headers : new HashMap<>(); }

    public OAuthCredential getOauth() { return oauth; }
    public void setOauth(OAuthCredential oauth) { this.oauth = oauth; }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
