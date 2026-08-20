from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union

ACB_VERSION: int = 1
ACB_SCHEMA_ID: str = "agentconfig-bundle"
ACB_DEEP_LINK_MAX_BYTES: int = 20_000
ACB_MAX_BUNDLE_BYTES: int = 1_000_000
ACB_DEEP_LINK_SCHEME: str = "agentconfig"
ACB_FILE_EXTENSION: str = ".acfg"
ACB_MIME_TYPE: str = "application/x-agentconfig+json"

ACB_PBKDF2_MIN_ITERATIONS: int = 100_000
ACB_PBKDF2_MAX_ITERATIONS: int = 1_000_000


class AcbEncryptionAlgorithm(str, Enum):
    Pbkdf2Sha256Aes256Gcm = "PBKDF2-SHA256-AES-256-GCM"
    NoneAlg = "none"


class AcbTrustMode(str, Enum):
    Self = "self"
    Shared = "shared"
    Managed = "managed"


class AcbCapability(str, Enum):
    Mcp = "mcp"
    Models = "models"
    Skills = "skills"
    Prompts = "prompts"
    Agents = "agents"
    Resources = "resources"


class AcbModelType(str, Enum):
    Text = "text"
    Multimodal = "multimodal"
    ImageGeneration = "image-generation"
    VideoGeneration = "video-generation"


class AcbModelGenerationMode(str, Enum):
    TextToImage = "text-to-image"
    ImageToImage = "image-to-image"
    TextToVideo = "text-to-video"
    ImageToVideo = "image-to-video"


IMAGE_GENERATION_MODES = {
    AcbModelGenerationMode.TextToImage.value,
    AcbModelGenerationMode.ImageToImage.value,
}
VIDEO_GENERATION_MODES = {
    AcbModelGenerationMode.TextToVideo.value,
    AcbModelGenerationMode.ImageToVideo.value,
}


@dataclass
class McpEntryPublic:
    name: str
    transport: str  # stdio, sse, http
    enabled: bool = True
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    envKeys: List[str] = field(default_factory=list)
    registryId: Optional[str] = None
    repoUrl: Optional[str] = None
    description: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "name": self.name,
            "enabled": self.enabled,
            "transport": self.transport,
            "args": self.args,
            "envKeys": self.envKeys,
        }
        if self.command is not None:
            d["command"] = self.command
        if self.registryId is not None:
            d["registryId"] = self.registryId
        if self.repoUrl is not None:
            d["repoUrl"] = self.repoUrl
        if self.description is not None:
            d["description"] = self.description
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> McpEntryPublic:
        known = {"name", "transport", "enabled", "command", "args", "envKeys", "registryId", "repoUrl", "description"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            name=data["name"],
            transport=data["transport"],
            enabled=data.get("enabled", True),
            command=data.get("command"),
            args=list(data.get("args", [])),
            envKeys=list(data.get("envKeys", [])),
            registryId=data.get("registryId"),
            repoUrl=data.get("repoUrl"),
            description=data.get("description"),
            extra=extra,
        )


@dataclass
class ModelEntryPublic:
    provider: str
    id: str
    alias: Optional[str] = None
    maxTokens: Optional[int] = None
    contextWindow: Optional[int] = None
    maxOutputTokens: Optional[int] = None
    modelType: Optional[Union[AcbModelType, str]] = None
    generationModes: Optional[List[Union[AcbModelGenerationMode, str]]] = None
    parameters: Optional[Dict[str, Any]] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"provider": self.provider, "id": self.id}
        if self.alias is not None:
            d["alias"] = self.alias
        if self.maxTokens is not None:
            d["maxTokens"] = self.maxTokens
        if self.contextWindow is not None:
            d["contextWindow"] = self.contextWindow
        if self.maxOutputTokens is not None:
            d["maxOutputTokens"] = self.maxOutputTokens
        if self.modelType is not None:
            d["modelType"] = self.modelType.value if isinstance(self.modelType, AcbModelType) else str(self.modelType)
        if self.generationModes is not None:
            d["generationModes"] = [
                m.value if isinstance(m, AcbModelGenerationMode) else str(m) for m in self.generationModes
            ]
        if self.parameters is not None:
            d["parameters"] = self.parameters
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ModelEntryPublic:
        known = {"provider", "id", "alias", "maxTokens", "contextWindow", "maxOutputTokens", "modelType", "generationModes", "parameters"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            provider=data["provider"],
            id=data["id"],
            alias=data.get("alias"),
            maxTokens=data.get("maxTokens"),
            contextWindow=data.get("contextWindow"),
            maxOutputTokens=data.get("maxOutputTokens"),
            modelType=data.get("modelType"),
            generationModes=data.get("generationModes"),
            parameters=data.get("parameters"),
            extra=extra,
        )


