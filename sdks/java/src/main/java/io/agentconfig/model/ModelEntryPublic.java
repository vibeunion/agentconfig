package io.agentconfig.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class ModelEntryPublic {
    private String provider;
    private String id;
    private String alias;
    private Long maxTokens;
    private Long contextWindow;
    private Long maxOutputTokens;
    private String modelType;
    private List<String> generationModes;
    private Map<String, Object> parameters;
    private Map<String, Object> extra = new HashMap<>();

    public ModelEntryPublic() {}

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getAlias() { return alias; }
    public void setAlias(String alias) { this.alias = alias; }

    public Long getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Long maxTokens) { this.maxTokens = maxTokens; }

    public Long getContextWindow() { return contextWindow; }
    public void setContextWindow(Long contextWindow) { this.contextWindow = contextWindow; }

    public Long getMaxOutputTokens() { return maxOutputTokens; }
    public void setMaxOutputTokens(Long maxOutputTokens) { this.maxOutputTokens = maxOutputTokens; }

    public String getModelType() { return modelType; }
    public void setModelType(String modelType) { this.modelType = modelType; }

    public List<String> getGenerationModes() { return generationModes; }
    public void setGenerationModes(List<String> generationModes) { this.generationModes = generationModes; }

    public Map<String, Object> getParameters() { return parameters; }
    public void setParameters(Map<String, Object> parameters) { this.parameters = parameters; }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
