package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.agentconfig.Schema;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConfigBundle {
    private String schema = Schema.SCHEMA_ID;
    private int v = Schema.VERSION;
    private long created;
    private String trust = Schema.TRUST_SHARED;
    private List<String> capabilities = new ArrayList<>();
    private String label;
    private String src;
    private String hint;
    private EncryptionPayload payload;

    @JsonProperty("pub")
    private BundlePublic pub = new BundlePublic();

    private Map<String, Object> extra = new HashMap<>();

    public ConfigBundle() {}

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public int getV() { return v; }
    public void setV(int v) { this.v = v; }

    public long getCreated() { return created; }
    public void setCreated(long created) { this.created = created; }

    public String getTrust() { return trust; }
    public void setTrust(String trust) { this.trust = trust; }

    public List<String> getCapabilities() { return capabilities; }
    public void setCapabilities(List<String> capabilities) { this.capabilities = capabilities != null ? capabilities : new ArrayList<>(); }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getSrc() { return src; }
    public void setSrc(String src) { this.src = src; }

    public String getHint() { return hint; }
    public void setHint(String hint) { this.hint = hint; }

    public EncryptionPayload getPayload() { return payload; }
    public void setPayload(EncryptionPayload payload) { this.payload = payload; }

    public BundlePublic getPub() { return pub; }
    public void setPub(BundlePublic pub) { this.pub = pub != null ? pub : new BundlePublic(); }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
