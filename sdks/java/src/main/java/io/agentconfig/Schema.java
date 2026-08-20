package io.agentconfig;

public final class Schema {
    private Schema() {}

    public static final int VERSION = 1;
    public static final String SCHEMA_ID = "agentconfig-bundle";
    public static final int DEEP_LINK_MAX_BYTES = 20_000;
    public static final int MAX_BUNDLE_BYTES = 1_000_000;
    public static final String DEEP_LINK_SCHEME = "agentconfig";
    public static final String FILE_EXTENSION = ".acfg";
    public static final String MIME_TYPE = "application/x-agentconfig+json";

    public static final int PBKDF2_MIN_ITERATIONS = 100_000;
    public static final int PBKDF2_MAX_ITERATIONS = 1_000_000;

    public static final String ALG_PBKDF2_SHA256_AES256_GCM = "PBKDF2-SHA256-AES-256-GCM";
    public static final String ALG_NONE = "none";

    public static final String TRUST_SHARED = "shared";
    public static final String TRUST_SELF = "self";
    public static final String TRUST_MANAGED = "managed";

    public static final String CAPABILITY_MCP = "mcp";
    public static final String CAPABILITY_MODELS = "models";
    public static final String CAPABILITY_SKILLS = "skills";
    public static final String CAPABILITY_PROMPTS = "prompts";
    public static final String CAPABILITY_AGENTS = "agents";
    public static final String CAPABILITY_RESOURCES = "resources";

    public static final String MODEL_TYPE_TEXT = "text";
    public static final String MODEL_TYPE_MULTIMODAL = "multimodal";
    public static final String MODEL_TYPE_IMAGE_GENERATION = "image-generation";
    public static final String MODEL_TYPE_VIDEO_GENERATION = "video-generation";
}
