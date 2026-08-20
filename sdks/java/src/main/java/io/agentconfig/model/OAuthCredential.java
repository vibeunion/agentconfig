package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.HashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class OAuthCredential {
    private String type;
    private String accessToken;
    private String refreshToken;
    private String idToken;
    private String expired;
    private String accountId;
    private String email;
    private String scope;
    private String issuer;
    private String clientId;
    private String redirectUri;
    private Map<String, Object> extra = new HashMap<>();

    public OAuthCredential() {}

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }

    public String getIdToken() { return idToken; }
    public void setIdToken(String idToken) { this.idToken = idToken; }

    public String getExpired() { return expired; }
    public void setExpired(String expired) { this.expired = expired; }

    public String getAccountId() { return accountId; }
    public void setAccountId(String accountId) { this.accountId = accountId; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }

    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getRedirectUri() { return redirectUri; }
    public void setRedirectUri(String redirectUri) { this.redirectUri = redirectUri; }

    public Map<String, Object> getExtra() { return extra; }
    public void setExtra(Map<String, Object> extra) { this.extra = extra != null ? extra : new HashMap<>(); }

    @JsonAnyGetter
    public Map<String, Object> any() { return extra; }

    @JsonAnySetter
    public void setAny(String key, Object value) { this.extra.put(key, value); }
}
