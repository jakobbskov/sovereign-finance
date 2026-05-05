import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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


class FakeAuthResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class FinanceCoreAuthAdapterTest(unittest.TestCase):
    def setUp(self):
        os.environ["SOVEREIGN_FINANCE_ENV"] = "development"
        os.environ["FLASK_SECRET_KEY"] = "test-secret-key"
        os.environ["FINANCE_PASSWORD"] = "test-password"
        os.environ["COOKIE_SECURE"] = "0"
        os.environ["AUTH_VALIDATE_URL"] = "https://auth.example.test/api/auth/validate"
        os.environ["AUTH_COOKIE_NAME"] = "sovereign_session"
        os.environ["AUTH_CACHE_TTL_SECONDS"] = "300"

        import app as app_module
        self.app_module = importlib.reload(app_module)
        self.app_module._CORE_AUTH_CACHE.clear()
        self.client = self.app_module.app.test_client()

    def tearDown(self):
        for name in (
            "SOVEREIGN_FINANCE_ENV",
            "FLASK_SECRET_KEY",
            "FINANCE_PASSWORD",
            "COOKIE_SECURE",
            "AUTH_VALIDATE_URL",
            "AUTH_COOKIE_NAME",
            "AUTH_CACHE_TTL_SECONDS",
        ):
            os.environ.pop(name, None)

    def test_core_auth_adapter_returns_user_for_valid_session(self):
        payload = {
            "ok": True,
            "authenticated": True,
            "user_id": "user-123",
            "username": "jakob",
            "role": "admin",
        }

        with patch.object(
            self.app_module.urllib.request,
            "urlopen",
            return_value=FakeAuthResponse(payload),
        ) as urlopen_mock:
            with self.app_module.app.test_request_context(
                "/api/health",
                headers={"Cookie": "sovereign_session=abc"},
            ):
                status, user = self.app_module.get_current_core_auth_user()

        self.assertEqual(status, "ok")
        self.assertEqual(user["user_id"], "user-123")
        self.assertEqual(user["username"], "jakob")
        self.assertEqual(user["role"], "admin")

        req = urlopen_mock.call_args.args[0]
        self.assertEqual(req.headers["Cookie"], "sovereign_session=abc")
        self.assertEqual(req.full_url, "https://auth.example.test/api/auth/validate")

    def test_core_auth_adapter_returns_unauthorized_for_missing_cookie(self):
        with self.app_module.app.test_request_context("/api/health"):
            status, user = self.app_module.get_current_core_auth_user()

        self.assertEqual(status, "unauthorized")
        self.assertIsNone(user)

    def test_core_auth_adapter_returns_unauthorized_for_401(self):
        error = self.app_module.urllib.error.HTTPError(
            url="https://auth.example.test/api/auth/validate",
            code=401,
            msg="unauthorized",
            hdrs=None,
            fp=None,
        )

        with patch.object(self.app_module.urllib.request, "urlopen", side_effect=error):
            with self.app_module.app.test_request_context(
                "/api/health",
                headers={"Cookie": "sovereign_session=abc"},
            ):
                status, user = self.app_module.get_current_core_auth_user()

        self.assertEqual(status, "unauthorized")
        self.assertIsNone(user)

    def test_core_auth_adapter_returns_unavailable_for_auth_service_failure(self):
        with patch.object(
            self.app_module.urllib.request,
            "urlopen",
            side_effect=TimeoutError("timeout"),
        ):
            with self.app_module.app.test_request_context(
                "/api/health",
                headers={"Cookie": "sovereign_session=abc"},
            ):
                status, user = self.app_module.get_current_core_auth_user()

        self.assertEqual(status, "unavailable")
        self.assertIsNone(user)

    def test_require_core_auth_user_returns_503_when_auth_unavailable(self):
        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("unavailable", None),
        ):
            with self.app_module.app.test_request_context("/api/health"):
                user, error_response = self.app_module.require_core_auth_user()

        response, status = error_response
        self.assertIsNone(user)
        self.assertEqual(status, 503)
        self.assertEqual(response.get_json()["error"], "auth_unavailable")

    def test_local_login_guard_still_uses_finance_session(self):
        client = self.app_module.app.test_client()

        response = client.get("/api/finance")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "unauthorized")


class FinanceHybridAuthModeGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)

        os.environ["SOVEREIGN_FINANCE_ENV"] = "development"
        os.environ["FLASK_SECRET_KEY"] = "test-secret-key"
        os.environ["FINANCE_PASSWORD"] = "test-password"
        os.environ["COOKIE_SECURE"] = "0"
        os.environ["AUTH_MODE"] = "hybrid"
        os.environ["AUTH_VALIDATE_URL"] = "https://auth.example.test/api/auth/validate"
        os.environ["AUTH_COOKIE_NAME"] = "sovereign_session"
        os.environ["AUTH_CACHE_TTL_SECONDS"] = "300"

        import app as app_module
        self.app_module = importlib.reload(app_module)
        self.app_module._CORE_AUTH_CACHE.clear()

        self.app_module.DATA_DIR = str(self.data_dir)
        self.app_module.FINANCE_PATH = str(self.data_dir / "finance.json")
        self.app_module.EVENTS_PATH = str(self.data_dir / "events.json")
        self.app_module.DECISIONS_PATH = str(self.data_dir / "decisions.json")

        self._write_json(
            self.app_module.FINANCE_PATH,
            {
                "version": 1,
                "income": [],
                "fixed_expenses": [],
                "events": [],
                "strategies": [],
            },
        )
        self._write_json(self.app_module.EVENTS_PATH, {"version": 1, "events": []})
        self._write_json(self.app_module.DECISIONS_PATH, {"version": 1, "decisions": []})

        self.client = self.app_module.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()
        for name in (
            "SOVEREIGN_FINANCE_ENV",
            "FLASK_SECRET_KEY",
            "FINANCE_PASSWORD",
            "COOKIE_SECURE",
            "AUTH_MODE",
            "AUTH_VALIDATE_URL",
            "AUTH_COOKIE_NAME",
            "AUTH_CACHE_TTL_SECONDS",
        ):
            os.environ.pop(name, None)

    def _write_json(self, path, payload):
        Path(path).write_text(json.dumps(payload), encoding="utf-8")

    def test_local_mode_still_requires_finance_session_and_does_not_call_core_auth(self):
        os.environ["AUTH_MODE"] = "local"

        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("ok", {"user_id": "core-user"}),
        ) as core_auth_mock:
            response = self.client.get(
                "/api/finance",
                headers={"Cookie": "sovereign_session=abc"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "unauthorized")
        core_auth_mock.assert_not_called()

    def test_hybrid_mode_accepts_existing_local_finance_session_first(self):
        with self.client.session_transaction() as session:
            session["finance_auth"] = True

        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("ok", {"user_id": "core-user"}),
        ) as core_auth_mock:
            response = self.client.get("/api/finance")

        self.assertEqual(response.status_code, 200)
        core_auth_mock.assert_not_called()

    def test_hybrid_mode_accepts_valid_core_auth_session(self):
        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("ok", {"user_id": "core-user", "username": "jakob", "role": "admin"}),
        ) as core_auth_mock:
            response = self.client.get(
                "/api/finance",
                headers={"Cookie": "sovereign_session=abc"},
            )

        self.assertEqual(response.status_code, 200)
        core_auth_mock.assert_called_once()

    def test_hybrid_mode_rejects_missing_or_invalid_auth(self):
        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("unauthorized", None),
        ):
            response = self.client.get("/api/finance")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "unauthorized")

    def test_hybrid_mode_returns_503_when_core_auth_is_unavailable(self):
        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("unavailable", None),
        ):
            response = self.client.get(
                "/api/finance",
                headers={"Cookie": "sovereign_session=abc"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"], "auth_unavailable")

    def test_hybrid_mode_keeps_static_assets_public(self):
        with patch.object(
            self.app_module,
            "get_current_core_auth_user",
            return_value=("unavailable", None),
        ) as core_auth_mock:
            response = self.client.get("/static/app.js")

        self.assertEqual(response.status_code, 200)
        core_auth_mock.assert_not_called()

