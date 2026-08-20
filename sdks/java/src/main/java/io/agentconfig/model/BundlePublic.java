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
public class BundlePublic {
    private List<McpEntryPublic> mcp = new ArrayList<>();
    private List<ModelEntryPublic> models = new ArrayList<>();
    private List<SkillEntryPublic> skills = new ArrayList<>();
    private List<PromptEntryPublic> prompts = new ArrayList<>();
    private List<AgentEntryPublic> agents = new ArrayList<>();
    private List<ResourceEntryPublic> resources = new ArrayList<>();
    private Map<String, Object> extra = new HashMap<>();

    public BundlePublic() {}

    public List<McpEntryPublic> getMcp() { return mcp; }
    public void setMcp(List<McpEntryPublic> mcp) { this.mcp = mcp != null ? mcp : new ArrayList<>(); }

    public List<ModelEntryPublic> getModels() { return models; }
    public void setModels(List<ModelEntryPublic> models) { this.models = models != null ? models : new ArrayList<>(); }

    public List<SkillEntryPublic> getSkills() { return skills; }
    public void setSkills(List<SkillEntryPublic> skills) { this.skills = skills != null ? skills : new ArrayList<>(); }

    public List<PromptEntryPublic> getPrompts() { return prompts; }
    public void setPrompts(List<PromptEntryPublic> prompts) { this.prompts = prompts != null ? prompts : new ArrayList<>(); }

    public List<AgentEntryPublic> getAgents() { return agents; }
    public void setAgents(List<AgentEntryPublic> agents) { this.agents = agents != null ? agents : new ArrayList<>(); }

    public List<ResourceEntryPublic> getResources() { return resources; }
    public void setResources(List<ResourceEntryPublic> resources) { this.resources = resources != null ? resources : new ArrayList<>(); }

    @JsonAnyGetter
    public Map<String, Object> getExtra() { return extra; }

    @JsonAnySetter
    public void setExtra(String key, Object value) { this.extra.put(key, value); }
}
