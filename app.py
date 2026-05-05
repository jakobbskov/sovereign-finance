from flask import Flask, request, jsonify, send_from_directory, session, redirect, Response
import json, os, hmac


from datetime import datetime
import calendar

def _month_progress(yyyy_mm: str, now_dt: datetime | None = None):
    if not now_dt:
        now_dt = datetime.now()

    y, m = [int(x) for x in yyyy_mm.split("-")]
    dim = calendar.monthrange(y, m)[1]

    if now_dt.year == y and now_dt.month == m:
        d = max(1, min(dim, now_dt.day))
    else:
        d = dim

    progress = (d - 1) / max(1, (dim - 1))
    return progress, d, dim
from datetime import date, timedelta

def _env_value(name: str) -> str:
    return str(os.environ.get(name, "") or "").strip()


def _is_dev_runtime() -> bool:
    return _env_value("SOVEREIGN_FINANCE_ENV").lower() == "development"


def _require_runtime_secret(name: str) -> str:
    value = _env_value(name)

    if value and value != "CHANGE-ME":
        return value

    if _is_dev_runtime():
        return f"dev-only-{name.lower()}"

    raise RuntimeError(f"{name} must be set to a non-placeholder value")


def _cookie_secure_enabled() -> bool:
    value = _env_value("COOKIE_SECURE")
    if not value:
        return True
    return value == "1"


FLASK_SECRET_KEY = _require_runtime_secret("FLASK_SECRET_KEY")
FINANCE_PASSWORD = _require_runtime_secret("FINANCE_PASSWORD")

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
app.permanent_session_lifetime = timedelta(hours=12)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=_cookie_secure_enabled(),
)

LOGIN_HTML = """<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sovereign Finance · Login</title>
  <style>
    body{
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;
      background:#f6f6f4;
      color:#111;
      max-width:420px;
      margin:48px auto;
      padding:0 16px;
    }
    .card{
      background:#fff;
      border:1px solid #ddd;
      border-radius:16px;
      padding:20px;
      box-shadow:0 1px 2px rgba(0,0,0,.04);
    }
    h1{margin:0 0 8px 0;font-size:2rem}
    p{opacity:.8}
    label{display:block;margin:14px 0 6px}
    input,button{
      width:100%;
      box-sizing:border-box;
      font:inherit;
      padding:12px 14px;
      border-radius:12px;
      border:1px solid #bbb;
    }
    button{cursor:pointer}
    .err{
      margin:12px 0 0;
      padding:10px 12px;
      border-radius:10px;
      background:#fff3f3;
      border:1px solid #e1b4b4;
      color:#7a1f1f;
    }
    .small{margin-top:10px;opacity:.7;font-size:.95rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sovereign Finance</h1>
    <p>Log ind for at åbne dit budget. Ja, en lås på døren. Radikalt koncept.</p>
    <form method="post" action="/login">
      <label for="password">Adgangskode</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit" style="margin-top:14px">Log ind</button>
    </form>
    __ERR__
    <div class="small">Adgangen beskytter både dashboard og API.</div>
  </div>
</body>
</html>"""

def _is_logged_in():
    return bool(session.get("finance_auth"))

def _auth_required():
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return redirect("/login")

@app.before_request
def _login_guard():
    allowed = {"login_page", "login_post", "logout", "health", "static", "static_files"}
    if request.endpoint in allowed:
        return None
    if request.path == "/favicon.ico":
        return ("", 204)
    if not _is_logged_in():
        return _auth_required()

@app.get("/login")
def login_page():
    if _is_logged_in():
        return redirect("/")
    err_html = '<div class="err">Forkert adgangskode.</div>' if request.args.get("err") else ""
    return Response(LOGIN_HTML.replace("__ERR__", err_html), mimetype="text/html")

@app.post("/login")
def login_post():
    expected = FINANCE_PASSWORD
    provided = str(request.form.get("password", "") or "").strip()
    if hmac.compare_digest(provided, expected):
        session.permanent = True
        session["finance_auth"] = True
        return redirect("/")
    return redirect("/login?err=1")

@app.get("/logout")
def logout():
    session.clear()
    return redirect("/login")


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
FINANCE_PATH = os.path.join(DATA_DIR, "finance.json")
EVENTS_PATH = os.path.join(DATA_DIR, "events.json")


# ---------- UI ----------
@app.get("/")
def root():
    return send_from_directory("static", "index.html")

@app.get("/static/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


# ---------- helpers ----------
def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, obj):
    import os, json, time
    os.makedirs(os.path.dirname(path), exist_ok=True)

    tmp = str(path) + ".tmp." + str(os.getpid()) + "." + str(int(time.time()*1000))
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())

    os.replace(tmp, path)
# ---------- API ----------
@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "sovereign-finance", "date": str(date.today())})

@app.get("/api/finance")
def get_finance():
    data = read_json(FINANCE_PATH, {"version": 1})
    return jsonify(data)

@app.post("/api/finance")
def set_finance():
    payload = request.get_json(force=True, silent=False)
    write_json(FINANCE_PATH, payload)
    return jsonify({"ok": True})

def _event_fingerprint(event):
    e = dict(event or {})
    t = str(e.get("type", "") or "")
    ts = str(e.get("ts", "") or "")
    month = str(e.get("month", "") or "")
    amount = e.get("amount", None)
    label = str(e.get("label", "") or "")
    balance_now = e.get("balance_now", None)
    income_state = str(e.get("income_state", "") or "")
    surprise_amount = e.get("surprise_amount", None)
    surprise_label = str(e.get("surprise_label", "") or "")
    extra_save = e.get("extra_save", None)
    deviation_kind_guess = str(e.get("deviation_kind_guess", "") or "")
    start_balance = e.get("start_balance", None)
    current_balance = e.get("current_balance", None)
    deviation = e.get("deviation", None)
    active_strategy_id = str(e.get("active_strategy_id", "") or "")

    return (
        t, ts, month, amount, label,
        balance_now, income_state,
        surprise_amount, surprise_label, extra_save, deviation_kind_guess,
        start_balance, current_balance, deviation, active_strategy_id
    )

@app.get("/api/events")
def get_events():
    events = read_json(EVENTS_PATH, {"version": 1, "events": []})
    return jsonify(events)

@app.post("/api/event")
def add_event():
    event = request.get_json(force=True, silent=False)
    events = read_json(EVENTS_PATH, {"version": 1, "events": []})
    event.setdefault("ts", str(date.today()))

    arr = list(events.get("events", []) or [])
    fp = _event_fingerprint(event)

    # dedupe mod sidste event: nok til at stoppe dobbeltklik / dobbelt-listeners
    if arr:
        last = arr[-1]
        if _event_fingerprint(last) == fp:
            return jsonify({"ok": True, "count": len(arr), "deduped": True})

    arr.append(event)
    events["events"] = arr
    write_json(EVENTS_PATH, events)
    return jsonify({"ok": True, "count": len(arr), "deduped": False})