@dataclass
class SkillEntryPublic:
    id: str
    enabled: bool = True
    order: Optional[int] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"id": self.id, "enabled": self.enabled}
        if self.order is not None:
            d["order"] = self.order
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> SkillEntryPublic:
        known = {"id", "enabled", "order"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            id=data["id"],
            enabled=data.get("enabled", True),
            order=data.get("order"),
            extra=extra,
        )


@dataclass
class PromptEntryPublic:
    id: str
    title: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"id": self.id}
        if self.title is not None:
            d["title"] = self.title
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PromptEntryPublic:
        known = {"id", "title"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            id=data["id"],
            title=data.get("title"),
            extra=extra,
        )


@dataclass
class AgentEntryPublic:
    id: str
    name: Optional[str] = None
    model: Optional[str] = None
    skillIds: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"id": self.id, "skillIds": self.skillIds}
        if self.name is not None:
            d["name"] = self.name
        if self.model is not None:
            d["model"] = self.model
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> AgentEntryPublic:
        known = {"id", "name", "model", "skillIds"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            id=data["id"],
            name=data.get("name"),
            model=data.get("model"),
            skillIds=list(data.get("skillIds", [])),
            extra=extra,
        )


@dataclass
class ResourceEntryPublic:
    uri: str
    name: Optional[str] = None
    mimeType: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"uri": self.uri}
        if self.name is not None:
            d["name"] = self.name
        if self.mimeType is not None:
            d["mimeType"] = self.mimeType
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ResourceEntryPublic:
        known = {"uri", "name", "mimeType"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            uri=data["uri"],
            name=data.get("name"),
            mimeType=data.get("mimeType"),
            extra=extra,
        )


@dataclass
class BundlePublic:
    mcp: List[McpEntryPublic] = field(default_factory=list)
    models: List[ModelEntryPublic] = field(default_factory=list)
    skills: List[SkillEntryPublic] = field(default_factory=list)
    prompts: List[PromptEntryPublic] = field(default_factory=list)
    agents: List[AgentEntryPublic] = field(default_factory=list)
    resources: List[ResourceEntryPublic] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "mcp": [m.to_dict() for m in self.mcp],
            "models": [m.to_dict() for m in self.models],
            "skills": [s.to_dict() for s in self.skills],
            "prompts": [p.to_dict() for p in self.prompts],
            "agents": [a.to_dict() for a in self.agents],
            "resources": [r.to_dict() for r in self.resources],
        }
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> BundlePublic:
        known = {"mcp", "models", "skills", "prompts", "agents", "resources"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            mcp=[McpEntryPublic.from_dict(x) for x in data.get("mcp", [])],
            models=[ModelEntryPublic.from_dict(x) for x in data.get("models", [])],
            skills=[SkillEntryPublic.from_dict(x) for x in data.get("skills", [])],
            prompts=[PromptEntryPublic.from_dict(x) for x in data.get("prompts", [])],
            agents=[AgentEntryPublic.from_dict(x) for x in data.get("agents", [])],
            resources=[ResourceEntryPublic.from_dict(x) for x in data.get("resources", [])],
            extra=extra,
        )


@dataclass
class OAuthCredential:
    type: str
    accessToken: Optional[str] = None
    refreshToken: Optional[str] = None
    idToken: Optional[str] = None
    expired: Optional[str] = None
    accountId: Optional[str] = None
    email: Optional[str] = None
    scope: Optional[str] = None
    issuer: Optional[str] = None
    clientId: Optional[str] = None
    redirectUri: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": self.type}
        if self.accessToken is not None:
            d["accessToken"] = self.accessToken
        if self.refreshToken is not None:
            d["refreshToken"] = self.refreshToken
        if self.idToken is not None:
            d["idToken"] = self.idToken
        if self.expired is not None:
            d["expired"] = self.expired
        if self.accountId is not None:
            d["accountId"] = self.accountId
        if self.email is not None:
            d["email"] = self.email
        if self.scope is not None:
            d["scope"] = self.scope
        if self.issuer is not None:
            d["issuer"] = self.issuer
        if self.clientId is not None:
            d["clientId"] = self.clientId
        if self.redirectUri is not None:
            d["redirectUri"] = self.redirectUri
        d["extra"] = self.extra
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> OAuthCredential:
        known = {"type", "accessToken", "refreshToken", "idToken", "expired", "accountId", "email", "scope", "issuer", "clientId", "redirectUri", "extra"}
        extra = dict(data.get("extra", {}))
        for k, v in data.items():
            if k not in known:
                extra[k] = v
        return cls(
            type=data["type"],
            accessToken=data.get("accessToken"),
            refreshToken=data.get("refreshToken"),
            idToken=data.get("idToken"),
            expired=data.get("expired"),
            accountId=data.get("accountId"),
            email=data.get("email"),
            scope=data.get("scope"),
            issuer=data.get("issuer"),
            clientId=data.get("clientId"),
            redirectUri=data.get("redirectUri"),
            extra=extra,
        )


