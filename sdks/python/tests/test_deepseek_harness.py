import unittest
from agentconfig import AcbTrustMode
from agentconfig.plugins.deepseek_harness import (
    DEEPSEEK_MODELS,
    DeepSeekHarness,
    HarnessTestCase,
    create_deepseek_bundle,
    load_deepseek_from_bundle,
)


class TestDeepSeekHarness(unittest.TestCase):
    def test_presets(self):
        self.assertIn("deepseek-chat", DEEPSEEK_MODELS)
        self.assertIn("deepseek-reasoner", DEEPSEEK_MODELS)
        self.assertTrue(DEEPSEEK_MODELS["deepseek-reasoner"]["supportsThinking"])

    def test_bundle_creation_and_loading(self):
        bundle = create_deepseek_bundle(
            api_key="sk-deepseek-test-key",
            models=["deepseek-chat", "deepseek-reasoner"],
            system_prompt="You are a smart AI.",
            password="test-password-123",
        )
        self.assertEqual(bundle.trust, AcbTrustMode.Self.value)

        loaded = load_deepseek_from_bundle(bundle, password="test-password-123")
        self.assertEqual(loaded["apiKey"], "sk-deepseek-test-key")
        self.assertIn("deepseek-chat", loaded["models"])
        self.assertEqual(loaded["systemPrompt"], "You are a smart AI.")

    def test_harness_execution_with_mock(self):
        def mock_requester(payload):
            return {
                "choices": [
                    {
                        "message": {
                            "content": "DeepSeek response: 42",
                            "reasoning_content": "Calculated 6*7=42",
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 8,
                    "total_tokens": 18,
                },
                "model": "deepseek-reasoner",
            }

        harness = DeepSeekHarness(
            api_key="sk-test",
            default_model="deepseek-reasoner",
            custom_requester=mock_requester,
        )

        res = harness.run_task("What is 6*7?")
        self.assertIn("42", res.content)
        self.assertIn("Calculated", res.reasoningContent)
        self.assertEqual(res.usage["totalTokens"], 18)

        suite_res = harness.run_test_suite([
            HarnessTestCase(id="c1", name="Math test", prompt="6*7", expectedContains=["42"])
        ])
        self.assertEqual(len(suite_res), 1)
        self.assertTrue(suite_res[0].passed)


if __name__ == "__main__":
    unittest.main()
