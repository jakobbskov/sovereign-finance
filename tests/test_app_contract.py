import importlib
import os
import tempfile
import unittest


class FinanceAppContractTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["SOVEREIGN_FINANCE_DATA_DIR"] = self.tmp.name

        import app as app_module
        self.app_module = importlib.reload(app_module)
        self.client = self.app_module.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("SOVEREIGN_FINANCE_DATA_DIR", None)

    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["ok"], True)

    def test_decisions_start_empty_when_no_runtime_file_exists(self):
        response = self.client.get("/api/decisions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"decisions": []})

    def test_create_decision_requires_title_and_decision(self):
        response = self.client.post("/api/decisions", json={"title": ""})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["ok"], False)

    def test_create_decision_persists_to_history(self):
        response = self.client.post(
            "/api/decisions",
            json={
                "title": "Buy freezer",
                "decision": "Buy freezer now because food storage capacity is needed.",
                "status": "active",
                "amountDkk": "2499",
                "tags": "household, buffer",
                "rationale": "Reduces waste and improves household resilience.",
            },
        )

        self.assertEqual(response.status_code, 201)

        history = self.client.get("/api/decisions").get_json()["decisions"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["title"], "Buy freezer")
        self.assertEqual(history[0]["amountDkk"], 2499)
        self.assertEqual(history[0]["tags"], ["household", "buffer"])


if __name__ == "__main__":
    unittest.main()