@app.post("/api/close-month")
def close_month():
    """
    Input:
      {
        "month": 1,
        "buffer_start": 10000,
        "buffer_end": 8500,
        "forced_savings": 0,
        "extra_monthly_cost": 0,
        "one_off": 0
      }
    Computes implied spending and stores a log entry in events.json.
    Also updates finance.json baseline fixed_expenses if possible.
    """
    payload = request.get_json(force=True, silent=False) or {}

    month = int(payload.get("month", 0) or 0)
    buffer_start = float(payload.get("buffer_start", 0) or 0)
    buffer_end = float(payload.get("buffer_end", 0) or 0)
    forced_savings = float(payload.get("forced_savings", 0) or 0)
    extra_monthly_cost = float(payload.get("extra_monthly_cost", 0) or 0)
    one_off = float(payload.get("one_off", 0) or 0)

    finance = normalize_finance_for_strategy(read_json(FINANCE_PATH, {"version": 1}))
    income_total = sum(float(x.get("monthly", 0)) for x in finance.get("income", []))
    fixed_total = sum(float(x.get("monthly", 0)) for x in finance.get("fixed_expenses", []))

    debts = finance.get("debts", [])
    debt_pay = 0.0
    if month > 0:
        for d in debts:
            pay = float(d.get("payment", 0))
            every = int(d.get("every_months", 1)) or 1
            if (month - 1) % every == 0:
                debt_pay += pay

    # Delta buffer = buffer_end - buffer_start
    delta = buffer_end - buffer_start

    # Spending implied:
    # income - (fixed + debt + extra + savings + one_off) = delta
    # => fixed_implied = income - debt - extra - savings - one_off - delta
    fixed_implied = income_total - debt_pay - extra_monthly_cost - forced_savings - one_off - delta

    # Store event log
    events = read_json(EVENTS_PATH, {"version": 1, "events": []})
    events["events"].append({
        "type": "close-month",
        "ts": str(date.today()),
        "month": month,
        "buffer_start": buffer_start,
        "buffer_end": buffer_end,
        "delta": delta,
        "income_total": income_total,
        "debt_pay": debt_pay,
        "extra": extra_monthly_cost,
        "savings": forced_savings,
        "one_off": one_off,
        "fixed_current": fixed_total,
        "fixed_implied": fixed_implied
    })
    write_json(EVENTS_PATH, events)

    # Optional: update finance baseline fixed_expenses using a simple smoothing rule
    # Only if fixed_expenses are empty or clearly placeholder zeros
    fx = finance.get("fixed_expenses", [])
    fx_sum = sum(float(x.get("monthly", 0)) for x in fx) if fx else 0.0

    # If baseline is zero-ish, set it to implied
    
    if fx_sum < 1:
        finance["fixed_expenses"] = [{"name": "Baseline (auto)", "monthly": round(fixed_implied, 2)}]
        write_json(FINANCE_PATH, finance)
        updated = True
        new_fixed = fixed_implied
    else:
        # smoothing update
        alpha = 0.3
        smoothed = (1 - alpha) * fx_sum + alpha * fixed_implied
        finance["fixed_expenses"] = [{"name": "Baseline (auto)", "monthly": round(smoothed, 2)}]
        write_json(FINANCE_PATH, finance)
        updated = True
        new_fixed = smoothed


    return jsonify({
        "ok": True,
        "month": month,
        "fixed_current": fixed_total,
        "fixed_implied": fixed_implied,
        "baseline_updated": updated,
        "baseline_fixed_now": new_fixed
    })




# ---------- compatibility layer for legacy finance.json ----------
def _item_is_active(item, default_month=12):
    sm = item.get("start_month", 1)
    try:
        sm = int(sm)
    except Exception:
        return True

    # Hvis start_month er YYYYMM, tag månedsdelen
    if sm > 10000:
        sm = sm % 100

    try:
        current_month = int(default_month or 12)
    except Exception:
        current_month = 12

    if current_month < 1:
        current_month = 12

    return sm <= current_month

def _monthly_equivalent(payment, every_months):
    try:
        payment = float(payment or 0)
    except Exception:
        payment = 0.0
    try:
        every = int(every_months or 1)
    except Exception:
        every = 1
    if every <= 0:
        every = 1
    return payment / every

def normalize_finance_for_strategy(finance):
    out = dict(finance or {})

    assumptions = dict(out.get("assumptions") or {})
    goals = dict(out.get("goals") or {})
    baseline = dict(out.get("baseline") or {})
    items = list(out.get("items") or [])
    latest_month = int((goals.get("latest_month", 12) or 12))

    if not assumptions.get("buffer_start"):
        checkin = dict(out.get("checkin") or {})
        assumptions["buffer_start"] = float(checkin.get("balance_now", 0) or 0)

    if assumptions.get("buffer_floor") in (None, "", 0):
        assumptions["buffer_floor"] = float(goals.get("min_buffer_floor", 0) or 0)

    if assumptions.get("buffer_target") in (None, "", 0):
        assumptions["buffer_target"] = float(goals.get("target_buffer", 0) or 0)

    income = []
    raw_income = list(out.get("income") or [])
    for x in raw_income:
        row = dict(x)
        if "monthly" not in row:
            row["monthly"] = _monthly_equivalent(row.get("payment", 0), row.get("every_months", 1))
        income.append(row)

    if not income or sum(float(x.get("monthly", 0) or 0) for x in income) == 0:
        for item in items:
            if str(item.get("type", "")).lower() == "income" and _item_is_active(item, latest_month):
                income.append({
                    "name": item.get("name", "Income"),
                    "monthly": _monthly_equivalent(item.get("payment", 0), item.get("every_months", 1)),
                    "payment": item.get("payment", 0),
                    "every_months": item.get("every_months", 1),
                })

    fixed_expenses = list(out.get("fixed_expenses") or [])
    if not fixed_expenses:
        for item in items:
            if str(item.get("type", "")).lower() == "fixed" and _item_is_active(item, latest_month):
                fixed_expenses.append({
                    "name": item.get("name", "Fixed"),
                    "monthly": _monthly_equivalent(item.get("payment", 0), item.get("every_months", 1)),
                    "payment": item.get("payment", 0),
                    "every_months": item.get("every_months", 1),
                    "category": item.get("category"),
                })

    debts = list(out.get("debts") or [])
    if not debts:
        for item in items:
            if str(item.get("type", "")).lower() == "debt" and _item_is_active(item, latest_month):
                debts.append({
                    "name": item.get("name", "Debt"),
                    "payment": float(item.get("payment", 0) or 0),
                    "every_months": int(item.get("every_months", 1) or 1),
                    "category": item.get("category"),
                })

    if baseline.get("income_monthly_total", 0) in (None, "", 0):
        baseline["income_monthly_total"] = round(sum(float(x.get("monthly", 0) or 0) for x in income), 2)

    if baseline.get("fixed_monthly_total", 0) in (None, "", 0):
        baseline["fixed_monthly_total"] = round(sum(float(x.get("monthly", 0) or 0) for x in fixed_expenses), 2)

    out["assumptions"] = assumptions
    out["baseline"] = baseline
    out["income"] = income
    out["fixed_expenses"] = fixed_expenses
    out["debts"] = debts
    return out

def run_strategy(finance, strategy, shocks=None):
    shocks = shocks or {}
    months = int(finance.get("assumptions", {}).get("months", 24))
    buffer_amount = float(finance.get("assumptions", {}).get("buffer_start", 0))

    income_items = finance.get("income", [])
    fixed_items = finance.get("fixed_expenses", [])
    debts = finance.get("debts", [])

    base_income = sum(float(x.get("monthly", 0)) for x in income_items)
    base_fixed = sum(float(x.get("monthly", 0)) for x in fixed_items)

    forced_savings = float(strategy.get("forced_savings", 0))
    extra_cost = float(strategy.get("extra_monthly_cost", 0))
    cut_fixed_pct = float(strategy.get("cut_fixed_pct", 0))  # 0.1 = cut 10%
    extra_income = float(strategy.get("extra_income", 0))

    move_cost = float(strategy.get("move_cost", 0))
    move_month = int(strategy.get("move_month", 0) or 0)

    bad_month_extra = float(shocks.get("bad_month_extra", 0))
    two_bad_months = bool(shocks.get("two_bad_months", False))
    income_drop_pct = float(shocks.get("income_drop_pct", 0))
    income_drop_months = int(shocks.get("income_drop_months", 0) or 0)

    rows = []
    min_buffer = buffer_amount
    first_below_floor = None

    for m in range(1, months + 1):
        # income shock
        income = base_income + extra_income
        if income_drop_months and m <= income_drop_months:
            income *= (1.0 - income_drop_pct)

        # fixed with cut
        fixed = base_fixed * (1.0 - cut_fixed_pct)

        # debt payment schedule
        debt_pay = 0.0
        for d in debts:
            pay = float(d.get("payment", 0))
            every = int(d.get("every_months", 1)) or 1
            if (m - 1) % every == 0:
                debt_pay += pay

        # shock: bad month(s)
        shock_extra = 0.0
        if bad_month_extra:
            if two_bad_months:
                if m in (1, 2):
                    shock_extra = bad_month_extra
            else:
                if m == 1:
                    shock_extra = bad_month_extra

        # move cost
        one_off = move_cost if (move_month and m == move_month) else 0.0

        net = income - fixed - debt_pay - forced_savings - extra_cost - shock_extra - one_off
        buffer_amount += net

        if buffer_amount < min_buffer:
            min_buffer = buffer_amount

        rows.append({
            "month": m,
            "income": income,
            "fixed": fixed,
            "debt": debt_pay,
            "savings": forced_savings,
            "extra": extra_cost,
            "shock": shock_extra,
            "one_off": one_off,
            "net": net,
            "buffer": buffer_amount
        })

    return {"rows": rows, "final_buffer": buffer_amount, "min_buffer": min_buffer}


