import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path


class FinanceLiveEndpointRegressionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)

        os.environ["SOVEREIGN_FINANCE_ENV"] = "development"
        os.environ["FLASK_SECRET_KEY"] = "test-secret-key"
        os.environ["FINANCE_PASSWORD"] = "test-password"
        os.environ["COOKIE_SECURE"] = "0"

        import app as app_module
        self.app_module = importlib.reload(app_module)

        self.app_module.DATA_DIR = str(self.data_dir)
        self.app_module.FINANCE_PATH = str(self.data_dir / "finance.json")
        self.app_module.EVENTS_PATH = str(self.data_dir / "events.json")
        self.app_module.DECISIONS_PATH = str(self.data_dir / "decisions.json")

        self._write_json(
            self.app_module.FINANCE_PATH,
            {
                "version": 1,
                "assumptions": {
                    "months": 12,
                    "buffer_start": 50000,
                    "buffer_floor": 30000,
                    "buffer_target": 80000,
                },
                "goals": {
                    "target_buffer": 80000,
                    "min_buffer_floor": 30000,
                    "latest_month": 12,
                },
                "income": [
                    {
                        "name": "Salary",
                        "monthly": 30000,
                        "payment": 30000,
                        "every_months": 1,
                    }
                ],
                "fixed_expenses": [
                    {
                        "name": "Fixed expenses",
                        "monthly": 20000,
                        "payment": 20000,
                        "every_months": 1,
                    }
                ],
                "debts": [],
                "strategies": [
                    {
                        "id": "buffer_first",
                        "name": "Buffer first",
                        "enabled": True,
                        "params": {},
                    }
                ],
                "active_strategy_id": "buffer_first",
            },
        )
        self._write_json(self.app_module.EVENTS_PATH, {"version": 1, "events": []})
        self._write_json(self.app_module.DECISIONS_PATH, {"version": 1, "decisions": []})

        self.client = self.app_module.app.test_client()
        self._authenticate()

    def tearDown(self):
        self.tmp.cleanup()
        for name in ("SOVEREIGN_FINANCE_ENV", "FLASK_SECRET_KEY", "FINANCE_PASSWORD", "COOKIE_SECURE"):
            os.environ.pop(name, None)

    def _write_json(self, path, payload):
        Path(path).write_text(json.dumps(payload), encoding="utf-8")

    def _authenticate(self):
        with self.client.session_transaction() as session:
            session["finance_auth"] = True

    def test_health_endpoint_returns_ok_without_auth(self):
        client = self.app_module.app.test_client()

        response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["service"], "sovereign-finance")

    def test_protected_finance_endpoint_requires_auth(self):
        client = self.app_module.app.test_client()

        response = client.get("/api/finance")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "unauthorized")


    def test_static_app_asset_is_available_without_auth(self):
        client = self.app_module.app.test_client()

        response = client.get("/static/app.js")

        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.headers.get("Content-Type", "").lower())

    def test_static_format_helper_is_available_without_auth(self):
        client = self.app_module.app.test_client()

        response = client.get("/static/sf-format.js")

        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.headers.get("Content-Type", "").lower())


    def test_login_accepts_configured_password(self):
        client = self.app_module.app.test_client()

        response = client.post("/login", data={"password": "test-password"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/")

    def test_login_rejects_wrong_password(self):
        client = self.app_module.app.test_client()

        response = client.post("/login", data={"password": "wrong"})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login?err=1")

    def test_finance_endpoint_returns_fixture_state(self):
        response = self.client.get("/api/finance")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["active_strategy_id"], "buffer_first")
        self.assertEqual(payload["income"][0]["monthly"], 30000)

    def test_events_endpoint_returns_empty_event_store(self):
        response = self.client.get("/api/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"version": 1, "events": []})

    def test_decisions_endpoint_returns_empty_decision_store(self):
        response = self.client.get("/api/decisions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"version": 1, "decisions": []})

    def test_scenario_evaluate_returns_projection(self):
        response = self.client.post(
            "/api/scenario/evaluate",
            json={
                "type": "purchase",
                "label": "Test purchase",
                "amount": 1000,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["scenario"]["type"], "purchase")
        self.assertIn("decision", payload)
        self.assertIn("risk", payload)
        self.assertIn("projection", payload)
        self.assertEqual(payload["projection"]["months"], 12)

    def test_scenario_save_persists_decision_history(self):
        response = self.client.post(
            "/api/scenario/save",
            json={
                "scenario": {
                    "type": "purchase",
                    "label": "Test saved purchase",
                    "amount": 1000,
                },
                "evaluation": {
                    "decision": "ok",
                    "risk": "low",
                    "reasons": ["test reason"],
                    "alternatives": [],
                    "projection": {
                        "final_buffer": 49000,
                        "min_buffer": 49000,
                        "months": 1,
                        "rows_preview": [],
                    },
                },
                "notes": "test note",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["saved"], True)
        self.assertEqual(payload["count"], 1)

        history_response = self.client.get("/api/decisions")
        history = history_response.get_json()["decisions"]

        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["label"], "Test saved purchase")
        self.assertEqual(history[0]["type"], "purchase")
        self.assertEqual(history[0]["notes"], "test note")


if __name__ == "__main__":
    unittest.main()


class FinanceRouteRegistrationTest(unittest.TestCase):
    def test_no_duplicate_same_method_routes_are_registered(self):
        import app as app_module

        seen = {}
        duplicates = []

        for rule in app_module.app.url_map.iter_rules():
            methods = tuple(sorted(method for method in rule.methods if method not in {"HEAD", "OPTIONS"}))
            key = (str(rule), methods)

            if key in seen:
                duplicates.append((str(rule), ",".join(methods), seen[key], rule.endpoint))
            else:
                seen[key] = rule.endpoint

        self.assertEqual(duplicates, [])