@dataclass
class ProviderSecret:
    apiKey: Optional[str] = None
    env: Dict[str, str] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    oauth: Optional[OAuthCredential] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "env": self.env,
            "headers": self.headers,
        }
        if self.apiKey is not None:
            d["apiKey"] = self.apiKey
        if self.oauth is not None:
            d["oauth"] = self.oauth.to_dict()
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ProviderSecret:
        known = {"apiKey", "env", "headers", "oauth"}
        extra = {k: v for k, v in data.items() if k not in known}
        oauth = OAuthCredential.from_dict(data["oauth"]) if "oauth" in data and isinstance(data["oauth"], dict) else None
        return cls(
            apiKey=data.get("apiKey"),
            env=dict(data.get("env", {})),
            headers=dict(data.get("headers", {})),
            oauth=oauth,
            extra=extra,
        )


@dataclass
class ProviderHint:
    provider: str
    baseUrl: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"provider": self.provider}
        if self.baseUrl is not None:
            d["baseUrl"] = self.baseUrl
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ProviderHint:
        known = {"provider", "baseUrl"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            provider=data["provider"],
            baseUrl=data.get("baseUrl"),
            extra=extra,
        )


@dataclass
class BundleSecret:
    endpoints: Dict[str, str] = field(default_factory=dict)
    customPrompts: Dict[str, str] = field(default_factory=dict)
    providerHints: List[ProviderHint] = field(default_factory=list)
    secrets: Dict[str, ProviderSecret] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "endpoints": self.endpoints,
            "customPrompts": self.customPrompts,
            "providerHints": [h.to_dict() for h in self.providerHints],
            "secrets": {k: v.to_dict() for k, v in self.secrets.items()},
        }
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> BundleSecret:
        known = {"endpoints", "customPrompts", "providerHints", "secrets"}
        extra = {k: v for k, v in data.items() if k not in known}
        secrets_raw = data.get("secrets", {})
        secrets = {
            k: ProviderSecret.from_dict(v) if isinstance(v, dict) else v
            for k, v in secrets_raw.items()
        }
        hints = [
            ProviderHint.from_dict(h) if isinstance(h, dict) else h
            for h in data.get("providerHints", [])
        ]
        return cls(
            endpoints=dict(data.get("endpoints", {})),
            customPrompts=dict(data.get("customPrompts", {})),
            providerHints=hints,
            secrets=secrets,
            extra=extra,
        )


@dataclass
class EncryptionPayload:
    alg: str
    ct: str
    iterations: Optional[int] = None
    salt: Optional[str] = None
    iv: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"alg": self.alg, "ct": self.ct}
        if self.iterations is not None:
            d["iterations"] = self.iterations
        if self.salt is not None:
            d["salt"] = self.salt
        if self.iv is not None:
            d["iv"] = self.iv
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> EncryptionPayload:
        known = {"alg", "ct", "iterations", "salt", "iv"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            alg=data["alg"],
            ct=data["ct"],
            iterations=data.get("iterations"),
            salt=data.get("salt"),
            iv=data.get("iv"),
            extra=extra,
        )


@dataclass
class ConfigBundle:
    schema: str
    v: int
    created: int
    payload: EncryptionPayload
    pub: BundlePublic
    trust: str = AcbTrustMode.Shared.value
    capabilities: List[str] = field(default_factory=list)
    label: Optional[str] = None
    src: Optional[str] = None
    hint: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "schema": self.schema,
            "v": self.v,
            "created": self.created,
            "trust": self.trust,
            "capabilities": self.capabilities,
            "payload": self.payload.to_dict(),
            "pub": self.pub.to_dict(),
        }
        if self.label is not None:
            d["label"] = self.label
        if self.src is not None:
            d["src"] = self.src
        if self.hint is not None:
            d["hint"] = self.hint
        d.update(self.extra)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ConfigBundle:
        known = {"schema", "v", "created", "trust", "capabilities", "label", "src", "hint", "payload", "pub"}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(
            schema=data["schema"],
            v=data["v"],
            created=data["created"],
            trust=data.get("trust", AcbTrustMode.Shared.value),
            capabilities=list(data.get("capabilities", [])),
            label=data.get("label"),
            src=data.get("src"),
            hint=data.get("hint"),
            payload=EncryptionPayload.from_dict(data["payload"]),
            pub=BundlePublic.from_dict(data.get("pub", {})),
            extra=extra,
        )