def score_plan(finance, result):
    goals = finance.get("goals", {})
    target = float(goals.get("target_buffer", 0) or 0)
    latest = int(goals.get("latest_month", 0) or 0)
    floor = float(goals.get("min_buffer_floor", 0) or 0)

    rows = result["rows"]
    hit_month = None
    for r in rows:
        if target and r["buffer"] >= target:
            hit_month = r["month"]
            break

    floor_breach = None
    for r in rows:
        if floor and r["buffer"] < floor:
            floor_breach = r["month"]
            break

    # scoring: lower is better
    score = 0.0
    if target:
        if hit_month is None:
            score += 1e6
        else:
            score += hit_month * 1000

    # penalty for low minimum buffer
    score += max(0.0, (floor - result["min_buffer"])) * 10

    # penalty if floor breached
    if floor_breach is not None:
        score += 5e5 + floor_breach * 1000

    # bonus if hits target before latest
    if latest and hit_month is not None and hit_month <= latest:
        score -= 50000

    return {
        "score": score,
        "hit_month": hit_month,
        "floor_breach": floor_breach
    }


@app.get("/api/strategies")
def strategies():
    # Strategy catalog (starter pack)
    return jsonify({
        "strategies": [
            {"id":"buffer_2000", "name":"Buffer-first (2.000/m)", "forced_savings":2000},
            {"id":"buffer_4000", "name":"Buffer-first (4.000/m)", "forced_savings":4000},
            {"id":"cut10_save2000", "name":"Cut 10% + 2.000 opsp.", "cut_fixed_pct":0.10, "forced_savings":2000},
            {"id":"exit_month6", "name":"Exit-fund (flyt m6, 35k)", "move_month":6, "move_cost":35000, "forced_savings":3000},
            {"id":"income_boost_3k", "name":"Income boost +3k", "extra_income":3000, "forced_savings":2000},
            {"id":"austerity", "name":"Austerity (cut 15% + 4k opsp.)", "cut_fixed_pct":0.15, "forced_savings":4000}
        ]
    })


@app.post("/api/plan")
def plan():
    finance = normalize_finance_for_strategy(read_json(FINANCE_PATH, {"version": 1}))
    payload = request.get_json(force=True, silent=False) or {}
    shocks = payload.get("shocks", {}) or {}
    strat_ids = payload.get("strategy_ids")

    catalog = strategies().json["strategies"]
    if strat_ids:
        cat = [x for x in catalog if x.get("id") in set(strat_ids)]
    else:
        cat = catalog

    ranked = []
    for st in cat:
        res = run_strategy(finance, st, shocks=shocks)
        sc = score_plan(finance, res)
        ranked.append({
            "id": st["id"],
            "name": st["name"],
            "params": {k:v for k,v in st.items() if k not in ("id","name")},
            "score": sc["score"],
            "hit_month": sc["hit_month"],
            "floor_breach": sc["floor_breach"],
            "final_buffer": res["final_buffer"],
            "min_buffer": res["min_buffer"]
        })

    ranked.sort(key=lambda x: x["score"])
    return jsonify({
        "ok": True,
        "ranked": ranked[:10],
        "used_shocks": shocks,
        "goals": finance.get("goals", {})
    })


@app.post("/api/plan_detail")
def plan_detail():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}
    shocks = payload.get("shocks", {}) or {}
    strategy_id = payload.get("strategy_id")

    catalog = strategies().json["strategies"]
    st = None
    for x in catalog:
        if x.get("id") == strategy_id:
            st = x
            break
    if not st:
        return jsonify({"ok": False, "error": "unknown strategy_id"}), 400

    res = run_strategy(finance, st, shocks=shocks)
    sc = score_plan(finance, res)

    # show only first months for diagnosis
    preview_months = int(payload.get("preview_months", 3) or 3)
    return jsonify({
        "ok": True,
        "strategy": {"id": st["id"], "name": st["name"], "params": {k:v for k,v in st.items() if k not in ("id","name")}},
        "goals": finance.get("goals", {}),
        "score": sc,
        "assumptions": finance.get("assumptions", {}),
        "preview": res["rows"][:preview_months]
    })



def ym_today():
    # YYYY-MM based on server date
    from datetime import date
    d = date.today()
    return f"{d.year:04d}-{d.month:02d}"

def get_active_strategy(finance):
    sid = finance.get("active_strategy_id")
    if not sid:
        return None
    catalog = strategies().json["strategies"]
    for st in catalog:
        if st.get("id") == sid:
            return st
    return None

@app.get("/api/months")
def months():
    finance = read_json(FINANCE_PATH, {"version": 1})
    return jsonify({"ok": True, "months": finance.get("month_log", [])})

@app.post("/api/strategy/select")
def strategy_select():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}
    sid = payload.get("strategy_id")
    if not sid:
        return jsonify({"ok": False, "error": "strategy_id required"}), 400
    # validate exists
    catalog = strategies().json["strategies"]
    if sid not in {x.get("id") for x in catalog}:
        return jsonify({"ok": False, "error": "unknown strategy_id"}), 400
    finance["active_strategy_id"] = sid
    write_json(FINANCE_PATH, finance)
    return jsonify({"ok": True, "active_strategy_id": sid})

@app.post("/api/goals")
def set_goals():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}
    goals = finance.get("goals", {})
    for k in ("target_buffer","latest_month","min_buffer_floor"):
        if k in payload:
            goals[k] = payload[k]
    finance["goals"] = goals
    write_json(FINANCE_PATH, finance)
    return jsonify({"ok": True, "goals": goals})

@app.post("/api/month/start")
def month_start():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}
    month = payload.get("month") or ym_today()
    start_balance = payload.get("start_balance")
    if start_balance is None:
        return jsonify({"ok": False, "error": "start_balance required"}), 400

    log = finance.get("month_log", [])
    # upsert month
    found = None
    for row in log:
        if row.get("month") == month:
            found = row
            break
    if not found:
        found = {"month": month}
        log.append(found)

    found["start_balance"] = float(start_balance)
    found.setdefault("end_balance", None)
    found.setdefault("notes", "")
    found.setdefault("overrides", {"one_off": 0, "categories": {}})

    finance["month_log"] = log
    write_json(FINANCE_PATH, finance)

    return jsonify({"ok": True, "month": month, "start_balance": float(start_balance)})

@app.post("/api/month/close")
def month_close():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}
    month = payload.get("month") or ym_today()
    end_balance = payload.get("end_balance")
    if end_balance is None:
        return jsonify({"ok": False, "error": "end_balance required"}), 400

    log = finance.get("month_log", [])
    row = None
    for r in log:
        if r.get("month") == month:
            row = r
            break
    if not row:
        row = {"month": month, "start_balance": 0, "overrides": {"one_off": 0, "categories": {}}}
        log.append(row)

    row["end_balance"] = float(end_balance)
    if "notes" in payload:
        row["notes"] = str(payload["notes"] or "")

    # Compute delta
    start = float(row.get("start_balance") or 0)
    end = float(end_balance)
    delta = end - start

    # Compute a "planned" month using active strategy (if any)
    st = get_active_strategy(finance)
    shocks = payload.get("shocks", {}) or {}
    planned = None
    if st:
        # run strategy but only show month 1 net (model month)
        res = run_strategy(finance, st, shocks=shocks)
        planned = res["rows"][0] if res.get("rows") else None

    # Infer implied spending: delta vs modeled known nets
    # We keep this simple: show delta and compare to planned net if available.
    feedback = {
        "month": month,
        "start_balance": start,
        "end_balance": end,
        "delta": delta
    }
    if planned:
        feedback["planned_net"] = planned["net"]
        feedback["net_gap"] = delta - planned["net"]

    finance["month_log"] = log
    write_json(FINANCE_PATH, finance)

    return jsonify({"ok": True, "feedback": feedback, "active_strategy": (st["id"] if st else None)})

