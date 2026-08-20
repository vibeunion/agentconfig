package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.HashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class EncryptionPayload {
    private String alg;
    private String ct;
    private Integer iterations;
    private String salt;
    private String iv;
    private Map<String, Object> extra = new HashMap<>();

    public EncryptionPayload() {}

    public String getAlg() { return alg; }
    public void setAlg(String alg) { this.alg = alg; }

    public String getCt() { return ct; }
    public void setCt(String ct) { this.ct = ct; }

    public Integer getIterations() { return iterations; }
    public void setIterations(Integer iterations) { this.iterations = iterations; }

    public String getSalt() { return salt; }
    public void setSalt(String salt) { this.salt = salt; }

    public String getIv() { return iv; }
    public void setIv(String iv) { this.iv = iv; }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
