from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from urllib.request import Request, urlopen

from ..codec import build_bundle, reveal_secret
from ..schema import (
    AcbModelType,
    AcbTrustMode,
    AgentEntryPublic,
    BundlePublic,
    BundleSecret,
    ConfigBundle,
    McpEntryPublic,
    ModelEntryPublic,
    PromptEntryPublic,
    ProviderHint,
    ProviderSecret,
    SkillEntryPublic,
)

DEEPSEEK_PROVIDER_ID = "deepseek"
DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com"

DEEPSEEK_MODELS: Dict[str, Dict[str, Any]] = {
    "deepseek-chat": {
        "id": "deepseek-chat",
        "name": "DeepSeek-V3",
        "contextWindow": 64_000,
        "maxOutputTokens": 8_192,
        "modelType": AcbModelType.Text,
        "supportsThinking": False,
        "supportsToolCalling": True,
    },
    "deepseek-reasoner": {
        "id": "deepseek-reasoner",
        "name": "DeepSeek-R1",
        "contextWindow": 64_000,
        "maxOutputTokens": 8_192,
        "modelType": AcbModelType.Text,
        "supportsThinking": True,
        "supportsToolCalling": True,
    },
    "deepseek-coder": {
        "id": "deepseek-coder",
        "name": "DeepSeek-Coder",
        "contextWindow": 64_000,
        "maxOutputTokens": 8_192,
        "modelType": AcbModelType.Text,
        "supportsThinking": False,
        "supportsToolCalling": True,
    },
}


def get_deepseek_model_entry(model_id: str = "deepseek-chat") -> ModelEntryPublic:
    meta = DEEPSEEK_MODELS.get(
        model_id,
        {
            "id": model_id,
            "contextWindow": 64_000,
            "maxOutputTokens": 8_192,
            "modelType": AcbModelType.Text,
            "supportsThinking": "reasoner" in model_id or "r1" in model_id,
        },
    )
    alias = "r1" if meta["id"] == "deepseek-reasoner" else ("v3" if meta["id"] == "deepseek-chat" else meta["id"])
    params = {"reasoning_effort": "medium"} if meta.get("supportsThinking") else None
    return ModelEntryPublic(
        provider=DEEPSEEK_PROVIDER_ID,
        id=meta["id"],
        alias=alias,
        contextWindow=meta["contextWindow"],
        maxOutputTokens=meta["maxOutputTokens"],
        modelType=meta["modelType"],
        parameters=params,
    )


def create_deepseek_bundle(
    api_key: Optional[str] = None,
    models: Optional[List[str]] = None,
    system_prompt: Optional[str] = None,
    base_url: str = DEEPSEEK_DEFAULT_BASE_URL,
    mcp: Optional[List[McpEntryPublic]] = None,
    skills: Optional[List[SkillEntryPublic]] = None,
    prompts: Optional[List[PromptEntryPublic]] = None,
    agents: Optional[List[AgentEntryPublic]] = None,
    trust: Optional[str] = None,
    password: Optional[str] = None,
    label: str = "DeepSeek Agent Configuration",
) -> ConfigBundle:
    model_ids = models or ["deepseek-chat", "deepseek-reasoner"]
    model_entries = [get_deepseek_model_entry(m) for m in model_ids]

    prompt_entries = prompts or ([] if not system_prompt else [PromptEntryPublic(id="default", title="System Prompt")])

    pub = BundlePublic(
        models=model_entries,
        mcp=mcp or [],
        skills=skills or [],
        prompts=prompt_entries,
        agents=agents or [],
    )

    secrets_map: Dict[str, ProviderSecret] = {}
    if api_key:
        secrets_map[DEEPSEEK_PROVIDER_ID] = ProviderSecret(apiKey=api_key)

    secret = BundleSecret(
        endpoints={DEEPSEEK_PROVIDER_ID: base_url},
        customPrompts={"default": system_prompt} if system_prompt else {},
        providerHints=[ProviderHint(provider=DEEPSEEK_PROVIDER_ID, baseUrl=base_url)],
        secrets=secrets_map,
    )

    resolved_trust = trust or (AcbTrustMode.Self.value if api_key else AcbTrustMode.Shared.value)

    return build_bundle(
        pub=pub,
        secret=secret,
        trust=resolved_trust,
        password=password,
        label=label,
        src="deepseek-harness",
    )