@app.get("/api/questions")
def questions():
    finance = read_json(FINANCE_PATH, {"version": 1})
    month = request.args.get("month") or ym_today()
    goals = finance.get("goals", {}) or {}
    st = get_active_strategy(finance)

    # Minimal "relevant questions" generator.
    # Ask about one-off costs + 3 highest-variance categories we care about.
    qs = [
        {"id":"one_off", "type":"number", "label":"Var der engangsudgifter denne måned? (kr)", "default": 0},
        {"id":"groceries", "type":"number", "label":"Ca. dagligvarer (kr)", "default": 6500},
        {"id":"fuel", "type":"number", "label":"Ca. benzin/transport (kr)", "default": 2300},
        {"id":"takeaway", "type":"number", "label":"Ca. takeaway/fastfood (kr)", "default": 600},
    ]

    return jsonify({
        "ok": True,
        "month": month,
        "active_strategy": (st["id"] if st else None),
        "goals": goals,
        "questions": qs
    })



@app.post("/api/month/refine")
def month_refine():
    finance = read_json(FINANCE_PATH, {"version": 1})
    payload = request.get_json(force=True, silent=False) or {}

    month = payload.get("month")
    if not month:
        return jsonify({"ok": False, "error": "month required"}), 400

    log = finance.get("month_log", [])
    row = next((r for r in log if r.get("month") == month), None)
    if not row:
        return jsonify({"ok": False, "error": "month not found"}), 404

    overrides = row.setdefault("overrides", {"one_off": 0, "categories": {}})
    overrides["one_off"] = float(payload.get("one_off", 0))

    categories = payload.get("categories", {})
    overrides["categories"] = categories

    # --- Baseline smoothing ---
    fixed = finance.get("fixed_expenses", [])
    if fixed:
        current_baseline = float(fixed[0].get("monthly", 0))
    else:
        current_baseline = 0.0

    start = float(row.get("start_balance") or 0)
    end = float(row.get("end_balance") or 0)
    delta = end - start

    income_total = sum(float(x.get("monthly", 0)) for x in finance.get("income", []))
    debt_month = debt_payment_for_month(finance, month)

    one_off = overrides.get("one_off", 0)
    implied_fixed = income_total - debt_month - delta - one_off

    new_baseline = 0.7 * current_baseline + 0.3 * implied_fixed

    if fixed:
        fixed[0]["monthly"] = round(new_baseline, 2)

    finance["fixed_expenses"] = fixed

    # --- Realism score ---
    realism = finance.setdefault("strategy_realism", {})
    active = finance.get("active_strategy_id")
    if active:
        score = realism.get(active, 0)

        # If negative delta while strategy expected positive, penalize
        if delta < 0:
            score -= 1
        else:
            score += 0.5

        realism[active] = score

    finance["month_log"] = log
    write_json(FINANCE_PATH, finance)

    return jsonify({
        "ok": True,
        "new_baseline": round(new_baseline, 2),
        "realism": realism.get(active) if active else None,
        "implied_fixed": round(implied_fixed, 2)
    })

def simulate_baseline(finance, scenario):
    months = int(finance.get("assumptions", {}).get("months", 12))
    buffer_amount = float(finance.get("assumptions", {}).get("buffer_start", 0))

    income_total = sum(float(x.get("monthly", 0)) for x in finance.get("income", []))
    fixed_total = sum(float(x.get("monthly", 0)) for x in finance.get("fixed_expenses", []))

    debts = finance.get("debts", [])
    rows = []
    for m in range(1, months + 1):
        debt_pay = 0.0
        for d in debts:
            pay = float(d.get("payment", 0))
            every = int(d.get("every_months", 1)) or 1
            if (m - 1) % every == 0:
                debt_pay += pay

        extra = float(scenario.get("extra_monthly_cost", 0))
        savings = float(scenario.get("forced_savings", 0))

        net = income_total - fixed_total - debt_pay - extra - savings
        buffer_amount += net

        rows.append({
            "month": m,
            "income": income_total,
            "fixed": fixed_total,
            "debt": debt_pay,
            "extra": extra,
            "savings": savings,
            "net": net,
            "buffer": buffer_amount
        })

    return {
        "months": months,
        "final_buffer": buffer_amount,
        "min_buffer": min(r["buffer"] for r in rows) if rows else buffer_amount,
        "rows": rows
    }

@app.post("/api/simulate")
def simulate():
    finance = read_json(FINANCE_PATH, {"version": 1})
    scenario = request.get_json(force=True, silent=False) or {}
    result = simulate_baseline(finance, scenario)
    return jsonify(result)



# SOVFIN_STRATEGY_API_V1
# Strategy metadata + active params + per-strategy knobs + recommendations.
# Best-effort patch: appended near end of file. Idempotent.

try:
    from flask import jsonify, request, g
except Exception:
    pass

