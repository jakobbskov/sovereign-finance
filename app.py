from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SOVEREIGN_FINANCE_DATA_DIR", BASE_DIR / "data"))
DECISIONS_FILE = DATA_DIR / "decisions.json"

app = Flask(__name__, static_folder="static", static_url_path="/static")


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")

    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    tmp_path.replace(path)


def list_decisions() -> list[dict[str, Any]]:
    data = read_json_file(DECISIONS_FILE, [])
    if not isinstance(data, list):
        return []
    return data


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def parse_optional_amount(value: Any) -> int | float | None:
    if value in (None, ""):
        return None

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return value

    if isinstance(value, str):
        normalized = value.strip().replace(".", "").replace(",", ".")
        try:
            number = float(normalized)
        except ValueError:
            return None
        return int(number) if number.is_integer() else number

    return None


def normalize_tags(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_tags = value.split(",")
    elif isinstance(value, list):
        raw_tags = value
    else:
        raw_tags = []

    tags: list[str] = []
    for tag in raw_tags:
        cleaned = clean_text(tag).lower()
        if cleaned and cleaned not in tags:
            tags.append(cleaned)

    return tags


def build_decision(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    title = clean_text(payload.get("title"))
    decision = clean_text(payload.get("decision"))

    if not title:
        return None, "title is required"

    if not decision:
        return None, "decision is required"

    status = clean_text(payload.get("status")) or "planned"
    if status not in {"planned", "active", "done", "rejected"}:
        return None, "status must be one of: planned, active, done, rejected"

    return {
        "id": f"decision-{uuid.uuid4().hex[:12]}",
        "createdAt": now_utc_iso(),
        "title": title,
        "decision": decision,
        "status": status,
        "amountDkk": parse_optional_amount(payload.get("amountDkk")),
        "tags": normalize_tags(payload.get("tags")),
        "rationale": clean_text(payload.get("rationale")),
    }, None


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "sovereign-finance"})


@app.get("/api/decisions")
def get_decisions():
    return jsonify({"decisions": list_decisions()})


@app.post("/api/decisions")
def create_decision():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "JSON object required"}), 400

    decision, error = build_decision(payload)
    if error:
        return jsonify({"ok": False, "error": error}), 400

    decisions = list_decisions()
    decisions.append(decision)
    write_json_file(DECISIONS_FILE, decisions)

    return jsonify({"ok": True, "decision": decision}), 201


if __name__ == "__main__":
    host = os.environ.get("SOVEREIGN_FINANCE_HOST", "127.0.0.1")
    port = int(os.environ.get("SOVEREIGN_FINANCE_PORT", "5055"))
    app.run(host=host, port=port)
