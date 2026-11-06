"""Regression checks for the Finance container's ingress boundary.

These are intentionally dependency-free source contract tests. They do not
claim to test Docker's effective networking or production firewall rules.
"""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FinanceComposeBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        cls.env_example = (ROOT / ".env.example").read_text(encoding="utf-8")

    def test_bind_address_is_required_and_no_wildcard_is_published(self):
        self.assertRegex(
            self.compose,
            r'(?m)^\s*-\s*"\$\{FINANCE_BIND_IPV4:\?[^}\n]+\}:5155:5055"\s*$',
        )
        self.assertNotRegex(
            self.compose,
            r'(?m)^\s*-\s*["\']?(?:0\.0\.0\.0:|\[?::\]?:)?5155:5055["\']?\s*$',
        )

    def test_required_host_bind_is_documented_but_unset_by_default(self):
        self.assertRegex(
            self.env_example,
            r'(?m)^FINANCE_BIND_IPV4=\s*$',
        )


if __name__ == "__main__":
    unittest.main()