def load_deepseek_from_bundle(
    bundle: ConfigBundle,
    password: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = None
    base_url = DEEPSEEK_DEFAULT_BASE_URL
    system_prompt = None

    if bundle.payload.alg == "none":
        secret = reveal_secret(bundle)
        api_key = secret.secrets.get(DEEPSEEK_PROVIDER_ID, ProviderSecret()).apiKey
        base_url = secret.endpoints.get(DEEPSEEK_PROVIDER_ID, base_url)
        system_prompt = secret.customPrompts.get("default")
    elif password:
        secret = reveal_secret(bundle, password)
        api_key = secret.secrets.get(DEEPSEEK_PROVIDER_ID, ProviderSecret()).apiKey
        base_url = secret.endpoints.get(DEEPSEEK_PROVIDER_ID, base_url)
        system_prompt = secret.customPrompts.get("default")

    models = [
        m.id for m in bundle.pub.models
        if m.provider == DEEPSEEK_PROVIDER_ID or m.id.startswith("deepseek")
    ]

    return {
        "apiKey": api_key,
        "baseUrl": base_url,
        "models": models or ["deepseek-chat"],
        "systemPrompt": system_prompt,
        "mcp": bundle.pub.mcp,
        "trust": bundle.trust,
    }


@dataclass
class HarnessTaskResult:
    content: str
    reasoningContent: Optional[str]
    toolCalls: List[Dict[str, Any]]
    usage: Dict[str, int]
    latencyMs: int
    model: str


@dataclass
class HarnessTestCase:
    id: str
    name: str
    prompt: str
    expectedContains: List[str] = field(default_factory=list)
    expectedToolCalls: List[str] = field(default_factory=list)
    maxLatencyMs: Optional[int] = None


@dataclass
class HarnessTestResult:
    caseId: str
    name: str
    passed: bool
    error: Optional[str] = None
    result: Optional[HarnessTaskResult] = None


class DeepSeekHarness:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEEPSEEK_DEFAULT_BASE_URL,
        default_model: str = "deepseek-chat",
        default_system_prompt: Optional[str] = None,
        custom_requester: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.default_system_prompt = default_system_prompt
        self.custom_requester = custom_requester

    @classmethod
    def from_bundle(
        cls,
        bundle: ConfigBundle,
        password: Optional[str] = None,
        **overrides: Any,
    ) -> DeepSeekHarness:
        cfg = load_deepseek_from_bundle(bundle, password)
        return cls(
            api_key=overrides.get("api_key", cfg["apiKey"]),
            base_url=overrides.get("base_url", cfg["baseUrl"]),
            default_model=overrides.get("default_model", cfg["models"][0] if cfg["models"] else "deepseek-chat"),
            default_system_prompt=overrides.get("default_system_prompt", cfg["systemPrompt"]),
            custom_requester=overrides.get("custom_requester"),
        )

    def run_task(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> HarnessTaskResult:
        chosen_model = model or self.default_model
        sys_prompt = system_prompt or self.default_system_prompt

        messages = []
        if sys_prompt:
            messages.append({"role": "system", "content": sys_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": chosen_model,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        start_time = time.time()
        if self.custom_requester:
            data = self.custom_requester(payload)
        else:
            url = f"{self.base_url}/chat/completions"
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))

        latency_ms = int((time.time() - start_time) * 1000)

        choice = data.get("choices", [{}])[0]
        msg = choice.get("message", {})
        content = msg.get("content", "")
        reasoning_content = msg.get("reasoning_content")
        tool_calls = msg.get("tool_calls", [])
        usage_data = data.get("usage", {})

        usage = {
            "promptTokens": usage_data.get("prompt_tokens", 0),
            "completionTokens": usage_data.get("completion_tokens", 0),
            "totalTokens": usage_data.get("total_tokens", 0),
        }
        if "reasoning_tokens" in usage_data.get("completion_tokens_details", {}):
            usage["reasoningTokens"] = usage_data["completion_tokens_details"]["reasoning_tokens"]

        return HarnessTaskResult(
            content=content,
            reasoningContent=reasoning_content,
            toolCalls=tool_calls,
            usage=usage,
            latencyMs=latency_ms,
            model=data.get("model", chosen_model),
        )

    def run_test_suite(self, cases: List[HarnessTestCase]) -> List[HarnessTestResult]:
        results = []
        for case in cases:
            try:
                res = self.run_task(case.prompt)
                passed = True
                error = None

                for needle in case.expectedContains:
                    if needle not in res.content and (not res.reasoningContent or needle not in res.reasoningContent):
                        passed = False
                        error = f"Expected '{needle}' in output"
                        break

                if passed and case.expectedToolCalls:
                    called_names = [t.get("function", {}).get("name") for t in res.toolCalls]
                    for expected_tool in case.expectedToolCalls:
                        if expected_tool not in called_names:
                            passed = False
                            error = f"Expected tool call '{expected_tool}'"
                            break

                results.append(HarnessTestResult(caseId=case.id, name=case.name, passed=passed, error=error, result=res))
            except Exception as e:
                results.append(HarnessTestResult(caseId=case.id, name=case.name, passed=False, error=str(e)))
        return results