SOVFIN_STRATEGY_CATALOG = {
    "buffer_2000": {
        "id": "buffer_2000",
        "name": "Buffer-first (2.000/m)",
        "description": "Fokus på buffer: 2.000 kr pr. måned, simpelt og stabilt.",
        "how_it_works": [
            "Du prioriterer buffer før alt andet.",
            "Giver ro og mindsker panik-beslutninger.",
            "Hvis du underperformer: sænk beløbet midlertidigt i stedet for at opgive."
        ],
        "knobs": [
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":20000,"step":100,"default":2000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    },
    "buffer_4000": {
        "id": "buffer_4000",
        "name": "Buffer-first (4.000/m)",
        "description": "Hurtigere buffer, kræver mere disciplin.",
        "how_it_works": [
            "Aggressiv opsparing: 4.000 kr pr. måned.",
            "Når det holder: buffer vokser hurtigt.",
            "Når det ikke holder: justér beløbet ned, ikke hele strategien."
        ],
        "knobs": [
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":30000,"step":100,"default":4000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    },
    "cut10_save2000": {
        "id": "cut10_save2000",
        "name": "Cut 10% + 2.000 opsp.",
        "description": "Skær ca. 10% af faste udgifter og flyt 2.000 kr til buffer hver måned.",
        "how_it_works": [
            "Antager at du kan skære i forbrug/faste poster uden at ødelægge livet.",
            "Tvinger opsparing hver måned (buffer først).",
            "Bruger afvigelser til at foreslå justeringer."
        ],
        "knobs": [
            {"key":"cut_fixed_pct","label":"Cut faste udgifter (%)","type":"pct","min":0,"max":0.30,"step":0.01,"default":0.10},
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":20000,"step":100,"default":2000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    },
    "exit_month6": {
        "id": "exit_month6",
        "name": "Exit-fund (flyt m6, 35k)",
        "description": "Bygger flyttebuffer frem mod måned 6. Justér måned eller beløb efter realitet.",
        "how_it_works": [
            "Sammenholder fremdrift med 'move_month' og 'move_cost'.",
            "Når du halter: enten højere opsparing eller flyt datoen.",
            "Når du er foran: hold planen, undgå 'nu-fejrer-vi'-læk."
        ],
        "knobs": [
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":30000,"step":100,"default":3000},
            {"key":"move_month","label":"Flyt i måned nr.","type":"int","min":1,"max":60,"step":1,"default":6},
            {"key":"move_cost","label":"Forventet flytte-omkostning (kr)","type":"kr","min":0,"max":200000,"step":500,"default":35000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    },
    "income_boost_3k": {
        "id": "income_boost_3k",
        "name": "Income boost +3k",
        "description": "Planen antager +3.000 kr/m ekstra indkomst (sidejob, ekstra vagter, etc.).",
        "how_it_works": [
            "Hvis ekstra indkomst ikke materialiserer sig: skift strategi eller justér baseline.",
            "Hvis det virker: øg opsparing før livsstils-inflation tager det."
        ],
        "knobs": [
            {"key":"extra_income","label":"Forventet ekstra indkomst pr. måned (kr)","type":"kr","min":0,"max":50000,"step":100,"default":3000},
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":30000,"step":100,"default":2000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    },
    "austerity": {
        "id": "austerity",
        "name": "Austerity (cut 15% + 4k opsp.)",
        "description": "Stramning: større cut og højere opsparing. Effektivt, men ikke altid menneskeligt.",
        "how_it_works": [
            "Brug kortvarigt for at rette kurs.",
            "Hvis du fejler gentagne gange: det er ikke 'svaghed', det er dårlig parameter."
        ],
        "knobs": [
            {"key":"cut_fixed_pct","label":"Cut faste udgifter (%)","type":"pct","min":0,"max":0.40,"step":0.01,"default":0.15},
            {"key":"forced_savings","label":"Fast opsparing pr. måned (kr)","type":"kr","min":0,"max":40000,"step":100,"default":4000},
            {"key":"review_threshold","label":"Advar hvis afvigelse > (kr)","type":"kr","min":0,"max":50000,"step":500,"default":5000}
        ]
    }
}

def _sovfin_get_finance():
    try:
        return load_finance()
    except Exception:
        pass
    import json, os
    p = os.path.join(os.path.dirname(__file__), "data", "finance.json")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def _sovfin_save_finance(obj):
    try:
        return save_finance(obj)
    except Exception:
        pass
    import json, os
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    p = os.path.join(data_dir, "finance.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def _sovfin_get_active_strategy_id(finance):
    return finance.get("active_strategy_id") or finance.get("active_strategy") or None

def _sovfin_get_strategy_meta(sid):
    if not sid:
        return None
    return SOVFIN_STRATEGY_CATALOG.get(sid)

def _sovfin_get_effective_params(finance, sid):
    meta = _sovfin_get_strategy_meta(sid)
    if not meta:
        return {}
    defaults = {}
    for k in meta.get("knobs", []):
        if "key" in k:
            defaults[k["key"]] = k.get("default")
    stored = (finance.get("strategy_params") or {}).get(sid) or {}
    out = dict(defaults)
    out.update(stored)
    return out

def _sovfin_validate_params(meta, payload):
    knobs = meta.get("knobs", [])
    allowed = {k.get("key"): k for k in knobs if k.get("key")}
    out = {}
    for key, val in (payload or {}).items():
        if key not in allowed:
            continue
        spec = allowed[key]
        try:
            v = float(val)
        except Exception:
            raise ValueError(f"Ugyldig værdi for {key}")
        mn = spec.get("min")
        mx = spec.get("max")
        if mn is not None and v < float(mn): raise ValueError(f"{key} under min ({mn})")
        if mx is not None and v > float(mx): raise ValueError(f"{key} over max ({mx})")
        if spec.get("type") == "int":
            v = int(round(v))
        out[key] = v
    return out

def _sovfin_make_recommendations(finance, feedback, sid, params):
    rec = []
    if not feedback:
        return rec

    net_gap = feedback.get("net_gap")
    planned = feedback.get("planned_net")

    thr = params.get("review_threshold", 5000) if params else 5000
    try:
        thr = float(thr)
    except Exception:
        thr = 5000

    goals = finance.get("goals") or {}
    floor = goals.get("min_buffer_floor")
    if floor is not None and feedback.get("end_balance") is not None:
        try:
            if float(feedback["end_balance"]) < float(floor):
                rec.append({"level":"warn","title":"Under buffer floor","text":"Din slut-saldo er under din buffer floor. Prioritér buffer før ekstra forbrug næste måned."})
        except Exception:
            pass

    if sid in ("buffer_2000","buffer_4000"):
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Du halter efter planen","text":"Sænk midlertidigt 'fast opsparing' med 500–1.000 kr, så du kan holde strategien i live."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Du er foran planen","text":"Du outperformer planen. Overvej at hæve 'fast opsparing' med 500 kr i næste måned."})
            except Exception:
                pass
    elif sid in ("cut10_save2000","austerity"):
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Planen er for stram","text":"Du underperformer. Vælg én: sænk opsparing lidt, eller øg cut-procenten. Ikke begge på én gang."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Der er luft","text":"Du er over plan. Overvej at øge opsparing en smule, før du opgraderer dit forbrug."})
            except Exception:
                pass
    elif sid == "exit_month6":
        rec.append({"level":"info","title":"Exit-fund","text":"Hvis du halter: justér enten 'flyt måned' eller 'fast opsparing'. Målet er gennemførbarhed, ikke heroisme."})
    elif sid == "income_boost_3k":
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Indkomstløftet materialiserer sig ikke","text":"Hvis +indkomst ikke sker i praksis, så sænk forventningen (extra_income) eller skift strategi til buffer-first."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Ekstra indkomst virker","text":"Fang gevinsten: skru opsparing op, så pengene ikke forsvinder i 'nu kan vi jo'-forbrug."})
            except Exception:
                pass

    if planned is not None:
        try:
            if float(planned) < 0:
                rec.append({"level":"warn","title":"Planlagt underskud","text":"Din strategi/baseline forventer negativt net. Overvej at justere strategi eller baseline, ellers vinder matematikken."})
        except Exception:
            pass

    return rec

try:
    @app.get("/api/strategy/active")
    def api_strategy_active():
        finance = _sovfin_get_finance()
        sid = _sovfin_get_active_strategy_id(finance)
        meta = _sovfin_get_strategy_meta(sid) if sid else None
        params = _sovfin_get_effective_params(finance, sid) if sid else {}
        return jsonify({
            "ok": True,
            "active_strategy_id": sid,
            "strategy": meta,
            "params": params
        })
except Exception:
    pass

try:
    @app.post("/api/strategy/params")
    def api_strategy_params():
        finance = _sovfin_get_finance()
        sid = _sovfin_get_active_strategy_id(finance)
        if not sid:
            return jsonify({"ok": False, "error":"no active strategy"}), 400
        meta = _sovfin_get_strategy_meta(sid)
        if not meta:
            return jsonify({"ok": False, "error":"unknown strategy"}), 400
        payload = request.get_json(silent=True) or {}
        try:
            cleaned = _sovfin_validate_params(meta, payload)
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

        finance.setdefault("strategy_params", {})
        finance["strategy_params"].setdefault(sid, {})
        finance["strategy_params"][sid].update(cleaned)
        _sovfin_save_finance(finance)
        return jsonify({"ok": True, "active_strategy_id": sid, "params": finance["strategy_params"][sid]})
except Exception:
    pass

try:
    @app.before_request
    def _sovfin_before():
        g._sovfin_monthclose = (request.path == "/api/month/close")

    @app.after_request
    def _sovfin_after(resp):
        try:
            if getattr(g, "_sovfin_monthclose", False) and resp.is_json:
                data = resp.get_json(silent=True) or {}
                if data.get("ok") and "feedback" in data:
                    finance = _sovfin_get_finance()
                    sid = _sovfin_get_active_strategy_id(finance)
                    params = _sovfin_get_effective_params(finance, sid) if sid else {}
                    recs = _sovfin_make_recommendations(finance, data.get("feedback") or {}, sid, params)
                    data["recommendations"] = recs
                    data["strategy"] = _sovfin_get_strategy_meta(sid) if sid else None
                    data["params_used"] = params
                    resp.set_data(json.dumps(data, ensure_ascii=False))
                    resp.headers["Content-Type"] = "application/json"
        except Exception:
            pass
        return resp
except Exception:
    pass




# SOVFIN_STRATEGY_API_COMPAT_V1
# Flask-compat routes (works even if Flask < 2.0, i.e. no app.get/app.post)

import json as _json
from flask import jsonify as _jsonify, request as _request, g as _g

def _sovfin_finance_obj():
    try:
        return load_finance()
    except Exception:
        import os, json
        fp = os.path.join(os.path.dirname(__file__), "data", "finance.json")
        if os.path.exists(fp):
            with open(fp, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

def _sovfin_finance_save(obj):
    try:
        return save_finance(obj)
    except Exception:
        import os, json
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        os.makedirs(data_dir, exist_ok=True)
        fp = os.path.join(data_dir, "finance.json")
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)

def _sovfin_active_id(fin):
    return fin.get("active_strategy_id") or fin.get("active_strategy") or None

def _sovfin_catalog():
    return globals().get("SOVFIN_STRATEGY_CATALOG") or {}

def _sovfin_meta(sid):
    return _sovfin_catalog().get(sid) if sid else None

def _sovfin_effective_params(fin, sid):
    meta = _sovfin_meta(sid)
    if not meta: return {}
    defaults = {}
    for k in meta.get("knobs", []):
        if "key" in k: defaults[k["key"]] = k.get("default")
    stored = (fin.get("strategy_params") or {}).get(sid) or {}
    out = dict(defaults); out.update(stored); return out

def _sovfin_validate(meta, payload):
    knobs = meta.get("knobs", [])
    allowed = {k.get("key"): k for k in knobs if k.get("key")}
    out = {}
    for key, val in (payload or {}).items():
        if key not in allowed: 
            continue
        spec = allowed[key]
        try:
            v = float(val)
        except Exception:
            raise ValueError(f"Ugyldig værdi for {key}")
        mn = spec.get("min"); mx = spec.get("max")
        if mn is not None and v < float(mn): raise ValueError(f"{key} under min ({mn})")
        if mx is not None and v > float(mx): raise ValueError(f"{key} over max ({mx})")
        if spec.get("type") == "int":
            v = int(round(v))
        out[key] = v
    return out

def _sovfin_recs(fin, feedback, sid, params):
    rec = []
    if not feedback: return rec
    net_gap = feedback.get("net_gap")
    planned = feedback.get("planned_net")
    thr = params.get("review_threshold", 5000) if params else 5000
    try: thr = float(thr)
    except Exception: thr = 5000

    goals = fin.get("goals") or {}
    floor = goals.get("min_buffer_floor")
    if floor is not None and feedback.get("end_balance") is not None:
        try:
            if float(feedback["end_balance"]) < float(floor):
                rec.append({"level":"warn","title":"Under buffer floor","text":"Slut-saldo er under buffer floor. Buffer før alt andet næste måned."})
        except Exception:
            pass

    if sid in ("buffer_2000","buffer_4000"):
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Du halter efter planen","text":"Sænk midlertidigt fast opsparing 500–1.000 kr, så du kan holde strategien."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Du er foran planen","text":"Overvej at hæve fast opsparing 500 kr i næste måned."})
            except Exception:
                pass
    elif sid in ("cut10_save2000","austerity"):
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Planen er for stram","text":"Underperformance: vælg én justering: lavere opsparing ELLER højere cut. Ikke begge."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Der er luft","text":"Du er over plan. Overvej at øge opsparing før forbrug."})
            except Exception:
                pass
    elif sid == "exit_month6":
        rec.append({"level":"info","title":"Exit-fund","text":"Hvis du halter: justér flyt-måned eller opsparing. Målet er gennemførbarhed."})
    elif sid == "income_boost_3k":
        if net_gap is not None:
            try:
                if float(net_gap) < -thr:
                    rec.append({"level":"warn","title":"Indkomstløftet sker ikke","text":"Sænk extra_income eller skift strategi, hvis +indkomst ikke kommer i virkeligheden."})
                elif float(net_gap) > thr:
                    rec.append({"level":"good","title":"Ekstra indkomst virker","text":"Skru opsparing op, så gevinsten ikke forsvinder i livsstils-inflation."})
            except Exception:
                pass

    if planned is not None:
        try:
            if float(planned) < 0:
                rec.append({"level":"warn","title":"Planlagt underskud","text":"Strategien/baseline forventer negativt net. Justér strategi eller baseline."})
        except Exception:
            pass
    return rec

# Routes (compat)
# COMPAT_BLOCK_DISABLED try:
# COMPAT_BLOCK_DISABLED # DUPLICATE_DISABLED     @app.route("/api/strategy/active", methods=["GET"])
# COMPAT_BLOCK_DISABLED # DUPLICATE_DISABLED     def api_strategy_active_compat():
# COMPAT_BLOCK_DISABLED # BROKEN_DUPLICATE_BLOCK         fin = _sovfin_finance_obj()
# COMPAT_BLOCK_DISABLED # BROKEN_DUPLICATE_BLOCK         sid = _sovfin_active_id(fin)
# COMPAT_BLOCK_DISABLED # BROKEN_DUPLICATE_BLOCK         meta = _sovfin_meta(sid) if sid else None
# COMPAT_BLOCK_DISABLED # BROKEN_DUPLICATE_BLOCK         params = _sovfin_effective_params(fin, sid) if sid else {}
# COMPAT_BLOCK_DISABLED # BROKEN_DUPLICATE_BLOCK         return _jsonify({"ok": True, "active_strategy_id": sid, "strategy": meta, "params": params})
# COMPAT_BLOCK_DISABLED except Exception:
# COMPAT_BLOCK_DISABLED     pass

try:
    # Duplicate route disabled: /api/strategy/params is served by api_strategy_params() above.
    # @app.route("/api/strategy/params", methods=["POST"])
    def api_strategy_params_compat():
        fin = _sovfin_finance_obj()
        sid = _sovfin_active_id(fin)
        if not sid:
            return _jsonify({"ok": False, "error":"no active strategy"}), 400
        meta = _sovfin_meta(sid)
        if not meta:
            return _jsonify({"ok": False, "error":"unknown strategy"}), 400
        payload = _request.get_json(silent=True) or {}
        try:
            cleaned = _sovfin_validate(meta, payload)
        except Exception as e:
            return _jsonify({"ok": False, "error": str(e)}), 400
        fin.setdefault("strategy_params", {})
        fin["strategy_params"].setdefault(sid, {})
        fin["strategy_params"][sid].update(cleaned)
        _sovfin_finance_save(fin)
        return _jsonify({"ok": True, "active_strategy_id": sid, "params": fin["strategy_params"][sid]})
except Exception:
    pass

# Attach recommendations to monthClose JSON response (compat)
try:
    @app.before_request
    def _sovfin_before_compat():
        _g._sovfin_monthclose = (_request.path == "/api/month/close")

    @app.after_request
    def _sovfin_after_compat(resp):
        try:
            if getattr(_g, "_sovfin_monthclose", False) and resp.is_json:
                data = resp.get_json(silent=True) or {}
                if data.get("ok") and "feedback" in data:
                    fin = _sovfin_finance_obj()
                    sid = _sovfin_active_id(fin)
                    params = _sovfin_effective_params(fin, sid) if sid else {}
                    data["recommendations"] = _sovfin_recs(fin, data.get("feedback") or {}, sid, params)
                    data["strategy"] = _sovfin_meta(sid) if sid else None
                    data["params_used"] = params
                    resp.set_data(_json.dumps(data, ensure_ascii=False))
                    resp.headers["Content-Type"] = "application/json"
        except Exception:
            pass
        return resp
except Exception:
    pass


# =========================
# Sovereign Finance vNext: baseline + status + strategy state
# =========================

DEFAULT_STRATEGIES = [
  {"forced_savings":2000,"id":"buffer_2000","name":"Buffer-first (2.000/m)"},
  {"forced_savings":4000,"id":"buffer_4000","name":"Buffer-first (4.000/m)"},
  {"cut_fixed_pct":0.1,"forced_savings":2000,"id":"cut10_save2000","name":"Cut 10% + 2.000 opsp."},
  {"forced_savings":3000,"id":"exit_month6","move_cost":35000,"move_month":6,"name":"Exit-fund (flyt m6, 35k)"},
  {"extra_income":3000,"forced_savings":2000,"id":"income_boost_3k","name":"Income boost +3k"},
  {"cut_fixed_pct":0.15,"forced_savings":4000,"id":"austerity","name":"Austerity (cut 15% + 4k opsp.)"}
]

def _get_finance():
    return read_json(FINANCE_PATH, {"version": 1})

def _set_finance(obj):
    write_json(FINANCE_PATH, obj)

def _get_strategies():
    # If you later want strategies in a file, add it here. For now: embedded list.
    return DEFAULT_STRATEGIES

def _find_strategy(sid: str):
    for s in _get_strategies():
        if s.get("id") == sid:
            return s
    return None

def _get_active_strategy_id(finance):
    sid = finance.get("active_strategy_id")
    if sid and _find_strategy(str(sid)):
        return str(sid)
    # fallback: first strategy
    return str(_get_strategies()[0]["id"])

def _baseline_totals(finance):
    # Preferred: finance["baseline"] totals
    b = finance.get("baseline") or {}
    inc = b.get("income_monthly_total", None)
    fx  = b.get("fixed_monthly_total", None)

    if inc is None:
        inc = sum(float(x.get("monthly", 0) or 0) for x in finance.get("income", []))
    if fx is None:
        fx = sum(float(x.get("monthly", 0) or 0) for x in finance.get("fixed_expenses", []))
    return float(inc or 0), float(fx or 0)

# Duplicate route disabled: /api/strategies is served by strategies() above.
# @app.get("/api/strategies")
def api_strategies_vnext():
    return jsonify({"strategies": _get_strategies()})

# DUPLICATE_DISABLED @app.get("/api/strategy/active")
# DUPLICATE_DISABLED def api_strategy_active():
    finance = _get_finance()
    sid = _get_active_strategy_id(finance)
    return jsonify({"ok": True, "active_strategy_id": sid})

@app.post("/api/strategy/activate")
def api_strategy_activate():
    payload = request.get_json(force=True, silent=False) or {}
    sid = str(payload.get("id") or "").strip()
    if not sid:
        return jsonify({"ok": False, "error": "missing id"}), 400
    if not _find_strategy(sid):
        return jsonify({"ok": False, "error": "unknown strategy id"}), 400
    finance = _get_finance()
    finance["active_strategy_id"] = sid
    _set_finance(finance)
    return jsonify({"ok": True, "active_strategy_id": sid})

@app.get("/api/baseline")
def api_baseline_get():
    finance = _get_finance()
    inc, fx = _baseline_totals(finance)
    return jsonify({"ok": True, "income_monthly_total": inc, "fixed_monthly_total": fx})

@app.post("/api/baseline")
def api_baseline_set():
    payload = request.get_json(force=True, silent=False) or {}
    inc = float(payload.get("income_monthly_total", 0) or 0)
    fx  = float(payload.get("fixed_monthly_total", 0) or 0)

    finance = _get_finance()
    finance.setdefault("baseline", {})
    finance["baseline"]["income_monthly_total"] = inc
    finance["baseline"]["fixed_monthly_total"] = fx

    # Keep backwards-compatibility with your old structure:
    finance["income"] = [{"name": "Baseline (total)", "monthly": round(inc, 2)}]
    finance["fixed_expenses"] = [{"name": "Baseline (total)", "monthly": round(fx, 2)}]

    _set_finance(finance)
    return jsonify({"ok": True, "income_monthly_total": inc, "fixed_monthly_total": fx})

@app.post("/api/status")
def api_status():
    """
    Input:
      { "month":"YYYY-MM", "start_balance": 6000, "current_balance": 16000, "note": "..." }

    Output:
      baseline + strategy + deviation + recommendations
    """
    payload = request.get_json(force=True, silent=False) or {}
    month = str(payload.get("month") or "").strip()
    start_balance = float(payload.get("start_balance", 0) or 0)
    current_balance = float(payload.get("current_balance", 0) or 0)
    note = str(payload.get("note") or "").strip()

    finance = _get_finance()
    active_id = _get_active_strategy_id(finance)
    strat = _find_strategy(active_id) or {}

    income_total, fixed_total = _baseline_totals(finance)
    baseline_net = income_total - fixed_total

    forced_savings = float(strat.get("forced_savings", 0) or 0)
    cut_fixed_pct = float(strat.get("cut_fixed_pct", 0) or 0)
    extra_income  = float(strat.get("extra_income", 0) or 0)
    extra_cost    = float(strat.get("extra_monthly_cost", 0) or 0)

    # Apply strategy effects (simple v1)
    effective_income = income_total + extra_income
    effective_fixed  = fixed_total * (1.0 - cut_fixed_pct)
    effective_net    = effective_income - effective_fixed - extra_cost - forced_savings

    actual_change = current_balance - start_balance
    deviation = actual_change - effective_net  # v1: compare against full-month expectation (simple, explainable)

    # recommendations (v1 deterministic rules)
    rec = []

    if effective_income - effective_fixed < 0:
        rec.append({
            "title": "Planlagt underskud",
            "body": "Din baseline giver negativt net. Enten ned med faste udgifter eller op med indkomst, ellers vinder matematikken."
        })

    warn = float((finance.get("strategy_overrides") or {}).get("warn_if_deviation_gt", 5000) or 5000)
    if abs(deviation) > warn:
        direction = "ned" if deviation < 0 else "op"
        rec.append({
            "title": "Stor afvigelse",
            "body": f"Afvigelsen er {round(deviation,2)} kr. Overvej at justere 'fast opsparing' {direction} midlertidigt (ikke hele strategien)."
        })

    if deviation > 0 and effective_net >= 0:
        rec.append({
            "title": "Du er foran planen",
            "body": "Du outperformer planen. Overvej at hæve 'fast opsparing' med 500 kr næste måned, hvis det føles stabilt."
        })

    # Suggest strategy switch (v1)
    suggested = None
    if (effective_income - effective_fixed) < 0:
        # if baseline is negative, suggest austerity / cut
        suggested = "austerity"
    elif deviation > warn and forced_savings > 0 and deviation < 0:
        # if you keep missing because savings too aggressive
        suggested = "buffer_2000"

    # Log event (optional, cheap)
    events = read_json(EVENTS_PATH, {"version": 1, "events": []})
    events["events"].append({
        "type": "status",
        "ts": str(date.today()),
        "month": month,
        "start_balance": start_balance,
        "current_balance": current_balance,
        "actual_change": actual_change,
        "expected_net": effective_net,
        "deviation": deviation,
        "active_strategy_id": active_id,
        "note": note
    })
    write_json(EVENTS_PATH, events)

    return jsonify({
        "ok": True,
        "month": month,
        "active_strategy_id": active_id,
        "strategy": strat,
        "baseline": {
            "income_monthly_total": income_total,
            "fixed_monthly_total": fixed_total
        },
        "effective": {
            "income": effective_income,
            "fixed": effective_fixed,
            "forced_savings": forced_savings,
            "expected_net": effective_net
        },
        "actual": {
            "start_balance": start_balance,
            "current_balance": current_balance,
            "change": actual_change
        },
        "deviation": deviation,
        "warn_if_deviation_gt": warn,
        "suggested_strategy_id": suggested,
        "recommendations": rec
    })

# ---------- v0.2 scenario evaluate ----------
def _safe_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return default

def _safe_int(v, default=0):
    try:
        return int(v)
    except Exception:
        return default

def _build_purchase_strategy(payload):
    amount = _safe_float(payload.get("amount", 0))
    timing = str(payload.get("timing", "now") or "now").strip().lower()
    strategy = dict(payload.get("strategy") or {})

    if timing == "now":
        strategy["move_month"] = 1
    else:
        strategy["move_month"] = _safe_int(payload.get("move_month", 1), 1)

    strategy["move_cost"] = amount
    strategy.setdefault("forced_savings", 0)
    strategy.setdefault("extra_monthly_cost", 0)
    strategy.setdefault("cut_fixed_pct", 0)
    strategy.setdefault("extra_income", 0)
    return strategy

def _build_time_reduction_strategy(payload):
    strategy = dict(payload.get("strategy") or {})
    income_loss = _safe_float(payload.get("monthly_income_loss", 0))
    strategy["extra_income"] = _safe_float(strategy.get("extra_income", 0)) - income_loss
    strategy.setdefault("forced_savings", 0)
    strategy.setdefault("extra_monthly_cost", 0)
    strategy.setdefault("cut_fixed_pct", 0)
    strategy.setdefault("move_cost", 0)
    strategy.setdefault("move_month", 0)
    return strategy

def _build_vacation_strategy(payload):
    strategy = dict(payload.get("strategy") or {})
    cost = _safe_float(payload.get("amount", 0))
    month = _safe_int(payload.get("month", 1), 1)
    strategy["move_cost"] = cost
    strategy["move_month"] = month
    strategy.setdefault("forced_savings", 0)
    strategy.setdefault("extra_monthly_cost", 0)
    strategy.setdefault("cut_fixed_pct", 0)
    strategy.setdefault("extra_income", 0)
    return strategy

def _build_investment_strategy(payload):
    strategy = dict(payload.get("strategy") or {})
    monthly = _safe_float(payload.get("monthly_amount", 0))
    strategy["forced_savings"] = _safe_float(strategy.get("forced_savings", 0)) + monthly
    strategy.setdefault("extra_monthly_cost", 0)
    strategy.setdefault("cut_fixed_pct", 0)
    strategy.setdefault("extra_income", 0)
    strategy.setdefault("move_cost", 0)
    strategy.setdefault("move_month", 0)
    return strategy

def _normalize_strategy(payload):
    scenario_type = str(payload.get("type", "") or "").strip().lower()

    if scenario_type == "purchase":
        return _build_purchase_strategy(payload)
    if scenario_type == "time_reduction":
        return _build_time_reduction_strategy(payload)
    if scenario_type == "vacation":
        return _build_vacation_strategy(payload)
    if scenario_type == "investment":
        return _build_investment_strategy(payload)

    strategy = dict(payload.get("strategy") or {})
    strategy.setdefault("forced_savings", 0)
    strategy.setdefault("extra_monthly_cost", 0)
    strategy.setdefault("cut_fixed_pct", 0)
    strategy.setdefault("extra_income", 0)
    strategy.setdefault("move_cost", 0)
    strategy.setdefault("move_month", 0)
    return strategy

def _explain_scenario(finance, payload, result):
    assumptions = finance.get("assumptions", {}) or {}
    floor = _safe_float(
        assumptions.get("buffer_floor",
        assumptions.get("buffer_min",
        assumptions.get("buffer_target", 0))), 0
    )
    target = _safe_float(assumptions.get("buffer_target", floor), floor)

    final_buffer = _safe_float(result.get("final_buffer", 0))
    min_buffer = _safe_float(result.get("min_buffer", 0))
    rows = result.get("rows", []) or []

    first_below_floor = None
    if floor > 0:
        for row in rows:
            if _safe_float(row.get("buffer", 0)) < floor:
                first_below_floor = _safe_int(row.get("month", 0), 0)
                break

    reasons = []
    alternatives = []

    scenario_type = str(payload.get("type", "") or "").strip().lower()
    amount = _safe_float(payload.get("amount", 0))
    monthly_amount = _safe_float(payload.get("monthly_amount", 0))

    if floor > 0 and min_buffer < floor:
        reasons.append(f"Buffer falder under sikkerhedsgulv på {floor:.0f} kr.")
        if first_below_floor:
            reasons.append(f"Det sker første gang i måned {first_below_floor}.")
        alternatives.append("Vent og byg større buffer først.")
        if scenario_type == "purchase" and amount > 0:
            alternatives.append(f"Reducer købsrammen til under {max(0, amount * 0.6):.0f} kr.")

    if min_buffer < 0:
        reasons.append("Scenariet sender bufferen i minus.")
        alternatives.append("Undgå kontant gennemførsel i nuværende form.")

    if final_buffer < target and target > 0:
        reasons.append(f"Scenariet ender under ønsket buffermål på {target:.0f} kr.")

    if not reasons:
        reasons.append("Scenariet holder bufferen over sikkerhedsgulvet i hele perioden.")

    if min_buffer < 0:
        decision = "frarådes"
        risk = "høj"
    elif floor > 0 and min_buffer < floor:
        decision = "muligt med forbehold"
        risk = "moderat-høj"
    elif target > 0 and final_buffer < target:
        decision = "muligt med forbehold"
        risk = "moderat"
    else:
        decision = "anbefales"
        risk = "lav"

    if scenario_type == "investment" and monthly_amount > 0 and decision != "anbefales":
        alternatives.append(f"Sænk månedsbeløbet til ca. {max(0, monthly_amount * 0.5):.0f} kr.")
    elif scenario_type == "time_reduction":
        alternatives.append("Test scenariet i 3 måneder først.")
    elif scenario_type == "vacation" and amount > 0:
        alternatives.append(f"Sænk feriebudgettet til ca. {max(0, amount * 0.7):.0f} kr.")

    dedup_alts = []
    seen = set()
    for a in alternatives:
        if a not in seen:
            dedup_alts.append(a)
            seen.add(a)

    return {
        "decision": decision,
        "risk": risk,
        "reasons": reasons[:4],
        "alternatives": dedup_alts[:4]
    }

@app.post("/api/scenario/evaluate")
def scenario_evaluate():
    payload = request.get_json(force=True, silent=False) or {}
    finance = normalize_finance_for_strategy(read_json(FINANCE_PATH, {"version": 1}))
    shocks = dict(payload.get("shocks") or {})
    strategy = _normalize_strategy(payload)

    result = run_strategy(finance, strategy, shocks=shocks)
    explanation = _explain_scenario(finance, payload, result)

    rows = result.get("rows", []) or []
    preview = rows[:12]

    return jsonify({
        "ok": True,
        "scenario": {
            "type": payload.get("type"),
            "label": payload.get("label"),
        },
        "decision": explanation["decision"],
        "risk": explanation["risk"],
        "reasons": explanation["reasons"],
        "alternatives": explanation["alternatives"],
        "projection": {
            "final_buffer": result.get("final_buffer"),
            "min_buffer": result.get("min_buffer"),
            "months": len(rows),
            "rows_preview": preview
        }
    })

DECISIONS_PATH = os.path.join(DATA_DIR, "decisions.json")

def _read_decisions():
    return read_json(DECISIONS_PATH, {"version": 1, "decisions": []})

def _write_decisions(obj):
    write_json(DECISIONS_PATH, obj)

@app.get("/api/decisions")
def get_decisions():
    data = _read_decisions()
    return jsonify(data)

@app.post("/api/scenario/save")
def save_scenario():
    payload = request.get_json(force=True, silent=False) or {}

    # Hvis klienten sender et tidligere evaluate-resultat med, bruger vi det.
    # Ellers evaluerer vi scenariet her og gemmer resultatet.
    evaluation = payload.get("evaluation")
    scenario_payload = dict(payload.get("scenario") or payload)

    if not evaluation:
        finance = normalize_finance_for_strategy(read_json(FINANCE_PATH, {"version": 1}))
        shocks = dict(scenario_payload.get("shocks") or {})
        strategy = _normalize_strategy(scenario_payload)
        result = run_strategy(finance, strategy, shocks=shocks)
        explanation = _explain_scenario(finance, scenario_payload, result)

        evaluation = {
            "decision": explanation["decision"],
            "risk": explanation["risk"],
            "reasons": explanation["reasons"],
            "alternatives": explanation["alternatives"],
            "projection": {
                "final_buffer": result.get("final_buffer"),
                "min_buffer": result.get("min_buffer"),
                "months": len(result.get("rows", []) or []),
                "rows_preview": (result.get("rows", []) or [])[:12]
            }
        }

    store = _read_decisions()
    decisions = list(store.get("decisions") or [])

    entry = {
        "id": f"decision_{int(datetime.now().timestamp())}",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "label": scenario_payload.get("label"),
        "type": scenario_payload.get("type"),
        "scenario": scenario_payload,
        "evaluation": evaluation,
        "notes": payload.get("notes", "")
    }

    decisions.insert(0, entry)
    store["decisions"] = decisions[:100]  # hold lidt disciplin
    _write_decisions(store)

    return jsonify({
        "ok": True,
        "saved": True,
        "id": entry["id"],
        "count": len(store["decisions"])
    })
