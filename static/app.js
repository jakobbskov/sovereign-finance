// ===== hotfix: global nowAbs (absolute month index) =====
var nowAbs = (new Date().getFullYear() * 12 + new Date().getMonth());
try{ window.nowAbs = nowAbs; }catch(e){}
try{
  // One-time cache nuke when you visit with ?nosw=1
  if (String(location.search||"").includes("nosw=1") && ("serviceWorker" in navigator)){
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(()=>{});
    if (window.caches && caches.keys){
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(()=>{});
    }
  }
}catch(e){}
// ===== end hotfix =====

window.__sf_dash_v2 = true; // unified dashboard pipeline


  function isChecked(id){
    try{ const x = el(id); return !!(x && x.checked); }catch(e){ return false; }
  }

function getIncomeAlreadyReceived(){
  try{
    // Prøv kendte ids først (hvis du senere giver den et fast id)
  const incomeAlreadyReceived = !!(document.getElementById("incomeReceived") && document.getElementById("incomeReceived").checked);
    const ids = ["incomeAlreadyReceived","incomeReceived","income_received","chkIncomeReceived","sfIncomeReceived"];
    for (const id of ids){
      const x = document.getElementById(id);
      if (x && x.type === "checkbox") return !!x.checked;
    }

const legacyDetails = document.createElement("details");
legacyDetails.open = false;
const legacySummary = document.createElement("summary");
legacySummary.textContent = "Legacy / diagnose (midlertidig)";
const legacyNote = document.createElement("div");
legacyNote.className="muted";
legacyNote.textContent="Denne sektion findes kun til sammenligning med gammel logik. Brug check-in wizarden.";
legacyDetails.appendChild(legacyNote);

legacyDetails.appendChild(legacySummary);
container.appendChild(legacyDetails);
container = legacyDetails;

    // Fallback: find en checkbox der står i samme område som "Legacy check-in (diagnose)" / "Indkomst allerede"
    // (Vi gider ikke parse DOM poetisk. Vi tager den simple: første checkbox på siden.)
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb) return !!cb.checked;
  }catch(e){}
  // Default: indkomst er typisk modtaget dag 1, og din model bygger på det
  return true;
}
/* Sovereign Finance - static/app.js (vNext)
   Baseline + strategy + status check-in + month close.
   Fixes:
   - placeholder "Vælg strategi (6)" bug
   - active strategy card updates without refresh
*/

const el = (id) => document.getElementById(id);

function dbg(msg){
  try{
    const debugCard = document.getElementById("debugCard");
    const d = document.getElementById("debug");
    if (debugCard) debugCard.style.display = "block";
    if (d) d.textContent = String(msg ?? "");
  }catch(e){}
  try{ console.log(msg); }catch(e){}
}

/* GLOBAL_ERROR_HOOK */
(function(){
  window.addEventListener("error", function(ev){
    const msg = "JS error: " + (ev && ev.message ? ev.message : String(ev));
    const src = (ev && ev.filename) ? ("\n" + ev.filename + ":" + ev.lineno + ":" + ev.colno) : "";
    dbg(msg + src);
  });
  window.addEventListener("unhandledrejection", function(ev){
    const reason = (ev && ev.reason) ? (ev.reason.stack || ev.reason.message || String(ev.reason)) : String(ev);
    dbg("Unhandled promise: " + reason);
  });
})();

const api = async (path, opts={}) => {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const txt = await r.text();

  if (!r.ok) {
    const msg = "HTTP " + r.status + " on " + path + "\n" + txt.slice(0, 800);
    dbg(msg);
    throw new Error(msg);
  }
  if (!ct.includes("application/json")) {
    const msg = "Non-JSON on " + path + " (ct=" + ct + ")\n" + txt.slice(0, 800);
    dbg(msg);
    throw new Error(msg);
  }
  return JSON.parse(txt);
};

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
function fmt(n){
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("da-DK", { maximumFractionDigits: 2 });
}


function getVarKey(month){ return "sf_var_"+String(month||""); }

function loadVarEstimateForMonth(month){
  try{
    const v = localStorage.getItem(getVarKey(month));
    return (v===null || v==="") ? 0 : Number(v);
  }catch(e){ return 0; }
}

function saveVarEstimateForMonth(month, value){
  try{ localStorage.setItem(getVarKey(month), String(Number(value)||0)); }catch(e){}
}


let STRATEGIES = [];
let ACTIVE_ID = null;

function renderStrategyCard(strategy){
  const panel = el("strategyPanel");
  if (!panel) return;
  if (!strategy){
    panel.innerHTML = "<div class='small'>Ingen aktiv strategi.</div>";
    return;
  }
  
      let html = "";
  html += "<div class='small'><b>Aktiv:</b> " + esc(strategy.id || "") + "</div>";
  html += "<div style='margin-top:6px'><b>" + esc(strategy.name || strategy.id) + "</b></div>";
  html += "<div class='small' style='margin-top:6px'>" + esc(strategy.desc || "") + "</div>";

  const bullets = [];
  if (strategy.forced_savings) bullets.push("Fast opsparing: " + fmt(strategy.forced_savings) + " kr/m");
  if (strategy.cut_fixed_pct) bullets.push("Cut faste udgifter: " + fmt(strategy.cut_fixed_pct*100) + "%");
  if (strategy.extra_income) bullets.push("Ekstra indkomst: " + fmt(strategy.extra_income) + " kr/m");
  if (bullets.length){
    html += "<ul style='margin-top:10px'>";
    bullets.forEach(b => html += "<li>" + esc(b) + "</li>");
    html += "</ul>";
  }
  panel.innerHTML = html;
}

function findStrategy(id){
  return STRATEGIES.find(s => String(s.id) === String(id)) || null;
}

/* ---------- Baseline ---------- */
async function loadBaseline(){
  const st = el("baselineStatus");
  try{
    const b = await api("/api/baseline");
    if (el("baselineIncome")) el("baselineIncome").value = Number(b.income_monthly_total || 0);
    if (el("baselineFixed")) el("baselineFixed").value = Number(b.fixed_monthly_total || 0);
    if (st) st.textContent = "Baseline indlæst.";
  }catch(e){
    if (st) st.textContent = "Kunne ikke indlæse baseline.";
  }
}
async function saveBaseline(){
  const st = el("baselineStatus");
  const inc = Number(el("baselineIncome")?.value || 0);
  const fx  = Number(el("baselineFixed")?.value || 0);
  const out = await api("/api/baseline", { method:"POST", body: JSON.stringify({ income_monthly_total: inc, fixed_monthly_total: fx }) });
  if (st) st.textContent = "Gemt: indkomst " + fmt(out.income_monthly_total) + " / faste " + fmt(out.fixed_monthly_total);
}

/* ---------- Strategies dropdown + active sync ---------- */
async function loadStrategies(){
  const sel = el("strategySelect");
  if (!sel) { dbg("Missing #strategySelect"); return; }

  sel.innerHTML = "";

  // Placeholder that cannot be selected (fixes the Android "Vælg strategi (6)" nonsense)
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Vælg strategi";
  ph.disabled = true;
  ph.hidden = true;
  ph.selected = true;
  sel.appendChild(ph);

  const data = await api("/api/strategies");
  STRATEGIES = (data && Array.isArray(data.strategies)) ? data.strategies : [];

  STRATEGIES.forEach(s => {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = (s.name ? `${s.name} (${s.id})` : String(s.id));
    sel.appendChild(opt);
  });
}

async function loadActive(){
    const info = await api("/api/strategy/active");
    ACTIVE_ID = info.active_strategy_id || null;

    // Update small line
    const as = el("activeStrategy");
    if (as) as.textContent = ACTIVE_ID ? ("Aktiv: " + ACTIVE_ID) : "Aktiv: (ingen)";

    // Render card using backend truth: meta + params
    const meta = info.strategy || findStrategy(ACTIVE_ID) || (ACTIVE_ID ? { id: ACTIVE_ID, name: ACTIVE_ID } : null);
    const params = info.params || {};
    renderStrategyCard(meta, params);

    // Sync dropdown to active (so placeholder isn't shown)
    const sel = el("strategySelect");
    if (sel){
      if (ACTIVE_ID) sel.value = String(ACTIVE_ID);
      else sel.value = "";
    }

    // Prefill param inputs from active params (not from random overrides)
    if (el("forcedSavings") && params.forced_savings !== undefined) el("forcedSavings").value = Number(params.forced_savings || 0);
    if (el("warnDeviation") && params.review_threshold !== undefined) el("warnDeviation").value = Number(params.review_threshold || 5000);
}

async function activateSelectedStrategy(){
  const sel = el("strategySelect");
  const sid = String(sel?.value || "");
  if (!sid) return;

  await api("/api/strategy/activate", { method:"POST", body: JSON.stringify({ id: sid }) });

  // Now sync UI immediately (no refresh required)
  await loadActive();
}

/* ---------- Strategy params (overrides) ---------- */
async function saveStrategyParams(){
    const forced = Number(el("forcedSavings")?.value || 0);
    const warn   = Number(el("warnDeviation")?.value || 5000);

    if (!ACTIVE_ID){
      const st = el("strategyParamsStatus");
      if (st) st.textContent = "Ingen aktiv strategi.";
      return;
    }

    const payload = {};
    if (!Number.isNaN(forced) && forced >= 0) payload.forced_savings = forced;
    if (!Number.isNaN(warn) && warn >= 0) payload.review_threshold = warn;

    await api("/api/strategy/params", { method:"POST", body: JSON.stringify(payload) });

    const st = el("strategyParamsStatus");
    if (st) st.textContent = "Gemt.";

    // reload to reflect backend truth immediately
    await loadActive();
  }

/* --- STATUS + MONTH CLOSE --- */

function getValNum(id, fallback=0){
  const v = Number(el(id)?.value ?? fallback);
  return Number.isFinite(v) ? v : fallback;
}
function getValStr(id, fallback=""){
  const v = String(el(id)?.value ?? fallback);
  return v;
}


function renderStatusResult(res, opts={}){
  const fb = el("feedback");
  if (!fb) return;

  const headline = opts.headline || "Legacy feedback";
  const append = !!opts.append;

  try{
    const a   = res?.actual || {};
    const eff = res?.effective || {};

    const startBal = Number(a.start_balance || 0);
    const curBal   = Number(a.current_balance || 0);

    const income = Number(eff.income || 0);
    const fixed  = Number(eff.fixed || 0);
    const forced = Number(eff.forced_savings || 0);

    // Variable estimate (fra input hvis findes)
      let varEst = 0;
      const varInput = el("varMonthly");
      if (varInput && varInput.value !== ""){
        const n = Number(String(varInput.value).replace(",", "."));
        if (!Number.isNaN(n)) varEst = n;
      }

      const now = new Date();
      const day = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const progress = daysInMonth > 0 ? Math.max(0, Math.min(1, day / daysInMonth)) : 0;

      // Checkbox: checked = indkomst allerede modtaget (startsaldo er EFTER indkomst)
      const cb = el("incomeReceived");
      const incomeAlreadyReceived = !!(cb && cb.checked);

      // Heuristik: faste udgifter bliver typisk trukket tidligt (ca. første 5 dage)
      const fixedPaidFrac = Math.max(0, Math.min(1, day / 5.0));
      const fixedSoFar    = fixed  * fixedPaidFrac;
      const savingsSoFar  = forced * progress;
      const variableSoFar = varEst * progress;

      // Forventet månedslut (baseline):
      // - hvis start er EFTER indkomst: start - (fast + opsparing + variabel)
      // - ellers: start + indkomst - (fast + opsparing + variabel)
      const expectedEnd = (incomeAlreadyReceived ? startBal : (startBal + income)) - fixed - forced - varEst;

      // Til rådighed (strukturel): månedens “netto” fra indkomst (uafhængigt af start-saldo)
      const availableStructural = income - fixed - forced - varEst;

      // Til rådighed denne måned (cashflow): hvad er tilbage af “planen” fra i dag og frem?
      const remainingFixed   = Math.max(0, fixed  - fixedSoFar);
      const remainingSavings = Math.max(0, forced - savingsSoFar);
      const remainingVar     = Math.max(0, varEst - variableSoFar);
      const availableCashflow = curBal - remainingFixed - remainingSavings - remainingVar;

      const expectedNowCashflow = (incomeAlreadyReceived ? startBal : (startBal + income))
        - fixedSoFar
        - savingsSoFar
        - variableSoFar;


      // Afvigelse nu: cashflow-tilrådighed (positiv = du ligger bedre end planen; negativ = du er foran i forbrug)
      const deviationNow = curBal - expectedNowCashflow;

      const warnNow = Number(res.warn_if_deviation_gt || 5000);

let html = "";
    html += "<div class='small'><b>" + esc(headline) + "</b></div>";
    html += "<div class='small'>Start: " + fmt(startBal) + " / Nu: " + fmt(curBal) + "</div>";
      html += "<div class='small'>Til rådighed (strukturel): <b>" + fmt(availableStructural) + "</b></div>";
      html += "<div class='small'>Til rådighed denne måned (cashflow): <b>" + fmt(availableCashflow) + "</b></div>";

    // [DEPRECATED linear expectedNow]
// html += "<div class='small'>Forventet saldo nu (konto): " + fmt(expectedNow) + "</div>";
    
      html += "<div class='small'><b>Forventet saldo nu (cashflow):</b> " + fmt(expectedNowCashflow) + "</div>";
      html += "<div class='small'>Forventet månedslut: " + fmt(expectedEnd) + "</div>";
    html += "<div class='small'><b>Afvigelse nu:</b> " + fmt(deviationNow) + " (advar hvis > " + fmt(warnNow) + ")</div>";

    if (Math.abs(deviationNow) > warnNow){
      html += "<div class='card' style='margin-top:10px'><b>Afvigelse</b><div class='small'>Du afviger fra planen lige nu.</div></div>";
    }

    fb.innerHTML = append ? fb.innerHTML + html : html;

  }catch(e){
    fb.innerHTML = "<div class='small'><b>Fejl i rendering</b></div><pre>" + esc(String(e)) + "</pre>";
  }
}



async function doStatus({silent=false, headline="Legacy feedback"} = {}){
  const month = getValStr("month","");
  const startBal = getValNum("startBalance", 0);
  const curBal = getValNum("currentBalance", 0);
  const note = getValStr("notes","");

  if (!month){
    if (!silent) dbg("Manglende måned (YYYY-MM).");
    return;
  }

  const res = await api("/api/status", {
    method: "POST",
    body: JSON.stringify({ month, start_balance: startBal, current_balance: curBal, note })
  });

  renderStatusResult(res, {headline});
}

function saveMonthStart(){
  const month = getValStr("month","");
  const startBal = getValNum("startBalance", 0);
  if (!month) { dbg("Manglende måned (YYYY-MM)."); return; }

  try{
    localStorage.setItem("sf_monthstart_"+month, String(startBal));
  }catch(e){}

  const fb = el("feedback");
  if (fb) fb.innerHTML = "<div class='small'><b>Månedstart gemt</b></div><div class='small'>"+esc(month)+": "+fmt(startBal)+" kr</div>";
}


function loadOneOffForMonth(){
  try{
    const m = getValStr("month","");
    if (!m) return;
    const v = localStorage.getItem("sf_oneoff_"+m);
    if (v !== null && v !== undefined && v !== ""){
      const n = Number(v);
      if (!Number.isNaN(n) && el("oneOff")) el("oneOff").value = String(Math.round(n));
    }
  }catch(e){}
}


async function doMonthClose(){
  const month = getValStr("month","");
  const endBal = getValNum("endBalance", 0);
  const note = getValStr("notes","");

  if (!month){
    dbg("Manglende måned (YYYY-MM).");
    return;
  }

  
    try{ localStorage.setItem("sf_oneoff_"+month, String(oneOff)); }catch(e){}
const payload = {
    month,
    end_balance: endBal,
    notes: note,
    overrides: { categories: {}, one_off: oneOff }
  };

  const res = await api("/api/month/close", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  // Render månedsluk som separat blok
  const fb = el("feedback");
  if (!fb) return;

  let html = "";
  html += "<div class='small'><b>Månedsluk gemt</b></div>";
  if (res.feedback){
    html += "<div class='small'>Måned: " + esc(res.feedback.month) + "</div>";
    html += "<div class='small'>Start: " + fmt(res.feedback.start_balance) + " / Slut: " + fmt(res.feedback.end_balance) + "</div>";
    html += "<div class='small'>Delta: " + fmt(res.feedback.delta) + "</div>";
    html += "<div class='small'>Planlagt net: " + fmt(res.feedback.planned_net) + "</div>";
    html += "<div class='small'>Net gap: " + fmt(res.feedback.net_gap) + "</div>";
  }

  if (res.recommendations && res.recommendations.length){
    html += "<div style='margin-top:10px'><b>Anbefalinger</b></div>";
    res.recommendations.forEach(r => {
      html += "<div class='card' style='margin:10px 0'><b>" + esc(r.title || "Anbefaling") + "</b><div class='small' style='margin-top:6px'>" + esc(r.body || "") + "</div></div>";
    });
  } else {
    html += "<div class='small' style='margin-top:10px;opacity:.7'>Ingen anbefalinger ved månedsluk.</div>";
  }

  fb.innerHTML = html;
}

/* --- Live feedback while typing (debounced) --- */
let _sf_liveTimer = null;
function wireLiveStatus(){
  const cur = el("currentBalance");
  if (!cur) return;

  cur.addEventListener("input", () => {
    try{ if (_sf_liveTimer) clearTimeout(_sf_liveTimer); }catch(e){}
    _sf_liveTimer = setTimeout(() => {
      doStatus({silent:true, headline:"Live status"}).catch(e => dbg(e.message || String(e)));
    }, 450);
  });
}


function saveVarEstimate(){
  const month = (typeof getValStr === "function") ? getValStr("month","") : (document.getElementById("month")?.value || "");
  const v = (typeof getValNum === "function") ? getValNum("varMonthly", 0) : Number(document.getElementById("varMonthly")?.value || 0);
  if (!month){ try{ dbg("Manglende måned (YYYY-MM)."); }catch(e){} return; }
  saveVarEstimateForMonth(month, v);
  const st = document.getElementById("varStatus");
  if (st) st.textContent = "Gemt for " + month + ": " + (Number(v)||0).toLocaleString("da-DK") + " kr";
}


async function init(){
  

  // sf_var_month_listener
  el("month")?.addEventListener("change", () => {
    try{
      const m = (typeof getValStr === "function") ? getValStr("month","") : (el("month")?.value || "");
      const v = loadVarEstimateForMonth(m);
      if (el("varMonthly")) el("varMonthly").value = Number(v||0);
      const st = el("varStatus"); if (st) st.textContent = v ? ("Skøn for " + m + " indlæst.") : "";
    }catch(e){}
  });

dbg("Init OK");


  
  try{
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb && !cb.id) cb.id = "sfIncomeReceived";
  }catch(e){}
wireLiveStatus();
  // wiring
  el("btnSaveBaseline")?.addEventListener("click", () => saveBaseline().catch(e=>dbg(e.message||String(e))));
  el("btnSelectStrategy")?.addEventListener("click", () => activateSelectedStrategy().catch(e=>dbg(e.message||String(e))));
  el("btnSaveStrategyParams")?.addEventListener("click", () => saveStrategyParams().catch(e=>dbg(e.message||String(e))));
  el("btnMonthStart")?.addEventListener("click", () => {
  try {
    saveMonthStart();
  } catch(e) {
    dbg(e && e.message ? e.message : String(e));
  }
});
  el("btnStatus")?.addEventListener("click", async (ev) => { try{ev.preventDefault();}catch(e){} try{ const fb = el("feedback"); if (fb) fb.innerHTML = "<div class=\"small\">CLICK: Giv status</div>"; }catch(e){} try{ await doStatus(); }catch(e){ dbg(e && e.message ? e.message : String(e)); } });
  el("btnMonthClose")?.addEventListener("click", (ev) => { try{ev.preventDefault();
  el("btnSaveVar")?.addEventListener("click", () => saveVarEstimate());
}catch(e){} doMonthClose().catch(e=>dbg(e.message||String(e))); });

  // optional: preview card when dropdown changes (doesn't change active on server)
  el("strategySelect")?.addEventListener("change", () => {
    const sid = String(el("strategySelect")?.value || "");
    if (sid) renderStrategyCard(findStrategy(sid) || { id: sid, name: sid }, {});
  });

  await loadStrategies();
  await loadActive();
  await loadBaseline();

  // Fill strategy params inputs from finance overrides (if any)
  try{
    const finance = await api("/api/finance");
    const ov = finance.strategy_overrides || {};
    if (el("forcedSavings")) el("forcedSavings").value = Number(ov.forced_savings ?? 0);
    if (el("warnDeviation")) el("warnDeviation").value = Number(ov.warn_if_deviation_gt ?? 5000);
  }catch(e){}
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(e => dbg(e.message || String(e)));
});

/* ===== v0.2 UI glue: Dashboard + Wizard shell (non-destructive) ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function show(id, on){
    const el = $(id);
    if (el) el.style.display = on ? "" : "none";
  }
  function overlay(on){
    const el = $("wizardOverlay");
    if (el) el.style.display = on ? "block" : "none";
  }

  // Advanced toggle
  
function setAdvancedVisible(on){
  try { localStorage.setItem("sf_show_adv", on ? "1" : "0"); } catch(e){}
  document.querySelectorAll(".adv").forEach(el => {
    el.style.display = on ? "" : "none";
  });
  const btn = $("btnToggleAdvanced");
  if (btn) btn.textContent = on ? "Skjul avanceret" : "Vis avanceret";
}

function getAdvancedVisible(){
  try { return localStorage.getItem("sf_show_adv") === "1"; } catch(e) { return false; }
}

const btnAdv = $("btnToggleAdvanced");
  if (btnAdv){
    
btnAdv.addEventListener("click", () => {
  const adv = document.querySelectorAll(".adv");
  const isHidden = adv.length ? adv[0].style.display === "none" : false;
  adv.forEach(x => x.style.display = isHidden ? "" : "none");
  btnAdv.textContent = isHidden ? "Skjul avanceret" : "Vis avanceret";
});
}

  // Wizard open/close
  const btnW = $("btnWizard");
  if (btnW){
    btnW.addEventListener("click", () => {
      overlay(true);
      window.__sf_wiz_step = 1;
      renderWizStep();
    });
  }

  const btnWC = $("btnWizardClose");
  if (btnWC) btnWC.addEventListener("click", () => overlay(false));

  function setStep(n){
    window.__sf_wiz_step = n;
    renderWizStep();
  }

  function renderWizStep(){
    const n = Number(window.__sf_wiz_step || 1);
    [1,2,3,4,5].forEach(k => show("wizStep"+k, k===n));
    const lab = $("wizStepLabel");
    if (lab) lab.textContent = "Trin " + n + " af 5";
    const next = $("btnWizNext");
    if (next) next.textContent = (n===5) ? "Gem check-in" : "Næste";
    const back = $("btnWizBack");
    if (back) back.disabled = (n===1);
  }

  const btnBack = $("btnWizBack");
  if (btnBack) btnBack.addEventListener("click", () => setStep(Math.max(1, Number(window.__sf_wiz_step||1)-1)));

  const btnNext = $("btnWizNext");
  if (btnNext){
    btnNext.addEventListener("click", async () => {
      const n = Number(window.__sf_wiz_step || 1);
      if (n < 5){
        setStep(n+1);
        return;
      }
      const st = $("wizStatus");
      if (st) st.textContent = "Gemmer… (wire kommer næste trin)";
      setTimeout(()=>{ if (st) st.textContent = "—"; overlay(false); }, 700);
    });
  }

  // initial
  renderWizStep();
})();

/* ===== v0.2 wiring: Dashboard + Wizard -> backend model (/api/finance + /api/event) ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  const fmtKr = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  };

  async function apiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try{ j = t ? JSON.parse(t) : {}; }catch(e){ j = { _raw: t }; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  async function getFinance(){
    return await apiJson("/api/finance");
  }
  async function setFinance(obj){
    return await apiJson("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj)
    });
  }
  async function addEvent(ev){
    return await apiJson("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev)
    });
  }

  function sumMonthly(arr){
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((a,x)=> a + Number(x && x.monthly || 0), 0);
  }

  function computeDashboard(fin){
    // Vi laver en meget simpel (men forklarbar) “nu”-model:
    // available_now = current_balance - reserved_now
    // expected_end = current_balance + remaining_income - remaining_fixed - remaining_debt - remaining_forced_savings - remaining_var_est
    // deviation = current_balance - expected_balance_now (hvis vi kan beregne det)
    //
    // OBS: Vi gætter MINIMALT. Hvis felter ikke findes, viser vi "—" eller 0.

    const baselineIncome = Number(fin?.baseline?.income_monthly ?? fin?.baseline_income ?? 0);
    const baselineFixed  = Number(fin?.baseline?.fixed_monthly  ?? fin?.baseline_fixed  ?? 0);

    const incomeTotal = baselineIncome || sumMonthly(fin?.income);
    const fixedTotal  = baselineFixed  || sumMonthly(fin?.fixed_expenses);

    const forcedSavings = Number(fin?.strategy_overrides?.forced_savings ?? fin?.forced_savings ?? 0);
    const varEst = Number(fin?.var_monthly ?? fin?.variable_monthly ?? 0);

    const currentBalance = Number(fin?.checkin?.balance_now ?? fin?.current_balance ?? 0);
    const incomeState = String(fin?.checkin?.income_state ?? "after"); // after/before
    const reservedNow = Number(fin?.checkin?.reserved_now ?? 0);

    // Debt payments: hvis der findes debts[].payment så summer vi dem (enkelt)
    let debtPay = 0;
    if (Array.isArray(fin?.debts)){
      for (const d of fin.debts){
        debtPay += Number(d?.payment ?? 0);
      }
    }

    // Remaining income: hvis incomeState=before antager vi “løn mangler” => remaining_income = incomeTotal
    const remainingIncome = (incomeState === "before") ? incomeTotal : 0;

    // Expected end: super simpel: current + remainingIncome - (fixed + debt + savings + var)
    const expectedEnd = currentBalance + remainingIncome - (fixedTotal + debtPay + forcedSavings + varEst);

    // Available now: current - reservedNow
    const availableNow = currentBalance - reservedNow;

    // Deviation: hvis vi har expected_now gemt, ellers "—"
    const expectedNow = (fin?.checkin && isFinite(Number(fin.checkin.expected_now))) ? Number(fin.checkin.expected_now) : null;
    const deviation = (expectedNow === null) ? null : (currentBalance - expectedNow);

    return { availableNow, expectedEnd, deviation, meta: { incomeTotal, fixedTotal, debtPay, forcedSavings, varEst, incomeState } };
  }

  async function renderDashboard(){ return; }

async function wireWizardSave(){
    const btn = $("btnWizNext");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const step = Number(window.__sf_wiz_step || 1);
      if (step !== 5) return; // kun på sidste step

      const st = $("wizStatus");
      try{
        if (st) st.textContent = "Gemmer…";

        const fin = await getFinance();

        const balanceNow = Number($("wizBalance")?.value ?? 0);
        const incomeState = String($("wizIncomeState")?.value ?? "after");
        const surpriseAmount = Number($("wizSurpriseAmount")?.value ?? 0);
        const surpriseLabel = String($("wizSurpriseLabel")?.value ?? "").trim();
        const extraSave = Number($("wizExtraSave")?.value ?? 0);

        const today = new Date().toISOString().slice(0,10);

        fin.checkin = fin.checkin || {};
        fin.checkin.ts = today;
        fin.checkin.balance_now = balanceNow;
        fin.checkin.income_state = incomeState;

        // reserved_now: vi lægger extraSave oveni eksisterende reservation (hvis den findes)
        const prevReserved = Number(fin.checkin.reserved_now ?? 0);
        fin.checkin.reserved_now = Math.max(0, prevReserved + (isFinite(extraSave) ? extraSave : 0));

        await setFinance(fin);

        // Log event(s)
        await addEvent({ type: "checkin", ts: today, balance_now: balanceNow, income_state: incomeState });

        if (isFinite(surpriseAmount) && Math.abs(surpriseAmount) > 0){
          await addEvent({ type: "surprise", ts: today, amount: surpriseAmount, label: surpriseLabel || "uventet" });
        }
        if (isFinite(extraSave) && Math.abs(extraSave) > 0){
          await addEvent({ type: "extra-save", ts: today, amount: extraSave });
        }

        // Update summary label (nice)
        if ($("wizSummary")){
          $("wizSummary").textContent = "Gemt: saldo " + fmtKr(balanceNow) + ", løn " + (incomeState==="before"?"ikke modtaget":"modtaget") + ".";
        }

        // close + refresh dash
        const ov = $("wizardOverlay");
        if (ov) ov.style.display = "none";
        await renderDashboard();

        if (st) st.textContent = "Gemt ✅";
        setTimeout(()=>{ if (st) st.textContent = "—"; }, 1200);
      }catch(e){
        if (st) st.textContent = "Fejl: " + (e?.message || String(e));
      }
    }, { capture: true });
  }

  // Wizard summary live-update når man når trin 5
  function wireWizardSummary(){
    const btnNext = $("btnWizNext");
    if (!btnNext) return;
    btnNext.addEventListener("click", async () => {
      const step = Number(window.__sf_wiz_step || 1);
      if (step !== 4) return; // når vi går fra 4 -> 5
      const b = Number($("wizBalance")?.value ?? 0);
      const s = String($("wizIncomeState")?.value ?? "after");
      const u = Number($("wizSurpriseAmount")?.value ?? 0);
      const ul = String($("wizSurpriseLabel")?.value ?? "").trim();
      const ex = Number($("wizExtraSave")?.value ?? 0);

      const parts = [];
      parts.push("Saldo: " + fmtKr(b));
      parts.push("Løn: " + (s==="before" ? "ikke modtaget" : "modtaget"));
      if (isFinite(u) && Math.abs(u)>0) parts.push("Uventet: " + fmtKr(u) + (ul?(" ("+ul+")"):""));
      if (isFinite(ex) && Math.abs(ex)>0) parts.push("Ekstra opsparing: " + fmtKr(ex));

      const sum = $("wizSummary");
      if (sum) sum.textContent = parts.join(" · ");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // render dash asap
    
    wireWizardSave();
    wireWizardSummary();
  });
})();

/* ===== v0.2 wiring (Jakob JSON): Dashboard + Wizard -> /api/finance + /api/event ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  const fmtKr = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  };

  async function apiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try{ j = t ? JSON.parse(t) : {}; }catch(e){ j = { _raw: t }; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  const getFinance = () => apiJson("/api/finance");
  const setFinance = (obj) => apiJson("/api/finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  });
  const addEvent = (ev) => apiJson("/api/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ev)
  });

  function debtMonthlyTotal(fin){
    // Din model har every_months. Vi laver forventet månedligt gennemsnit:
    // payment / every_months
    let total = 0;
    for (const d of (fin?.debts || [])){
      const pay = Number(d?.payment ?? 0);
      const every = Math.max(1, Number(d?.every_months ?? 1));
      total += pay / every;
    }
    return total;
  }

  function getVarMonthlyEstimate(fin){
    // Vi læser month_log overrides.categories og summer som “variabelt”
    // (groceries, fuel, takeaway osv.) for seneste måned hvis muligt.
    const log = Array.isArray(fin?.month_log) ? fin.month_log : [];
    if (!log.length) return 0;

    const last = log[log.length - 1];
    const cats = last?.overrides?.categories || {};
    let sum = 0;
    for (const k of Object.keys(cats)){
      sum += Number(cats[k] ?? 0);
    }
    return sum;
  }

  function computeDashboard(fin){
    const incomeTotal = Number(fin?.baseline?.income_monthly_total ?? 0) || (fin?.income || []).reduce((a,x)=>a+Number(x?.monthly||0),0);
    const fixedTotal  = Number(fin?.baseline?.fixed_monthly_total ?? 0) || (fin?.fixed_expenses || []).reduce((a,x)=>a+Number(x?.monthly||0),0);
    const forcedSavings = Number(fin?.strategy_overrides?.forced_savings ?? 0);
    const debtAvg = debtMonthlyTotal(fin);
    const varEst = getVarMonthlyEstimate(fin);

    const currentBalance = Number(fin?.checkin?.balance_now ?? 0);
    const incomeState = String(fin?.checkin?.income_state ?? "after");
    const reservedNow = Number(fin?.checkin?.reserved_now ?? 0);

    // remaining income if before
    const remainingIncome = (incomeState === "before") ? incomeTotal : 0;

    // expected end-of-month (groft, men forklarbart)
    const expectedEnd = currentBalance + remainingIncome - (fixedTotal + forcedSavings + debtAvg + varEst);

    const availableNow = currentBalance - reservedNow;

    return {
      availableNow, expectedEnd,
      meta: { incomeTotal, fixedTotal, forcedSavings, debtAvg, varEst, incomeState, currentBalance, reservedNow }
    };
  }

  async function renderDashboard(){ return; }

function overlay(on){
    const el = $("wizardOverlay");
    if (el) el.style.display = on ? "block" : "none";
  }

  // Wizard: på step 5 gemmer vi checkin + events
  function wireWizardSave(){
    const btn = $("btnWizNext");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const step = Number(window.__sf_wiz_step || 1);
      if (step !== 5) return;

      const st = $("wizStatus");
      try{
        if (st) st.textContent = "Gemmer…";

        const fin = await getFinance();

        const balanceNow = Number($("wizBalance")?.value ?? 0);
        const incomeState = String($("wizIncomeState")?.value ?? "after");
        const surpriseAmount = Number($("wizSurpriseAmount")?.value ?? 0);
        const surpriseLabel = String($("wizSurpriseLabel")?.value ?? "").trim();
        const extraSave = Number($("wizExtraSave")?.value ?? 0);

          const today = new Date().toISOString().slice(0,10);
          const month = today.slice(0,7);

          let deviationKindGuess = "none";
          if (isFinite(surpriseAmount) && Math.abs(surpriseAmount) > 0){
            deviationKindGuess = surpriseAmount < 0 ? "unexpected_expense" : "unexpected_income";
          } else if (isFinite(extraSave) && extraSave > 0){
            deviationKindGuess = "extra_saving";
          }

          fin.checkin = fin.checkin || {};
          fin.checkin.ts = today;
          fin.checkin.month = month;
          fin.checkin.balance_now = balanceNow;
          fin.checkin.income_state = incomeState;
          fin.checkin.surprise_amount = isFinite(surpriseAmount) ? surpriseAmount : 0;
          fin.checkin.surprise_label = surpriseLabel || "";
          fin.checkin.extra_save = isFinite(extraSave) ? extraSave : 0;
          fin.checkin.deviation_kind_guess = deviationKindGuess;

          // reserved_now: læg ekstra opsparing oveni
          const prevReserved = Number(fin.checkin.reserved_now ?? 0);
          fin.checkin.reserved_now = Math.max(0, prevReserved + (isFinite(extraSave) ? extraSave : 0));

          await setFinance(fin);

          await addEvent({
            type: "checkin",
            ts: today,
            month,
            balance_now: balanceNow,
            income_state: incomeState,
            surprise_amount: isFinite(surpriseAmount) ? surpriseAmount : 0,
            surprise_label: surpriseLabel || "",
            extra_save: isFinite(extraSave) ? extraSave : 0,
            deviation_kind_guess: deviationKindGuess
          });

          if (isFinite(surpriseAmount) && Math.abs(surpriseAmount) > 0){
            await addEvent({
              type: "surprise",
              ts: today,
              month,
              amount: surpriseAmount,
              label: surpriseLabel || "uventet"
            });
          }
          if (isFinite(extraSave) && Math.abs(extraSave) > 0){
            await addEvent({
              type: "extra-save",
              ts: today,
              month,
              amount: extraSave
            });
          }
        if (isFinite(extraSave) && Math.abs(extraSave) > 0){
          await addEvent({ type: "extra-save", ts: today, amount: extraSave });
        }

        overlay(false);
        await renderDashboard();

        if (st) st.textContent = "Gemt ✅";
        setTimeout(()=>{ if (st) st.textContent = "—"; }, 1200);
      }catch(e){
        if (st) st.textContent = "Fejl: " + (e?.message || String(e));
      }
    }, { capture: true });
  }

  // Summary når man går fra trin 4 -> 5
  function wireWizardSummary(){
    const btn = $("btnWizNext");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const step = Number(window.__sf_wiz_step || 1);
      if (step !== 4) return;

      const b = Number($("wizBalance")?.value ?? 0);
      const s = String($("wizIncomeState")?.value ?? "after");
      const u = Number($("wizSurpriseAmount")?.value ?? 0);
      const ul = String($("wizSurpriseLabel")?.value ?? "").trim();
      const ex = Number($("wizExtraSave")?.value ?? 0);

      const parts = [];
      parts.push("Saldo: " + fmtKr(b));
      parts.push("Løn: " + (s==="before" ? "ikke modtaget" : "modtaget"));
      if (isFinite(u) && Math.abs(u)>0) parts.push("Uventet: " + fmtKr(u) + (ul?(" ("+ul+")"):""));
      if (isFinite(ex) && Math.abs(ex)>0) parts.push("Ekstra opsparing: " + fmtKr(ex));

      const sum = $("wizSummary");
      if (sum) sum.textContent = parts.join(" · ");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    
    wireWizardSave();
    wireWizardSummary();
  });
})();

/* ===== v0.2 Budgetposter editor (income/fixed/debts) ===== */
(function(){
  const $ = (id) => document.getElementById(id);
  const fmtKr = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  };

  async function apiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try{ j = t ? JSON.parse(t) : {}; }catch(e){ j = { _raw: t }; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }
  const getFinance = () => apiJson("/api/finance");
  const setFinance = (obj) => apiJson("/api/finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  });

  function esc(s){ return String(s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function renderList(rootId, items, kind){
    const root = $(rootId);
    if (!root) return;

    if (!Array.isArray(items) || !items.length){
      root.innerHTML = '<div style="opacity:.7">Ingen poster endnu.</div>';
      return;
    }

    const rows = items.map((x, i) => {
      if (kind === "debt"){
        const pay = Number(x?.payment ?? 0);
        const every = Math.max(1, Number(x?.every_months ?? 1));
        const avg = pay / every;
        return `
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:10px;padding:8px 10px;margin:6px 0">
            <div style="min-width:0">
              <b>${esc(x?.name || "—")}</b><div style="opacity:.75">Betaling: ${fmtKr(pay)} · hver ${every}. måned · gns: ${fmtKr(avg)}/md</div>
            </div>
            <button data-action="edit-item" data-edit="${i}" data-kind="debt" type="button" style="margin-right:8px;width:auto;padding:8px 10px">Rediger</button><button data-del="${i}" data-kind="debt" type="button" style="width:auto;padding:8px 10px">Slet</button>
          </div>
        `;
      }
      const m = Number(x?.monthly ?? 0);
      const pay = Number(x?.payment ?? 0);
      const every = Math.max(1, Number(x?.every_months ?? 1));
      const avg = (pay && every) ? (pay/every) : m;
      return `
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:10px;padding:8px 10px;margin:6px 0">
          <div style="min-width:0">
            <b>${esc(x?.name || "—")}</b><div style="opacity:.75">${(pay && pay!==0) ? ("Betaling: "+fmtKr(pay)+" · hver "+every+". måned · gns: "+fmtKr(avg)+"/md") : (fmtKr(m)+"/md")}</div>
          </div>
          <button data-action="edit-item" data-edit="${i}" data-kind="${esc(kind)}" type="button" style="margin-right:8px;width:auto;padding:8px 10px">Rediger</button><button data-del="${i}" data-kind="${esc(kind)}" type="button" style="width:auto;padding:8px 10px">Slet</button>
        </div>
      `;
    }).join("");

    root.innerHTML = rows;
  }

  async function renderBudget(){
    const fin = await getFinance();
    renderList("incomeList", fin.income || [], "income");
    renderList("fixedList", fin.fixed_expenses || [], "fixed");
    renderList("debtList", fin.debts || [], "debt");
  }

  async function saveAndRefresh(fin){
    await setFinance(fin);
    await renderBudget();
    // også dashboard
    try{
      // hvis wiring-blokken findes, vil den selv opdatere ved reload; vi forsøger ikke at kalde den direkte her.
    }catch(e){}
  }

  function setStatus(msg){
    const el = $("budgetStatus");
    if (el) el.textContent = msg;
  }

  document.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-del]");
    if (!btn) return;
    try{
      const idx = Number(btn.getAttribute("data-del"));
      const kind = String(btn.getAttribute("data-kind") || "");
      const fin = await getFinance();

      if (kind === "income"){
        fin.income = Array.isArray(fin.income) ? fin.income : [];
        fin.income.splice(idx, 1);
      } else if (kind === "fixed"){
        fin.fixed_expenses = Array.isArray(fin.fixed_expenses) ? fin.fixed_expenses : [];
        fin.fixed_expenses.splice(idx, 1);
      } else if (kind === "debt"){
        fin.debts = Array.isArray(fin.debts) ? fin.debts : [];
        fin.debts.splice(idx, 1);
      }
      await saveAndRefresh(fin);
      setStatus("Slettet ✅");
      setTimeout(()=>setStatus(""), 900);
    }catch(e){
      setStatus("Fejl: " + (e?.message || String(e)));
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    // Render når advancedWrap findes (ellers gør det ingenting)
    renderBudget().catch(()=>{});
    // Add income
    const bi = $("btnAddIncome");
    if (bi) bi.addEventListener("click", async () => {
      try{
        const name = String($("incomeName")?.value || "").trim();
        const payment = Number($("incomeMonthly")?.value || 0);
        const every = Math.max(1, Number($("incomeEvery")?.value || 1));
        if (!name) throw new Error("Indkomst mangler navn");
        const fin = await getFinance();
        fin.income = Array.isArray(fin.income) ? fin.income : [];
        fin.income.push({ name, payment, every_months: every });
        await saveAndRefresh(fin);
        $("incomeName").value = "";
        $("incomeMonthly").value = "";
        if ($("incomeEvery")) $("incomeEvery").value = "1";
        setStatus("Indkomst tilføjet ✅");
        setTimeout(()=>setStatus(""), 900);
      }catch(e){
        setStatus("Fejl: " + (e?.message || String(e)));
      }
    });
    // Add fixed
    const bf = $("btnAddFixed");
    if (bf) bf.addEventListener("click", async () => {
      try{
        const name = String($("fixedName")?.value || "").trim();
        const payment = Number($("fixedMonthly")?.value || 0);
        const every = Math.max(1, Number($("fixedEvery")?.value || 1));
        if (!name) throw new Error("Fast udgift mangler navn");
        const fin = await getFinance();
        fin.fixed_expenses = Array.isArray(fin.fixed_expenses) ? fin.fixed_expenses : [];
        fin.fixed_expenses.push({ name, payment, every_months: every });
        await saveAndRefresh(fin);
        $("fixedName").value = "";
        $("fixedMonthly").value = "";
        if ($("fixedEvery")) $("fixedEvery").value = "1";
        setStatus("Fast udgift tilføjet ✅");
        setTimeout(()=>setStatus(""), 900);
      }catch(e){
        setStatus("Fejl: " + (e?.message || String(e)));
      }
    });
    // Add debt
    const bd = $("btnAddDebt");
    if (bd) bd.addEventListener("click", async () => {
      try{
        const name = String($("debtName")?.value || "").trim();
        const payment = Number($("debtPayment")?.value || 0);
        const every = Math.max(1, Number($("debtEvery")?.value || 1));
        if (!name) throw new Error("Gæld mangler navn");
        const fin = await getFinance();
        fin.debts = Array.isArray(fin.debts) ? fin.debts : [];
        fin.debts.push({ name, payment, every_months: every });
        await saveAndRefresh(fin);
        $("debtName").value = "";
        $("debtPayment").value = "";
        $("debtEvery").value = "1";
        setStatus("Gæld tilføjet ✅");
        setTimeout(()=>setStatus(""), 900);
      }catch(e){
        setStatus("Fejl: " + (e?.message || String(e)));
      }
    });
  });
})();

/* ===== v0.2 Lag 1: items[] engine (type + category + payment/every) ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function dueThisMonth(item, nowAbs){
    if (!item) return 0;
    const pay = Number(item.payment ?? item.monthly ?? 0);
    const every = Math.max(1, Number(item.every_months ?? 1));
    if (!isFinite(pay) || !isFinite(every)) return 0;
    return pay / every;
  }

  function byCategory(items, type){
    const out = {};
    if (!Array.isArray(items)) return out;
    for (const it of items){
      if (type && String(it.type||"") !== type) continue;
      const cat = String(it.category || "Ukategoriseret");
      out[cat] = (out[cat] || 0) + dueThisMonth(it, nowAbs);
    }
    return out;
  }

  function fmtKr(v){
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  }

  async function apiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try{ j = t ? JSON.parse(t) : {}; }catch(e){ j = { _raw: t }; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  async function renderCategoryBreakdown(fin){
    const meta = $("dashMeta");
    if (!meta) return;

    const items = fin.items;
    if (!Array.isArray(items) || !items.length) return;

    const fixedCats = byCategory(items, "fixed");
    const lines = [];

    for (const [k,v] of Object.entries(fixedCats)){
      lines.push(k + ": " + fmtKr(v));
    }

    const debtTotal = (Array.isArray(items) ? items : [])
      .filter(x => String(x.type||"")==="debt")
      .reduce((a,x)=> a + dueThisMonth(x, nowAbs), 0);

    if (debtTotal > 0) lines.push("Gæld/afdrag: " + fmtKr(debtTotal));

    meta.textContent = lines.join(" · ");
  }

  document.addEventListener("DOMContentLoaded", () => {
    (async ()=>{
      try{
        const fin = await apiJson("/api/finance");
        await renderCategoryBreakdown(fin);
      }catch(e){}
    })();
  });
})();

/* ===== v0.2 Lag 1 UI: items[] editor + seed from baseline ===== */
(function(){
  const $ = (id) => document.getElementById(id);
  const CATS = [
    "Indtægt",
    "Bolig",
    "Husholdning",
    "Andre leveomkostninger",
    "Privatforbrug",
    "Transport",
    "Lån & investering",
    "Ukategoriseret"
  ];

  function esc(s){ return String(s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function fmtKr(v){
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  }
  function dueThisMonth(it, nowAbs){
    const pay = Number(it?.payment ?? it?.monthly ?? 0);
    const every = Math.max(1, Number(it?.every_months ?? 1));
    if (!isFinite(pay) || !isFinite(every)) return 0;
    return pay / every;
  }

  async function apiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try{ j = t ? JSON.parse(t) : {}; }catch(e){ j = { _raw: t }; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }
  const getFinance = () => apiJson("/api/finance");
  const setFinance = (obj) => apiJson("/api/finance", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(obj)
  });

  function setStatus(msg){
    const el = $("itemsStatus");
    if (el) el.textContent = msg || "";
  }

  function ensureCategoryOptions(){
    const sel = $("itemCategory");
    if (!sel) return;
    if (sel.options && sel.options.length > 1) return;
    sel.innerHTML = CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sel.value = "Ukategoriseret";
  }

  async function seedItemsIfEmpty(fin){
    if (Array.isArray(fin.items) && fin.items.length) return fin;

    fin.items = [];

    const inc = Number(fin?.baseline?.income_monthly_total ?? 0);
    const fx  = Number(fin?.baseline?.fixed_monthly_total ?? 0);

    if (isFinite(inc) && inc > 0){
      fin.items.push({ type:"income", category:"Indtægt", name:"Indkomst (samlet)", payment: inc, every_months: 1 });
    }
    if (isFinite(fx) && fx > 0){
      fin.items.push({ type:"fixed", category:"Ukategoriseret", name:"Faste udgifter (samlet)", payment: fx, every_months: 1 });
    }

    // Flyt evt. debts over hvis de findes
    if (Array.isArray(fin.debts)){
      for (const d of fin.debts){
        fin.items.push({
          type:"debt",
          category: String(d.category || "Lån & investering"),
          name: String(d.name || "Gæld"),
          payment: Number(d.payment ?? 0),
          every_months: Math.max(1, Number(d.every_months ?? 1))
        });
      }
    }

    await setFinance(fin);
    return fin;
  }

  function renderItems(fin){
    const root = $("itemsList");
    if (!root) return;

    const items = Array.isArray(fin.items) ? fin.items : [];
    if (!items.length){
      root.innerHTML = '<div class="small" style="opacity:.7">Ingen poster endnu.</div>';
      return;
    }

    const rows = items.map((it, i) => {
      const avg = dueThisMonth(it, nowAbs);
      return `
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:12px;padding:10px 12px;margin:8px 0">
          <div style="min-width:0">
            <div><b>${esc(it.name || "—")}</b></div>
            <div class="small" style="opacity:.8">
              ${esc(it.type)} · ${esc(it.category || "Ukategoriseret")} · betaling ${fmtKr(it.payment)} · hver ${Math.max(1, Number(it.every_months||1))}. måned · gns ${fmtKr(avg)}/md
            </div>
          </div>
          <button type="button" data-item-edit="${i}" style="width:auto;padding:8px 10px;margin-right:8px">Rediger</button><button type="button" data-item-del="${i}" style="width:auto;padding:8px 10px">Slet</button>
        </div>
      `;
    }).join("");

    root.innerHTML = rows;
  }

  async function refresh(){
    let fin = await getFinance();
    fin = await seedItemsIfEmpty(fin);
    renderItems(fin);
  }

  document.addEventListener("click", async (ev) => {
    
    // --- Lag 1: edit item (prompt-based) ---
    const ebtn = ev.target?.closest?.("button[data-item-edit]");
    if (ebtn){
      const idx = Number(ebtn.getAttribute("data-item-edit"));
      try{
        const fin = await apiJson("/api/finance");
        fin.items = fin.items || [];
        const it = fin.items[idx];
        if (!it) return;

        const name = prompt("Navn", String(it.name || ""));
        if (name === null) return;

        const paymentRaw = prompt("Beløb (kr)", String(it.payment ?? it.monthly ?? 0));
        if (paymentRaw === null) return;

        const everyRaw = prompt("Hver X måned(er)", String(it.every_months ?? 1));
        if (everyRaw === null) return;

        const payDayRaw = prompt("Trækkes dag i måneden (1-31)", String(it.pay_day ?? 1));
        const startMonthRaw = prompt("Startmåned (YYYY-MM) (tom = ingen)", String(it.start_month ? (String(it.start_month).slice(0,4)+"-"+String(it.start_month).slice(4,6)) : ""));
        if (startMonthRaw === null) return;

        if (payDayRaw === null) return;

        const payment = Number(String(paymentRaw).replace(",", "."));
        const every   = Number(String(everyRaw).replace(",", "."));
        const payDay  = Number(String(payDayRaw).replace(",", "."));

        // start_month: gemmes som YYYYMM (fx 202610). Tom => 0
        let start_month = 0;
        const sm = String(startMonthRaw || "").trim();
        if (sm){
          const m = sm.match(/^(\d{4})-(\d{2})$/);
          if (m){
            const y = Number(m[1]); const mo = Number(m[2]);
            if (y >= 1900 && y <= 3000 && mo >= 1 && mo <= 12){
              start_month = y*100 + mo;
            } else {
              throw new Error("Ugyldig startmåned (YYYY-MM)");
            }
          } else if (/^\d{6}$/.test(sm)) {
            start_month = Number(sm);
          } else {
            throw new Error("Ugyldig startmåned (brug YYYY-MM)");
          }
        }


        it.name = String(name).trim();
        it.payment = (isFinite(payment) ? payment : 0);
        it.every_months = Math.max(1, (isFinite(every) ? Math.trunc(every) : 1));
        it.pay_day = Math.max(1, Math.min(31, (isFinite(payDay) ? Math.trunc(payDay) : 1)));
        it.start_month = start_month;

        await apiJson("/api/finance", { method:"POST", body: JSON.stringify(fin) });
        setStatus("Opdateret ✅");
        await load();
      }catch(e){
        setStatus("Fejl: " + ((e && e.message) ? e.message : String(e)));
      }
      return;
    }

    const btn = ev.target?.closest?.("button[data-item-del]");
    if (!btn) return;
    try{
      const idx = Number(btn.getAttribute("data-item-del"));
      const fin = await getFinance();
      fin.items = Array.isArray(fin.items) ? fin.items : [];
      fin.items.splice(idx, 1);
      await setFinance(fin);
      await refresh();
      setStatus("Slettet ✅");
      setTimeout(()=>setStatus(""), 900);
    }catch(e){
      setStatus("Fejl: " + (e?.message || String(e)));
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureCategoryOptions();
    refresh().catch(()=>{});

    const add = $("btnAddItem");
    if (add){
      add.addEventListener("click", async () => {
        try{
          const fin = await getFinance();
          fin.items = Array.isArray(fin.items) ? fin.items : [];

          const type = String($("itemType")?.value || "fixed");
          const category = String($("itemCategory")?.value || "Ukategoriseret");
          const name = String($("itemName")?.value || "").trim();
          const payment = Number($("itemPayment")?.value || 0);
          const every = Math.max(1, Number($("itemEvery")?.value || 1));

          if (!name) throw new Error("Navn mangler");
          if (!isFinite(payment)) throw new Error("Beløb mangler");

          fin.items.push({ type, category, name, payment, every_months: every, start_month: Number(document.getElementById("itemStartMonth")?.value || 0) });
          await setFinance(fin);

          $("itemName").value = "";
          $("itemPayment").value = "";
          $("itemEvery").value = "1";
          await refresh();

          setStatus("Tilføjet ✅");
          setTimeout(()=>setStatus(""), 900);
        }catch(e){
          setStatus("Fejl: " + (e?.message || String(e)));
        }
      });
    }
  });
})();


  function absMonthNow(){
    const d = new Date();
    return d.getFullYear()*12 + d.getMonth(); // month index
  }

  function dueThisMonth(it, nowAbs){
    const pay = Number(it?.payment ?? 0);
    const every = Math.max(1, Number(it?.every_months ?? 1));
    if (!isFinite(pay) || !isFinite(every)) return 0;

    const sm = Number(it?.start_month ?? 0); // 1-12 or 0
    if (!sm){
      // no anchor -> if periodic >1, fall back to avg, else full pay monthly
      return (every > 1) ? (pay / every) : pay;
    }

    const nowM = (nowAbs % 12) + 1;
    let y = Math.floor(nowAbs / 12);
    if (sm > nowM) y -= 1;
    const startAbs = y*12 + (sm-1);

    if (nowAbs < startAbs) return 0;
    return ((nowAbs - startAbs) % every === 0) ? pay : 0;
  }
/* ===== v0.2.2 Dashboard: compute from items[] only (CLEAN) ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function dueThisMonth(it, nowAbs){
    const pay = Number(it && it.payment != null ? it.payment : 0);
    const every = Math.max(1, Number(it && it.every_months != null ? it.every_months : 1));
    if (!isFinite(pay) || !isFinite(every)) return 0;
    return pay / every;
  }

  function fmtKr(v){
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  }

  async function apiJson(path){
    const r = await fetch(path);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  
async function renderDash(){

  let fin = null;
  try{
    if (window.finance && typeof window.finance === "object") fin = window.finance;
  }catch(e){}

  try{
    if (!fin && window.__finance && typeof window.__finance === "object") fin = window.__finance;
  }catch(e){}

  if (!fin){
    try{
      if (typeof getFinance === "function"){
        fin = await getFinance();
      } else if (typeof api === "function"){
        fin = await api("/api/finance");
      }
    }catch(e){
      console.warn("renderDash: kunne ikke hente finance", e);
    }
  }

  if (!fin || typeof fin !== "object"){
    console.warn("renderDash: finance state mangler");
    return;
  }




    
    const nowAbs = absMonthNow();
const a = $("dashAvailable");
    const e = $("dashExpectedEnd");
    const d = $("dashDeviation");
    const meta = $("dashMeta");

    if (!a && !e && !d && !meta) return;

    const finData = await apiJson("/api/finance");
    const items = Array.isArray(finData.items) ? finData.items : [];


    // ===== v0.2.x CASHFLOW (this month) =====
    const monthKey = (typeof getActiveMonthKey === "function") ? getActiveMonthKey() : (() => {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
    })();

    let dueIncome = 0, dueFixed = 0, dueDebt = 0;

    (items || []).forEach(it => {
      try{
        const due = (typeof isDueThisMonth === "function") ? isDueThisMonth(it, monthKey) : true;
        if (!due) return;
        const amt = Number(it?.payment ?? it?.amount ?? 0) || 0;
        const t = String(it?.type ?? "").toLowerCase();
        if (t === "income") dueIncome += amt;
        else if (t === "fixed") dueFixed += amt;
        else if (t === "debt") dueDebt += amt;
      }catch(e){}
    });
try{
      const cfEl = document.getElementById("dashCashflow");
      if (cfEl && typeof fmtKr === "function") cfEl.textContent = fmtKr(availableCashflow);
      else if (cfEl) cfEl.textContent = Math.round(availableCashflow).toLocaleString("da-DK") + " kr";
    }catch(e){}

    let inc=0, fx=0, debt=0;
    for (const it of items){
      const m = dueThisMonth(it, 0);
      const t = String(it && it.type ? it.type : "");
      if (t === "income") inc += m;
      else if (t === "fixed") fx += m;
      else if (t === "debt") debt += m;
    }

    const available = inc - fx - debt;

    if (a) a.textContent = fmtKr(available);
    if (e) e.textContent = fmtKr(available);  // midlertidig: samme som "nu"
    try{
      const fin = await getFinance();
      const surprise = Number(fin?.checkin?.surprise_amount ?? 0);
      const extra = Number(fin?.checkin?.extra_save ?? 0);
      const devNow = surprise - extra;
      if (d) d.textContent = (devNow === 0) ? "0 kr" : fmtKr(devNow);
    }catch(e){
      
try{
  const fin = await getFinance();
  const s = Number(fin?.checkin?.surprise_amount ?? 0);
  const e = Number(fin?.checkin?.extra_save ?? 0);
  const dev = s - e;
  if (d){
    d.textContent = (dev === 0)
      ? "0 kr"
      : Math.round(dev).toLocaleString("da-DK") + " kr";
  }
}catch(e){
  if (d) d.textContent = "—";
}

    }

    // lille meta-linje hvis du vil se input
    if (meta && items.length){
      meta.textContent = "Indtægt: " + fmtKr(inc) + " · Faste: " + fmtKr(fx) + " · Gæld: " + fmtKr(debt);
    }
  }

window.renderDash = renderDash;
window.renderDashboard = renderDash;


  document.addEventListener("DOMContentLoaded", () => {
    
  });
})();


/* ===== v0.2.3: Hide legacy budget UI when items[] is present ===== */
(function(){
  return; // disabled duplicate renderDash block

  const $ = (id) => document.getElementById(id);

  async function apiJson(path){
    const r = await fetch(path);
    return r.json();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try{
      const fin = await apiJson("/api/finance");
      const hasItems = Array.isArray(fin.items) && fin.items.length > 0;

      const legacy = $("legacyBudgetWrap");
        const baseline = $("legacyBaselineWrap");

      if (legacy && hasItems){
          legacy.style.display = "none";
        }
        if (baseline && hasItems){
          baseline.style.display = "none";
        }

      // hvis itemsCard findes, sørg for den er synlig
      const itemsCard = $("itemsCard");
      if (itemsCard && hasItems){
        itemsCard.style.display = "";
      }
    }catch(e){}
  });
})();


/* ===== CLEAN DASH ENGINE v0.3 ===== */
async function renderDash_disabled(){
  try{
    const fin = await apiJson("/api/finance");
    const items = Array.isArray(fin.items) ? fin.items : [];

    function dueThisMonth(it, nowAbs){
      const pay = Number(it.payment || 0);
      const every = Math.max(1, Number(it.every_months || 1));
      return pay / every;
    }

    let income = 0, fixed = 0, debt = 0;

    for (const it of items){
      const m = dueThisMonth(it, 0);
      if (it.type === "income") income += m;
      else if (it.type === "fixed") fixed += m;
      else if (it.type === "debt") debt += m;
    }

    const available = income - fixed - debt;

    const fmt = (n) =>
      Math.round(n).toLocaleString("da-DK") + " kr";

    const el = document.getElementById("dashAvailable");
    if (el) el.textContent = fmt(available);

    const el2 = document.getElementById("dashExpectedEnd");
    if (el2) el2.textContent = fmt(available);

  }catch(e){
    console.error("renderDash failed:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderDash();
});

/* ===== v0.2.x hotfix: populate #itemStartMonth options if empty ===== */
(function(){
  const MONTHS = [
    {n:0, da:"(ingen)"},
    {n:1, da:"Januar"},
    {n:2, da:"Februar"},
    {n:3, da:"Marts"},
    {n:4, da:"April"},
    {n:5, da:"Maj"},
    {n:6, da:"Juni"},
    {n:7, da:"Juli"},
    {n:8, da:"August"},
    {n:9, da:"September"},
    {n:10, da:"Oktober"},
    {n:11, da:"November"},
    {n:12, da:"December"},
  ];

  function fill(){
    const sel = document.getElementById("itemStartMonth");
    if (!sel) return;
    if (sel.options && sel.options.length > 0) return; // allerede fyldt
    sel.innerHTML = MONTHS.map(m => `<option value="${m.n}">${m.da}</option>`).join("");
    sel.value = "0";
  }

  document.addEventListener("DOMContentLoaded", fill);
  // hvis scriptet loader efter DOM, så kør også direkte
  try{ fill(); }catch(e){}
})();

/* ===== v0.2.4: Hide legacy budget UI by ids when items[] is present ===== */
(function(){
  async function apiJson(path){
    const r = await fetch(path);
    return r.json();
  }

  function hideEl(el){
    if (!el) return;
    el.style.display = "none";
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try{
      const fin = await apiJson("/api/finance");
      const hasItems = Array.isArray(fin.items) && fin.items.length > 0;
      if (!hasItems) return;

      // Hide legacy headings
      document.querySelectorAll("h3").forEach(h => {
        const t = (h.textContent || "").trim();
        if (t === "Indkomst (måned)" || t === "Faste udgifter (måned)" || t === "Gæld / afdrag" || t === "Variabel (estimat)"){
          hideEl(h);
        }
      });

      // Hide the legacy "variabel" explainer text (the one mentioning month_log)
      document.querySelectorAll(".small").forEach(x => {
        const t = (x.textContent || "");
        if (t.includes("Læses pt. fra seneste month_log")) hideEl(x);
      });

      // Hide legacy lists + inputs + buttons
      const ids = [
        "incomeList","incomeName","incomeMonthly","incomeEvery","btnAddIncome",
        "fixedList","fixedName","fixedMonthly","fixedEvery","btnAddFixed",
        "debtList","debtName","debtPayment","debtEvery","btnAddDebt",
        "budgetStatus"
      ];

      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // hide rows nicely when possible
        const row = el.closest && el.closest(".row");
        if (row) hideEl(row);

        hideEl(el);
      });

    }catch(e){}
  });
})();


// Apply advanced visibility on load
try{ setAdvancedVisible(getAdvancedVisible()); }catch(e){}







/* HIDE_ADV_ON_LOAD_SIMPLE */
document.addEventListener("DOMContentLoaded", function(){
  document.querySelectorAll(".adv").forEach(x => x.style.display = "none");
  const btn = document.getElementById("btnToggleAdvanced");
  if (btn) btn.textContent = "Vis avanceret";
});


/* ===== CASHFLOW HELPERS ===== */

function ymToIndex(ym){
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [Y, M] = ym.split("-").map(Number);
  return (Y * 12) + (M - 1);
}

function getActiveMonthKey(){
  const el = document.getElementById("statusMonth");
  if (el && el.value) return el.value;

  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}

function isDueThisMonth(item, monthKey){
  const interval = Number(item.every_months ?? 1);
  if (interval <= 1) return true;

  const start = item.start_month;
  const mIdx = ymToIndex(monthKey);
  if (mIdx == null) return true;

  if (!start){
    return (mIdx % interval) === 0;
  }

  const sIdx = ymToIndex(start);
  if (sIdx == null) return true;

  return ((mIdx - sIdx) % interval) === 0;
}

/* ===== v0.2.x Legacy feedback: classify deviation (reserve / cashflow / shock) ===== */
(function(){
  return; // disabled: using HOTFIX block below
  // Don’t double-install
  if (window.__sf_dev_kind_installed) return;
  window.__sf_dev_kind_installed = true;

  const $ = (id) => document.getElementById(id);

  function parseKr(txt){
    if (txt == null) return NaN;
    const s = String(txt).replace(/\./g,"").replace(/\s/g,"");
    // keep digits + minus
    const m = s.match(/-?\d+/g);
    if (!m) return NaN;
    return Number(m.join(""));
  }

  function fmtKr(v){
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  }

  async function apiPost(path, obj){
    const r = await fetch(path, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(obj || {})
    });
    const out = await r.json().catch(()=> ({}));
    if (!r.ok || out.ok === false) throw new Error(out.error || ("HTTP " + r.status));
    return out;
  }

  function ensureModal(){
    if ($("sfDevKindModal")) return;

    const wrap = document.createElement("div");
    wrap.id = "sfDevKindModal";
    wrap.style.cssText = [
      "display:none",
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,.35)",
      "z-index:10000",
      "padding:18px"
    ].join(";");

    wrap.innerHTML = `
      <div style="max-width:520px;margin:10vh auto;background:#fff;border-radius:14px;padding:14px 14px 12px;border:1px solid #ddd">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <div style="font-weight:700">Hvad var afvigelsen?</div>
            <div class="small" id="sfDevKindDesc" style="margin-top:4px;opacity:.75"></div>
          </div>
          <button id="sfDevKindClose" type="button" style="width:auto;padding:8px 10px;border-radius:10px">Luk</button>
        </div>

        <div class="card" style="border:1px dashed #ddd;margin:12px 0;padding:12px;border-radius:12px">
          <div class="small" style="opacity:.8">
            Vælg den forklaring der passer bedst. Appen bruger det til at reagere korrekt
            (ikke panikskære i mad eller hund).
          </div>
        </div>

        <div style="display:grid;gap:10px">
          <button id="sfDevKindReserve" type="button">Reserve (have/bil/gaver osv.)</button>
          <button id="sfDevKindFlow" type="button">Løbende forbrug (dagligvarer/el/benzin)</button>
          <button id="sfDevKindShock" type="button">Reel afvigelse (uplanlagt / “shit happens”)</button>
        </div>

        <label style="margin-top:12px">Note (valgfri)</label>
        <input id="sfDevKindNote" placeholder="Fx: benzin + stor indkøbstur / gave / dyrlæge..." />

        <div class="small" id="sfDevKindStatus" style="margin-top:10px;opacity:.8"></div>
      </div>
    `;

    document.body.appendChild(wrap);

    $("sfDevKindClose").addEventListener("click", () => {
      wrap.style.display = "none";
    });
  }

  function getDeviationFromUI(){
    // Preferred: read from dashboard deviation label if present
    const devEl = $("dashDeviation");
    if (devEl){
      const n = parseKr(devEl.textContent);
      if (isFinite(n)) return n;
    }

    // Fallback: try feedback text
    const fb = $("feedback");
    if (fb){
      const n = parseKr(fb.textContent);
      if (isFinite(n)) return n;
    }
    return NaN;
  }

  function getMonthFromUI(){
    const m = $("month")?.value;
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    // fallback: current month
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    return d.getFullYear() + "-" + mm;
  }

  function getThreshold(){
    // First: explicit warnDeviation input
    const w = $("warnDeviation");
    if (w){
      const n = Number(w.value);
      if (isFinite(n) && n >= 0) return n;
    }
    // fallback default
    return 5000;
  }

  async function promptDeviationKind(){
    ensureModal();

    const modal = $("sfDevKindModal");
    const desc = $("sfDevKindDesc");
    const st = $("sfDevKindStatus");
    const note = $("sfDevKindNote");
    if (st) st.textContent = "";
    if (note) note.value = "";

    const dev = getDeviationFromUI();
    const month = getMonthFromUI();

    if (desc){
      desc.textContent = "Afvigelse: " + fmtKr(dev) + " (måned " + month + ")";
    }

    function open(){ modal.style.display = "block"; }

    async function choose(kind){
      try{
        if (st) st.textContent = "Gemmer…";
        await apiPost("/api/event", {
          type: "deviation-kind",
          ts: (new Date()).toISOString().slice(0,10),
          month,
          amount: dev,
          kind, // reserve | flow | shock
          note: String(note?.value || "").trim()
        });
        if (st) st.textContent = "Gemte ✅";
        setTimeout(()=>{ modal.style.display="none"; }, 450);
      }catch(e){
        if (st) st.textContent = "Fejl: " + (e?.message || String(e));
      }
    }

    $("sfDevKindReserve").onclick = () => choose("reserve");
    $("sfDevKindFlow").onclick    = () => choose("flow");
    $("sfDevKindShock").onclick   = () => choose("shock");

    open();
  }

  // Hook: after “Giv status” click, if deviation is large -> ask kind
  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("btnStatus");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      // Let existing handler compute dashboard/feedback first
      setTimeout(async () => {
        try{
          const dev = getDeviationFromUI();
          const thr = getThreshold();
          if (!isFinite(dev)) return;
          if (Math.abs(dev) < thr) return;
          await promptDeviationKind();
        }catch(e){}
      }, 120);
    }, true);
  });
})();

/* ===== v0.2.x HOTFIX: deviation-kind prompt failsafe (always works) ===== */
(function(){
  if (window.__sf_dev_kind_hotfix) return;
  window.__sf_dev_kind_hotfix = true;

  const $ = (id) => document.getElementById(id);

  function parseKr(txt){
    if (txt == null) return NaN;
    const s = String(txt).replace(/\./g,"").replace(/\s/g,"");
    const m = s.match(/-?\d+/g);
    if (!m) return NaN;
    return Number(m.join(""));
  }

  function fmtKr(v){
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("da-DK") + " kr";
  }

  async function apiPost(path, obj){
    const r = await fetch(path, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(obj || {})
    });
    const out = await r.json().catch(()=> ({}));
    if (!r.ok || out.ok === false) throw new Error(out.error || ("HTTP " + r.status));
    return out;
  }

  function getMonth(){
    const m = $("month")?.value;
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    return d.getFullYear() + "-" + mm;
  }

  function getThreshold(){
    const w = $("warnDeviation");
    const n = w ? Number(w.value) : NaN;
    return (isFinite(n) && n >= 0) ? n : 5000;
  }

  function ensureModal(){
    if ($("sfDevKindHotModal")) return;
    const wrap = document.createElement("div");
    wrap.id = "sfDevKindHotModal";
    wrap.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10001;padding:18px";

    wrap.innerHTML = `
      <div style="max-width:520px;margin:10vh auto;background:#fff;border-radius:14px;padding:14px 14px 12px;border:1px solid #ddd">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <div style="font-weight:700">Hvad var afvigelsen?</div>
            <div class="small" id="sfDevKindHotDesc" style="margin-top:4px;opacity:.75"></div>
          </div>
          <button id="sfDevKindHotClose" type="button" style="width:auto;padding:8px 10px;border-radius:10px">Luk</button>
        </div>

        <div style="display:grid;gap:10px;margin-top:12px">
          <button id="sfDevKindHotReserve" type="button">Reserve (have/bil/gaver osv.)</button>
          <button id="sfDevKindHotFlow" type="button">Løbende forbrug (dagligvarer/el/benzin)</button>
          <button id="sfDevKindHotShock" type="button">Reel afvigelse (uplanlagt)</button>
        </div>

        <label style="margin-top:12px">Note (valgfri)</label>
        <input id="sfDevKindHotNote" placeholder="Fx: benzin + stor indkøbstur / gave / dyrlæge..." />

        <div class="small" id="sfDevKindHotStatus" style="margin-top:10px;opacity:.8"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    $("sfDevKindHotClose").onclick = () => (wrap.style.display="none");
  }

  async function openAndPost(dev){
    ensureModal();
    const modal = $("sfDevKindHotModal");
    const desc  = $("sfDevKindHotDesc");
    const note  = $("sfDevKindHotNote");
    const st    = $("sfDevKindHotStatus");

    const month = getMonth();
    if (desc) desc.textContent = "Afvigelse: " + fmtKr(dev) + " (måned " + month + ")";
    if (note) note.value = "";
    if (st) st.textContent = "";

    async function choose(kind){
      try{
        if (st) st.textContent = "Gemmer…";
        await apiPost("/api/event", {
          type: "deviation-kind",
          ts: (new Date()).toISOString().slice(0,10),
          month,
          amount: dev,
          kind,
          note: String(note?.value || "").trim()
        });
        if (st) st.textContent = "Gemte ✅";
        setTimeout(()=>{ modal.style.display="none"; }, 450);
      }catch(e){
        if (st) st.textContent = "Fejl: " + (e?.message || String(e));
      }
    }

    $("sfDevKindHotReserve").onclick = () => choose("reserve");
    $("sfDevKindHotFlow").onclick    = () => choose("flow");
    $("sfDevKindHotShock").onclick   = () => choose("shock");

    modal.style.display = "block";
  }

  // Hook on "Giv status"
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!t) return;
    if (t.id !== "btnStatus") return;

    // Give dashboard a moment to update
    setTimeout(() => {
      const devEl = $("dashDeviation");
      const dev = devEl ? parseKr(devEl.textContent) : NaN;
      const thr = getThreshold();
      if (!isFinite(dev)) return;
      if (Math.abs(dev) < thr) return;

      openAndPost(dev);
    }, 50);
  }, true);

})();

/* ===== v0.2.x DEVKIND HOOK: prompt after status ===== */
(function(){
  if (window.__sf_devkind_hook_installed) return;
  window.__sf_devkind_hook_installed = true;

  const $ = (id) => document.getElementById(id);

  function parseKr(txt){
    if (txt == null) return NaN;
    const s = String(txt).replace(/\./g,"").replace(/\s/g,"");
    const m = s.match(/-?\d+/g);
    if (!m) return NaN;
    return Number(m.join(""));
  }

  function getDeviation(){
    const devEl = $("dashDeviation");
    if (devEl){
      const n = parseKr(devEl.textContent);
      if (isFinite(n)) return n;
    }
    const fb = $("feedback");
    if (fb){
      const n = parseKr(fb.textContent);
      if (isFinite(n)) return n;
    }
    return NaN;
  }

  function getThreshold(){
    const w = $("warnDeviation");
    const n = w ? Number(w.value) : 5000;
    return (isFinite(n) && n >= 0) ? n : 5000;
  }

  function promptIfNeeded(){
    try{
      const dev = getDeviation();
      const thr = getThreshold();
      if (!isFinite(dev)) return;
      if (Math.abs(dev) < thr) return;

      // bruger din eksisterende modal hvis den findes
      if (typeof window.__sf_promptDeviationKind === "function"){
        window.__sf_promptDeviationKind();
        return;
      }

      // fallback: hvis den gamle blok stadig lever et sted, prøv direkte ved at klikke-knapperne senere
      // (men vi regner med din modal-block eksisterer)
    }catch(e){}
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("btnStatus");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // vent lidt så dashboard/feedback når at render
      setTimeout(promptIfNeeded, 250);
    });
  });
})();

/* ===== HOTFIX: single btnStatus handler + deviation-kind from latest status event (no UI parsing) ===== */
(function(){
  if (window.__sf_btnstatus_single_fix) return;
  window.__sf_btnstatus_single_fix = true;

  const $ = (id) => document.getElementById(id);

  async function apiJson(path, opts){
    const r = await fetch(path, opts);
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  function getThreshold(){
    const w = $("warnDeviation");
    const n = w ? Number(w.value) : NaN;
    return (isFinite(n) && n >= 0) ? n : 5000;
  }

  async function getLatestStatus(month){
    const evs = await apiJson("/api/events");
    const arr = Array.isArray(evs.events) ? evs.events : [];
    // find last status for the selected month (fallback: last status overall)
    let last = null;
    for (let i = arr.length - 1; i >= 0; i--){
      const e = arr[i];
      if (!e || e.type !== "status") continue;
      if (month && e.month === month){ last = e; break; }
      if (!last) last = e;
    }
    return last;
  }

  async function maybePromptDeviationKind(){
    try{
      const month = $("month")?.value || "";
      const last = await getLatestStatus(month);
      if (!last) return;

      const dev = Number(last.deviation);
      if (!isFinite(dev)) return;

      const thr = getThreshold();
      if (Math.abs(dev) < thr) return;

      // Prefer the newer exposed hook if present
      if (typeof window.__sf_promptDeviationKind === "function"){
        window.__sf_promptDeviationKind({ month: last.month, deviation: dev });
        return;
      }

      // Fallback: if promptDeviationKind exists inside closure but not exposed,
      // we can't reach it here. In that case: do nothing.
    }catch(e){}
  }

  function install(){
    const btn = $("btnStatus");
    if (!btn) return;

    // Nuke all previous listeners by cloning the node
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", async (ev) => {
      try{ ev.preventDefault(); }catch(e){}
      try{
        if (typeof window.doStatus === "function"){
          await window.doStatus();
        } else if (typeof doStatus === "function"){
          await doStatus();
        } else {
          // Last resort: click any existing handlers (we already removed them) -> nothing to do
          return;
        }
      }catch(e){
        try{ if (typeof dbg === "function") dbg(e?.message || String(e)); }catch(_){}
      }
      await maybePromptDeviationKind();
    });
  }

  document.addEventListener("DOMContentLoaded", install);
})();

/* ===== HOTFIX: expose deviation-kind prompt as window.__sf_promptDeviationKind({month,deviation}) ===== */
(function(){
  if (window.__sf_promptDeviationKind) return;

  const $ = (id) => document.getElementById(id);

  // We reuse the existing modal if present, otherwise the existing block will create it when called from btnStatus
  // But we can't call the inner function if it's not in scope.
  // So: we trigger the same behavior by simulating a big deviation in UI labels that the existing code reads.
  // And then calling the existing hook if it exists.
  window.__sf_promptDeviationKind = function(payload){
    try{
      const month = payload?.month;
      const dev = payload?.deviation;

      // put deviation into dashDeviation so existing code can parse it if it insists
      const dd = $("dashDeviation");
      if (dd && isFinite(Number(dev))){
        dd.textContent = (Math.round(Number(dev))).toLocaleString("da-DK") + " kr";
      }
      // ensure month input is set so it logs the correct month
      const m = $("month");
      if (m && month && /^\d{4}-\d{2}$/.test(month)) m.value = month;

      // If the original function was already exposed elsewhere, call it
      if (typeof window.promptDeviationKind === "function"){
        window.promptDeviationKind();
        return;
      }

      // Otherwise: click btnStatus handler will call maybePromptDeviationKind -> which calls this bridge -> which primes UI.
      // The modal might still not open if the original block is fully closed over.
      // In that case you’ll still be able to log via curl (already works).
      const maybe = window.__sf_dev_kind_installed;
      if (!maybe){
        // nothing else to do
      }
    }catch(e){}
  };
})();

/* ===== v0.3.x: pay_day support for fixed items ===== */

(function(){
  if (window.__sf_payday_support) return;
  window.__sf_payday_support = true;

  const origRenderItemForm = window.renderItemForm;

  // If renderItemForm exists, extend it
  if (typeof origRenderItemForm === "function"){
    window.renderItemForm = function(item){
      const el = origRenderItemForm(item);

      // Only for fixed items
      if (item?.type === "fixed"){
        const wrap = document.createElement("div");
        wrap.innerHTML = `
          <label>Betalingsdag (1–31)</label>
          <input type="number" min="1" max="31" value="${item.pay_day || 1}" />
        `;
        const input = wrap.querySelector("input");
        input.addEventListener("change", () => {
          item.pay_day = Number(input.value) || 1;
        });
        el.appendChild(wrap);
      }

      return el;
    };
  }

})();

/* --- DISABLED: v0.3.x cashflow block (schema mismatch: amount/pay_day) ---
/* ===== v0.3.x: expected balance today (cashflow) ===== */

(function(){
  if (window.__sf_cashflow_today) return;
  window.__sf_cashflow_today = true;

  const $ = (id) => document.getElementById(id);

  function computeExpectedToday(data){
      const todayDay = new Date().getDate();
      const month = document.getElementById("month")?.value; // YYYY-MM
      if (!data?.items) return null;

      const ymOk = (v) => /^\d{4}-\d{2}$/.test(String(v||""));
      const monthIndex = (ym) => {
        if (!ymOk(ym)) return null;
        const y = Number(String(ym).slice(0,4));
        const m = Number(String(ym).slice(5,7));
        return y*12 + (m-1);
      };

      const getInterval = (it) => {
        const v = it.every || it.interval || it.every_months || it.everyMonths || it.period || 1;
        const n = Number(v);
        return (isFinite(n) && n > 0) ? Math.round(n) : 1;
      };

      const isActiveThisMonth = (it) => {
        const mi = monthIndex(month);
        if (mi == null) return true;

        const sm = it.start_month || it.startMonth || it.from_month || it.fromMonth || null;
        const si = monthIndex(sm);
        if (si != null && mi < si) return false;

        const interval = getInterval(it);
        if (interval <= 1 || si == null) return true;

        return ((mi - si) % interval) === 0;
      };

      const dueByToday = (it) => {
        const payDay = Number(it.pay_day || it.payDay || 1);
        const pd = (isFinite(payDay) && payDay >= 1 && payDay <= 31) ? payDay : 1;
        return pd <= todayDay;
      };

      // Outflows we treat as “trukket”
      const isOutflow = (it) => {
        const t = String(it.type || "").toLowerCase();
        return (t === "fixed" || t === "debt" || t === "forced" || t === "savings");
      };

      let total = 0;

      data.items.forEach(it => {
        if (!isOutflow(it)) return;
        if (!isActiveThisMonth(it)) return;
        if (!dueByToday(it)) return;
        total += Number(it.amount || 0);
      });

      return total;
    }

  // Extend renderDash
  const origRenderDash = window.renderDash;
  if (typeof origRenderDash === "function"){
    window.renderDash = function(data){
      // normalize items: backend uses 'payment', older calc expects 'amount'
        try{
          if (data && Array.isArray(data.items)){
            data.items.forEach(it => {
              if (!it) return;
              if (it.amount == null && it.payment != null) it.amount = it.payment;
              if (it.pay_day == null) it.pay_day = 1;
            });
          }
        }catch(e){}
origRenderDash(data);

      const expected = computeExpectedToday(data);
      if (expected == null) return;

      const el = document.getElementById("dashMeta");
      if (!el) return;

      const today = new Date().toLocaleDateString("da-DK");
      el.innerHTML += `<br><small>Forventet trukket pr. ${today}: ${expected.toLocaleString("da-DK")} kr</small>`;
    };
  }


/* ===== v0.3.x: edit item (quick prompt editor) ===== */
(function(){
  if (window.__sf_edit_item) return;
  window.__sf_edit_item = true;

  function numOr(v, fallback){
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  async function editItemByIndex(idx){
    idx = Number(idx);
    if (!Number.isFinite(idx) || idx < 0) return;

    // Brug eksisterende helpers hvis de findes (du har typisk getFinance/setFinance).
    const getFinance = (typeof window.getFinance === "function") ? window.getFinance : null;
    const setFinance = (typeof window.setFinance === "function") ? window.setFinance : null;
    if (!getFinance || !setFinance){ try{ dbg("Mangler getFinance/setFinance til edit."); }catch(e){} return; }

    const fin = await getFinance();
    if (!fin || !Array.isArray(fin.items) || !fin.items[idx]) return;

    const it = fin.items[idx];

    const name = prompt("Navn", it.name ?? "") ?? (it.name ?? "");
    const payment = numOr(prompt("Beløb (kr)", String(it.payment ?? 0)), (it.payment ?? 0));
    const every = Math.max(1, Math.floor(numOr(prompt("Hver X måned(er)", String(it.every_months ?? 1)), (it.every_months ?? 1))));
    const payDay = Math.max(1, Math.min(28, Math.floor(numOr(prompt("Trækkes dag i måneden (1-28)", String(it.pay_day ?? 1)), (it.pay_day ?? 1)))));
    const startMonthRaw = prompt("Startmåned (1-12) eller blank", String(it.start_month ?? "")) ?? String(it.start_month ?? "");
    const startMonth = startMonthRaw.trim() === "" ? 0 : Math.max(1, Math.min(12, Math.floor(numOr(startMonthRaw, (it.start_month ?? 0)))));

    it.name = name;
    it.payment = payment;
    it.every_months = every;
    it.pay_day = payDay;
    it.start_month = startMonth;

    await setFinance(fin);

    // refresh hvis du har en load/render funktion
    try{ if (typeof window.load === "function") await window.load(); }catch(e){}
    try{ if (typeof window.render === "function") window.render(); }catch(e){}
    try{ setStatus("✏️ Post opdateret", "ok", 2000); }catch(e){}
  }

  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!t) return;

    // Vi bruger data-action="edit-item" som vi injicerede.
    const btn = t.closest ? t.closest('[data-action="edit-item"]') : null;
    if (!btn) return;

    ev.preventDefault();

    // Forsøg at finde index. Enten data-idx på knappen, eller på samme card.
    let idx = btn.getAttribute("data-idx");
    if (idx == null){
      const holder = btn.closest ? btn.closest("[data-idx]") : null;
      if (holder) idx = holder.getAttribute("data-idx");
    }

    await editItemByIndex(idx);
  }, true);

})();


})();

/* --- END DISABLED --- */

/* ===== hotfix: hide legacy cards once after render ===== */
window.addEventListener("load", function () {
  try {
    const wanted = new Set([
      "status (check-in)",
      "månedsluk",
      "feedback"
    ]);

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"));
    headings.forEach(h => {
      const txt = String(h.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!wanted.has(txt)) return;

      // find nærmeste "kort"-agtige wrapper
      let card =
        h.closest(".card") ||
        h.closest("section") ||
        h.parentElement;

      if (!card) return;

      // undgå at skjule strategi/budget/debug ved et uheld
      const blockText = String(card.innerText || "");
      if (
        blockText.includes("Aktiv strategi") ||
        blockText.includes("Budgetposter (Lag 1)") ||
        blockText.includes("Tilføj post") ||
        blockText.includes("Debug")
      ) {
        return;
      }

      card.style.display = "none";
    });
  } catch (e) {
    console.warn("hide legacy cards failed:", e);
  }
});

/* ===== HOTFIX: dashboard last checkin info ===== */
(function(){
  function fmtKr(n){
    const x = Number(n || 0);
    return (Math.round(x)).toLocaleString("da-DK") + " kr";
  }

  function describeLastCheckin(fin){
    const c = fin && fin.checkin ? fin.checkin : null;
    if (!c || !c.ts) return "Ingen check-in endnu.";

    const kind = String(c.deviation_kind_guess || "none");
    const label = String(c.surprise_label || "").trim();
    const surprise = Number(c.surprise_amount ?? 0);
    const extra = Number(c.extra_save ?? 0);

    let kindText = "ingen særlig afvigelse";
    if (kind === "unexpected_expense") kindText = "uventet udgift";
    else if (kind === "unexpected_income") kindText = "uventet indtægt";
    else if (kind === "extra_saving") kindText = "ekstra opsparing";

    const parts = [];
    parts.push("Sidste check-in: " + kindText);

    if (label) parts.push(label);
    if (isFinite(surprise) && surprise !== 0){
      parts.push(fmtKr(surprise));
    } else if (isFinite(extra) && extra !== 0){
      parts.push("opsparing " + fmtKr(extra));
    }

    return parts.join(" · ");
  }

  async function fetchFinanceSafe(){
    try{
      if (typeof window.getFinance === "function"){
        return await window.getFinance();
      }
    }catch(e){}

    try{
      const r = await fetch("/api/finance", { credentials: "same-origin" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    }catch(e){
      return null;
    }
  }

  async function refreshDashCheckinInfo(){
    try{
      const el = document.getElementById("dashCheckinInfo");
      if (!el) return;
      const fin = await fetchFinanceSafe();
      if (!fin){
        el.textContent = "Kunne ikke læse sidste check-in.";
        return;
      }
      el.textContent = describeLastCheckin(fin);
    }catch(e){
      try{
        const el = document.getElementById("dashCheckinInfo");
        if (el) el.textContent = "Fejl ved læsning af check-in.";
      }catch(_){}
    }
  }

  function install(){
    refreshDashCheckinInfo();

    // patch renderDash hvis den findes
    if (typeof window.renderDash === "function" && !window.__sf_dash_checkin_patched){
      const orig = window.renderDash;
      window.renderDash = async function(){
        const out = await orig.apply(this, arguments);
        try{ await refreshDashCheckinInfo(); }catch(e){}
        return out;
      };
      window.__sf_dash_checkin_patched = true;
    }

    // patch renderDashboard hvis den findes
    if (typeof window.renderDashboard === "function" && !window.__sf_dashboard_checkin_patched){
      const orig2 = window.renderDashboard;
      window.renderDashboard = async function(){
        const out = await orig2.apply(this, arguments);
        try{ await refreshDashCheckinInfo(); }catch(e){}
        return out;
      };
      window.__sf_dashboard_checkin_patched = true;
    }

    // refresh efter wizard-gem
    const btn = document.getElementById("btnWizNext");
    if (btn && !btn.__sf_checkininfo_hooked){
      btn.addEventListener("click", () => {
        setTimeout(refreshDashCheckinInfo, 900);
      });
      btn.__sf_checkininfo_hooked = true;
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();


/* ===== HOTFIX: dashboard deviation explanation ===== */
(function(){
  function fmtKr2(n){
    const x = Number(n || 0);
    return (Math.round(x)).toLocaleString("da-DK") + " kr";
  }

  function getDeviationExplanation(fin){
    const c = fin && fin.checkin ? fin.checkin : null;
    if (!c) return "Afvigelse ikke beregnet endnu.";

    const kind = String(c.deviation_kind_guess || "none");
    const surprise = Number(c.surprise_amount ?? 0);
    const extra = Number(c.extra_save ?? 0);
    const label = String(c.surprise_label || "").trim();

    if (kind === "unexpected_expense" && surprise !== 0){
      return "Årsag: uventet udgift" + (label ? " (" + label + ")" : "") + " · " + fmtKr2(surprise);
    }
    if (kind === "unexpected_income" && surprise !== 0){
      return "Årsag: uventet indtægt" + (label ? " (" + label + ")" : "") + " · " + fmtKr2(surprise);
    }
    if (kind === "extra_saving" && extra !== 0){
      return "Årsag: ekstra opsparing · " + fmtKr2(extra);
    }
    if (extra !== 0){
      return "Årsag: ekstra opsparing · " + fmtKr2(extra);
    }
    if (surprise !== 0){
      return "Årsag: registreret afvigelse" + (label ? " (" + label + ")" : "") + " · " + fmtKr2(surprise);
    }
    return "Ingen registreret afvigelsesårsag i seneste check-in.";
  }

  async function refreshDashDeviationInfo(){
    try{
      const el = document.getElementById("dashDeviationInfo");
      if (!el) return;

      let fin = null;
      try{
        if (typeof window.getFinance === "function"){
          fin = await window.getFinance();
        }
      }catch(e){}

      if (!fin){
        const r = await fetch("/api/finance", { credentials: "same-origin" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        fin = await r.json();
      }

      el.textContent = getDeviationExplanation(fin);
    }catch(e){
      const el = document.getElementById("dashDeviationInfo");
      if (el) el.textContent = "Afvigelsesforklaring utilgængelig.";
    }
  }

  function install(){
    refreshDashDeviationInfo();

    if (typeof window.renderDash === "function" && !window.__sf_dash_devinfo_patched){
      const orig = window.renderDash;
      window.renderDash = async function(){
        const out = await orig.apply(this, arguments);
        try{ await refreshDashDeviationInfo(); }catch(e){}
        return out;
      };
      window.__sf_dash_devinfo_patched = true;
    }

    if (typeof window.renderDashboard === "function" && !window.__sf_dashboard_devinfo_patched){
      const orig2 = window.renderDashboard;
      window.renderDashboard = async function(){
        const out = await orig2.apply(this, arguments);
        try{ await refreshDashDeviationInfo(); }catch(e){}
        return out;
      };
      window.__sf_dashboard_devinfo_patched = true;
    }

    const btn = document.getElementById("btnWizNext");
    if (btn && !btn.__sf_devinfo_hooked){
      btn.addEventListener("click", () => {
        setTimeout(refreshDashDeviationInfo, 900);
      });
      btn.__sf_devinfo_hooked = true;
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();




/* ===== HOTFIX: force deviation display ===== */
(async function(){
  async function updateDeviation(){
    try{
      let fin=null;

      if(typeof getFinance==="function"){
        fin=await getFinance();
      }else{
        const r=await fetch("/api/finance");
        fin=await r.json();
      }

      const s=Number(fin?.checkin?.surprise_amount ?? 0);
      const e=Number(fin?.checkin?.extra_save ?? 0);
      const dev=s-e;

      const el=document.getElementById("dashDeviation");
      if(!el) return;

      el.textContent=Math.round(dev).toLocaleString("da-DK")+" kr";
    }catch(e){}
  }

  const origRenderDash=window.renderDash;
  if(origRenderDash){
    window.renderDash=async function(){
      const r=await origRenderDash.apply(this,arguments);
      setTimeout(updateDeviation,50);
      return r;
    }
  }

  const origRenderDashboard=window.renderDashboard;
  if(origRenderDashboard){
    window.renderDashboard=async function(){
      const r=await origRenderDashboard.apply(this,arguments);
      setTimeout(updateDeviation,50);
      return r;
    }
  }

  document.addEventListener("DOMContentLoaded",updateDeviation);
})();



/* ===== HOTFIX: dashboard monthly trend ===== */
(function(){
  function fmtKrTrend(n){
    return Math.round(Number(n || 0)).toLocaleString("da-DK") + " kr";
  }

  function getCurrentMonthKey(fin){
    const fromCheckin = String(fin?.checkin?.month || "").trim();
    if (/^\d{4}-\d{2}$/.test(fromCheckin)) return fromCheckin;

    const ts = String(fin?.checkin?.ts || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts.slice(0, 7);

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return y + "-" + m;
  }

  async function refreshMonthTrend(){
    try{
      const out = document.getElementById("dashMonthTrend");
      if (!out) return;

      let fin = null;
      if (typeof getFinance === "function"){
        fin = await getFinance();
      } else {
        const rf = await fetch("/api/finance", { credentials: "same-origin" });
        if (!rf.ok) throw new Error("finance HTTP " + rf.status);
        fin = await rf.json();
      }

      const month = getCurrentMonthKey(fin);

      const r = await fetch("/api/events", { credentials: "same-origin" });
      if (!r.ok) throw new Error("events HTTP " + r.status);
      const evs = await r.json();
      const arr = Array.isArray(evs?.events) ? evs.events : [];

      let total = 0;

      for (const e of arr){
        if (!e || !e.type) continue;

        const eMonth =
          (typeof e.month === "string" && /^\d{4}-\d{2}$/.test(e.month))
            ? e.month
            : (typeof e.ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.ts) ? e.ts.slice(0,7) : "");

        if (eMonth !== month) continue;

        if (e.type === "surprise"){
          total += Number(e.amount || 0);
        } else if (e.type === "extra-save"){
          total -= Number(e.amount || 0);
        }
      }

      if (total > 0){
        out.textContent = "Månedens trend: ↑ " + fmtKrTrend(total) + " foran planen";
      } else if (total < 0){
        out.textContent = "Månedens trend: ↓ " + fmtKrTrend(Math.abs(total)) + " bag planen";
      } else {
        out.textContent = "Månedens trend: på planen";
      }
    }catch(e){
      const out = document.getElementById("dashMonthTrend");
      if (out) out.textContent = "Månedens trend utilgængelig.";
    }
  }

  function installTrendHooks(){
    refreshMonthTrend();

    if (typeof window.renderDash === "function" && !window.__sf_monthtrend_renderDash){
      const orig = window.renderDash;
      window.renderDash = async function(){
        const res = await orig.apply(this, arguments);
        setTimeout(refreshMonthTrend, 60);
        return res;
      };
      window.__sf_monthtrend_renderDash = true;
    }

    if (typeof window.renderDashboard === "function" && !window.__sf_monthtrend_renderDashboard){
      const orig2 = window.renderDashboard;
      window.renderDashboard = async function(){
        const res = await orig2.apply(this, arguments);
        setTimeout(refreshMonthTrend, 60);
        return res;
      };
      window.__sf_monthtrend_renderDashboard = true;
    }

    const btn = document.getElementById("btnWizNext");
    if (btn && !btn.__sf_monthtrend_hooked){
      btn.addEventListener("click", () => {
        setTimeout(refreshMonthTrend, 900);
      });
      btn.__sf_monthtrend_hooked = true;
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installTrendHooks);
  } else {
    installTrendHooks();
  }
})();



/* ===== HARD DASH FIX v0.3 ===== */
document.addEventListener("DOMContentLoaded", async () => {
  try{

    const r = await fetch("/api/finance");
    const fin = await r.json();

    const items = Array.isArray(fin.items) ? fin.items : [];

    let income = 0, fixed = 0, debt = 0;

    for (const it of items){
      const pay = Number(it.payment || it.amount || 0);
      const every = Math.max(1, Number(it.every_months || 1));
      const m = pay / every;

      if (it.type === "income") income += m;
      else if (it.type === "fixed") fixed += m;
      else if (it.type === "debt") debt += m;
    }

    const available = income - fixed - debt;

    const fmt = (n)=>Math.round(n).toLocaleString("da-DK")+" kr";

    const a = document.getElementById("dashAvailable");
    const e = document.getElementById("dashExpectedEnd");
    const m = document.getElementById("dashMeta");

    if(a) a.textContent = fmt(available);
    if(e) e.textContent = fmt(available);

    if(m){
      m.textContent =
        "Indtægt: "+fmt(income)+" · Faste: "+fmt(fixed)+" · Gæld: "+fmt(debt);
    }

  }catch(err){
    console.error("HARD DASH FIX failed:",err);
  }
});



/* ===== DASH REASON PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function fmtKrReason(n){
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return Math.round(v).toLocaleString("da-DK") + " kr";
  }

  async function fetchJson(url, opts){
    const r = await fetch(url, opts || {});
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  function monthKeyNow(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function sameMonth(ts, monthKey){
    if (!ts || !monthKey) return false;
    const s = String(ts);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,7) === monthKey;
    return false;
  }

  function buildReason(fin, events){
    const out = [];
    const checkin = (fin && fin.checkin) ? fin.checkin : {};
    const month = String(checkin.month || monthKeyNow());

    const monthEvents = Array.isArray(events)
      ? events.filter(e => String(e && (e.month || "")).trim() === month || sameMonth(e && e.ts, month))
      : [];

    const surpriseEvents = monthEvents.filter(e => e && e.type === "surprise");
    const extraSaveEvents = monthEvents.filter(e => e && e.type === "extra-save");

    const surpriseSum = surpriseEvents.reduce((a,e) => a + Number(e && e.amount || 0), 0);
    const extraSaveSum = extraSaveEvents.reduce((a,e) => a + Number(e && e.amount || 0), 0);

    const surpriseLabel = String(checkin.surprise_label || "").trim();
    const surpriseAmount = Number(checkin.surprise_amount || 0);
    const extraSave = Number(checkin.extra_save || 0);
    const kind = String(checkin.deviation_kind_guess || "").trim();

    if (kind === "unexpected_expense" || surpriseAmount < 0 || surpriseSum < 0){
      const label = surpriseLabel ? (" (" + surpriseLabel + ")") : "";
      const amount = surpriseAmount !== 0 ? surpriseAmount : surpriseSum;
      if (amount !== 0){
        out.push("Årsag: uventet udgift" + label + " · " + fmtKrReason(amount));
      } else {
        out.push("Årsag: uventet udgift");
      }
    }

    if (extraSave > 0 || extraSaveSum > 0){
      const amount = extraSave > 0 ? extraSave : extraSaveSum;
      out.push("Ekstra opsparing: " + fmtKrReason(amount));
    }

    if (!out.length && Array.isArray(monthEvents) && monthEvents.length){
      const lastSurprise = [...surpriseEvents].reverse().find(Boolean);
      if (lastSurprise){
        const lbl = String(lastSurprise.label || "").trim();
        out.push(
          "Mulig forklaring: uventet post" +
          (lbl ? " (" + lbl + ")" : "") +
          " · " + fmtKrReason(Number(lastSurprise.amount || 0))
        );
      }
    }

    if (!out.length){
    }

    return out;
  }

  async function renderDashReason(){
    const el = $("dashReason");
    if (!el) return;

    try{
      const finRes = await fetchJson("/api/finance");
      const evRes = await fetchJson("/api/events");

      const lines = buildReason(finRes || {}, (evRes && evRes.events) || []);
      el.innerHTML = lines.map(x => String(x)).join("<br>");
    }catch(e){
      el.textContent = "";
    }
  }

  function installReasonPatch(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_reason_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashReason(); } catch(e){}
        return ret;
      };
      window.__sf_reason_patch_wrapped = true;
    }

    setTimeout(() => { renderDashReason().catch(()=>{}); }, 250);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installReasonPatch);
  } else {
    installReasonPatch();
  }
})();

/* ===== DASH STATUSLINE PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function fmtKrStatus(n){
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return Math.round(v).toLocaleString("da-DK") + " kr";
  }

  function statusText(deviation){
    const d = Number(deviation);
    if (!isFinite(d) || d === 0) return "Du følger planen.";
    if (d < 0) return "Status: " + fmtKrStatus(Math.abs(d)) + " bag planen.";
    return "Status: " + fmtKrStatus(d) + " foran planen.";
  }

  async function renderDashStatusline(){
    const reasonEl = $("dashReason");
    const dash = document.body.innerText.match(/Afvigelse:\s*(-?[0-9\.]+)/);
    if (!reasonEl || !dash) return;

    const deviation = Number(String(dash[1] || "").replace(".", ""));
    if (!isFinite(deviation)) return;

    let line = $("dashReasonStatus");
    if (!line){
      line = document.createElement("div");
      line.id = "dashReasonStatus";
      line.style.marginTop = "6px";
      line.style.fontWeight = "500";
      reasonEl.appendChild(line);
    }

    line.textContent = statusText(deviation);
  }

  function installDashStatusline(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_statusline_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashStatusline(); } catch(e){}
        return ret;
      };
      window.__sf_statusline_patch_wrapped = true;
    }

    setTimeout(() => { renderDashStatusline().catch(()=>{}); }, 350);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashStatusline);
  } else {
    installDashStatusline();
  }
})();

/* ===== DASH RISK PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function parseKrText(txt){
    const raw = String(txt || "").replace(/[^\d\-\.]/g, "");
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, ""));
  }

  function riskText(deviation, availableNow, expectedEnd){
    const day = new Date().getDate();

    if (!isFinite(deviation)) return "Risikoperiode: ukendt";

    if (deviation <= -5000) return "Risikoperiode: høj";
    if (deviation <= -1500 && day >= 20) return "Risikoperiode: sidst på måneden";
    if (deviation <= -1500 && day >= 10) return "Risikoperiode: midt på måneden";
    if (deviation <= -1500) return "Risikoperiode: moderat";

    if (isFinite(availableNow) && availableNow < 2000 && day >= 20) {
      return "Risikoperiode: sidst på måneden";
    }

    if (isFinite(expectedEnd) && expectedEnd < 0) {
      return "Risikoperiode: forhøjet";
    }

    return "Risikoperiode: lav";
  }

  async function renderDashRisk(){
    const el = $("dashRisk");
    if (!el) return;

    const txt = String(document.body.innerText || "");

    const dev = txt.match(/Afvigelse:\s*(-?[0-9\.]+)/);
    const avail = txt.match(/Til rådighed nu\s*([0-9\.]+)/);
    const end = txt.match(/Forventet slut:\s*([0-9\.]+)/);

    const deviation = dev ? Number(String(dev[1] || "").replace(/\./g, "")) : NaN;
    const availableNow = avail ? Number(String(avail[1] || "").replace(/\./g, "")) : NaN;
    const expectedEnd = end ? Number(String(end[1] || "").replace(/\./g, "")) : NaN;

    el.textContent = riskText(deviation, availableNow, expectedEnd);
  }

  
  function installDashRisk(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_risk_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashRisk(); } catch(e){}
        return ret;
      };
      window.__sf_risk_patch_wrapped = true;
    }

    setTimeout(() => { renderDashRisk().catch(()=>{}); }, 400);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashRisk);
  } else {
    installDashRisk();
  }
})();

/* ===== DASH DAILY BUDGET PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function parseKrText(txt){
    const raw = String(txt || "").replace(/[^\d\-\.]/g, "");
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, ""));
  }

  function daysLeftInMonth(){
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const lastDay = new Date(y, m + 1, 0).getDate();
    return Math.max(1, lastDay - d + 1);
  }

  function fmtKrDaily(n){
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return Math.round(v).toLocaleString("da-DK") + " kr/dag";
  }

  async function renderDashDailyBudget(){
    const el = $("dashDaily");
    if (!el) return;

    const txt = String(document.body.innerText || "");
    const avail = txt.match(/Til rådighed nu\s*([0-9\.\-]+)/);

    const availableNow = avail ? Number(String(avail[1] || "").replace(/\./g, "")) : NaN;
    if (!isFinite(availableNow)) {
      el.textContent = "Dagsbudget resten af måneden: —";
      return;
    }

    const daysLeft = daysLeftInMonth();
    const perDay = availableNow / daysLeft;

    el.textContent = "Dagsbudget resten af måneden: " + fmtKrDaily(perDay);
  }

  function installDashDailyBudget(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_daily_budget_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashDailyBudget(); } catch(e){}
        return ret;
      };
      window.__sf_daily_budget_patch_wrapped = true;
    }

    setTimeout(() => { renderDashDailyBudget().catch(()=>{}); }, 450);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashDailyBudget);
  } else {
    installDashDailyBudget();
  }
})();

/* ===== DASH PRESSURE PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function parseKrLoose(txt){
    const raw = String(txt || "").replace(/[^\d\-\.]/g, "");
    if (!raw) return NaN;
    return Number(raw.replace(/\./g, ""));
  }

  function pressureText(perDay, deviation){
    const day = new Date().getDate();
    let score = 0;

    if (isFinite(perDay)){
      if (perDay < 75) score += 3;
      else if (perDay < 150) score += 2;
      else if (perDay < 250) score += 1;
    }

    if (isFinite(deviation)){
      if (deviation <= -5000) score += 3;
      else if (deviation <= -1500) score += 2;
      else if (deviation < 0) score += 1;
    }

    if (day >= 20) score += 1;
    if (day >= 25) score += 1;

    if (score >= 5) return "Økonomisk pres: høj";
    if (score >= 3) return "Økonomisk pres: moderat";
    return "Økonomisk pres: lav";
  }

  async function renderDashPressure(){
    const el = $("dashPressure");
    if (!el) return;

    const txt = String(document.body.innerText || "");

    const daily = txt.match(/Dagsbudget resten af måneden:\s*(-?[0-9\.]+)/);
    const dev = txt.match(/Afvigelse:\s*(-?[0-9\.]+)/);

    const perDay = daily ? Number(String(daily[1] || "").replace(/\./g, "")) : NaN;
    const deviation = dev ? Number(String(dev[1] || "").replace(/\./g, "")) : NaN;

    el.textContent = pressureText(perDay, deviation);
  }

  function installDashPressure(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_pressure_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashPressure(); } catch(e){}
        return ret;
      };
      window.__sf_pressure_patch_wrapped = true;
    }

    setTimeout(() => { renderDashPressure().catch(()=>{}); }, 500);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashPressure);
  } else {
    installDashPressure();
  }
})();

/* ===== DAYS MONEY LAST PATCH ===== */

(function(){

function daysLeftInMonth(){
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const last = new Date(y, m+1, 0).getDate();
  return last - d + 1;
}

async function renderDashDays(){

  const el = document.getElementById("dashDaysLeft");
  if(!el) return;

  const txt = document.body.innerText;

  const avail = txt.match(/Til rådighed nu\s*([0-9\.]+)/);

  if(!avail){
    el.textContent = "Pengene holder: ukendt";
    return;
  }

  const money = Number(avail[1].replace(/\./g,""));

  const daily = txt.match(/Dagsbudget resten af måneden:\s*([0-9\.]+)/);

  if(!daily){
    el.textContent = "Pengene holder: ukendt";
    return;
  }

  const perDay = Number(daily[1].replace(/\./g,""));

  if(!perDay || !isFinite(perDay)){
    el.textContent = "Pengene holder: ukendt";
    return;
  }

  const days = Math.floor(money / perDay);

  el.textContent = "Pengene holder ca.: " + days + " dage";
}

function installDaysPatch(){

  const orig = window.renderDash;

  if(typeof orig === "function" && !window.__sf_days_patch){

    window.renderDash = async function(){

      const r = await orig.apply(this,arguments);

      try{ await renderDashDays(); }catch(e){}

      return r;

    };

    window.__sf_days_patch = true;

  }

  setTimeout(()=>renderDashDays(),500);

}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",installDaysPatch);
}else{
  installDaysPatch();
}

})();

/* ===== RISK PERIOD PATCH ===== */

(function(){

function riskPeriod(){

  const day = new Date().getDate();

  if(day <= 7) return "lav";
  if(day <= 15) return "moderat";
  if(day <= 23) return "moderat";

  return "høj";

}

async function renderDashRiskPeriod(){

  const el = document.getElementById("dashRisk");

  if(!el) return;

  const txt = "Risikoperiode: " + riskPeriod();

  el.textContent = txt;

}

function installRiskPatch(){

  const orig = window.renderDash;

  if(typeof orig === "function" && !window.__sf_risk_patch){

    window.renderDash = async function(){

      const r = await orig.apply(this,arguments);

      try{ await renderDashRiskPeriod(); }catch(e){}

      return r;

    };

    window.__sf_risk_patch = true;

  }

  setTimeout(()=>renderDashRiskPeriod(),500);

}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",installRiskPatch);
}else{
  installRiskPatch();
}

})();

/* ===== DASH TEMPO PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function fmtKrTempo(n){
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return Math.round(v).toLocaleString("da-DK") + " kr/dag";
  }

  function parsePlannedPerDay(){
    const txt = String(document.body.innerText || "");
    const m = txt.match(/Dagsbudget resten af måneden:\s*(-?[0-9\.]+)/);
    return m ? Number(String(m[1] || "").replace(/\./g, "")) : NaN;
  }

  function daysBetween(a, b){
    const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
    return Math.max(1, Math.round(ms / 86400000));
  }

  async function fetchTempoEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  async function renderDashTempo(){
    const tempoEl = $("dashTempo");
    const vsEl = $("dashTempoVsPlan");
    if (!tempoEl || !vsEl) return;

    try{
      const events = await fetchTempoEvents();
      const checkins = events.filter(e => e && e.type === "checkin" && e.ts && isFinite(Number(e.balance_now)));

      if (checkins.length < 2){
        tempoEl.textContent = "Tempo sidste 7 dage: ukendt";
        vsEl.textContent = "Tempo vs plan: ukendt";
        return;
      }

      const now = new Date();
      const recent = checkins.filter(e => {
        const d = new Date(e.ts);
        const ageDays = (now.getTime() - d.getTime()) / 86400000;
        return ageDays <= 7;
      });

      const arr = (recent.length >= 2 ? recent : checkins).slice().sort((a,b) => String(a.ts).localeCompare(String(b.ts)));
      if (arr.length < 2){
        tempoEl.textContent = "Tempo sidste 7 dage: ukendt";
        vsEl.textContent = "Tempo vs plan: ukendt";
        return;
      }

      const first = arr[0];
      const last = arr[arr.length - 1];

      const firstBal = Number(first.balance_now || 0);
      const lastBal = Number(last.balance_now || 0);
      const spanDays = daysBetween(first.ts, last.ts);

      // positivt tal = penge forsvinder pr dag
      let pace = (firstBal - lastBal) / spanDays;
      if (pace < 0) pace = 0;

      tempoEl.textContent = "Tempo sidste 7 dage: " + fmtKrTempo(pace);

      const planned = parsePlannedPerDay();
      if (!isFinite(planned) || planned <= 0 || !isFinite(pace)){
        vsEl.textContent = "Tempo vs plan: ukendt";
        return;
      }

      if (pace > planned * 1.1){
        vsEl.textContent = "Tempo vs plan: over plan";
      } else if (pace < planned * 0.9){
        vsEl.textContent = "Tempo vs plan: under plan";
      } else {
        vsEl.textContent = "Tempo vs plan: på plan";
      }

    }catch(e){
      tempoEl.textContent = "Tempo sidste 7 dage: ukendt";
      vsEl.textContent = "Tempo vs plan: ukendt";
    }
  }

  function installDashTempo(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_tempo_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashTempo(); } catch(e){}
        return ret;
      };
      window.__sf_tempo_patch_wrapped = true;
    }

    setTimeout(() => { renderDashTempo().catch(()=>{}); }, 550);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashTempo);
  } else {
    installDashTempo();
  }
})();

/* ===== DASH PRESSURE ZONE PATCH v2 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function fetchPressureZoneEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  function eventKey(e){
    return [
      String(e?.type || ""),
      String(e?.ts || ""),
      String(e?.amount ?? ""),
      String(e?.label || "")
    ].join("|");
  }

  function parseDay(ts){
    if (!ts) return NaN;
    const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return NaN;
    return Number(m[3]);
  }

  function buildPressureZone(events){
    const relevant = (events || []).filter(e =>
      e &&
      (e.type === "surprise" || e.type === "extra-save") &&
      e.ts
    );

    const seen = new Set();
    const unique = [];
    for (const e of relevant){
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(e);
    }

    const days = unique
      .map(e => parseDay(e.ts))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 31)
      .sort((a,b) => a - b);

    if (days.length < 3){
      return "Typisk trykzone: endnu for lidt data";
    }

    const counts = {};
    for (const d of days) counts[d] = (counts[d] || 0) + 1;

    const sortedDays = Object.keys(counts)
      .map(Number)
      .sort((a,b) => a - b);

    let bestStart = sortedDays[0];
    let bestEnd = sortedDays[0];
    let bestScore = counts[sortedDays[0]] || 0;

    for (let i = 0; i < sortedDays.length; i++){
      let score = 0;
      for (let j = i; j < sortedDays.length; j++){
        const span = sortedDays[j] - sortedDays[i] + 1;
        if (span > 10) break; // hold zonen smal
        score += counts[sortedDays[j]] || 0;
        if (score > bestScore){
          bestScore = score;
          bestStart = sortedDays[i];
          bestEnd = sortedDays[j];
        }
      }
    }

    if (bestStart === bestEnd){
      return "Typisk trykzone: omkring dag " + bestStart;
    }

    return "Typisk trykzone: dag " + bestStart + "-" + bestEnd;
  }

  async function renderDashPressureZone(){
    const el = $("dashPressureZone");
    if (!el) return;

    try{
      const events = await fetchPressureZoneEvents();
      el.textContent = buildPressureZone(events);
    }catch(e){
      el.textContent = "Typisk trykzone: ukendt";
    }
  }

  function installDashPressureZone(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_pressure_zone_patch_wrapped_v2){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashPressureZone(); } catch(e){}
        return ret;
      };
      window.__sf_pressure_zone_patch_wrapped_v2 = true;
    }

    setTimeout(() => { renderDashPressureZone().catch(()=>{}); }, 700);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashPressureZone);
  } else {
    installDashPressureZone();
  }
})();

/* ===== DASH NEXT PRESSURE ZONE PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function parsePressureZoneText(txt){
    const s = String(txt || "");

    let m = s.match(/dag\s+(\d+)-(\d+)/i);
    if (m){
      return { start: Number(m[1]), end: Number(m[2]) };
    }

    m = s.match(/omkring dag\s+(\d+)/i);
    if (m){
      const d = Number(m[1]);
      return { start: d, end: d };
    }

    return null;
  }

  function daysUntilDayOfMonth(targetDay){
    const now = new Date();
    const today = now.getDate();

    if (targetDay === today) return 0;
    if (targetDay > today) return targetDay - today;

    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return (lastDay - today) + targetDay;
  }

  function nextPressureZoneText(zone){
    if (!zone || !Number.isFinite(zone.start) || !Number.isFinite(zone.end)){
      return "Næste trykzone: ukendt";
    }

    const today = new Date().getDate();

    if (today >= zone.start && today <= zone.end){
      return "Næste trykzone: du er i typisk trykzone nu";
    }

    const days = daysUntilDayOfMonth(zone.start);

    if (days === 0){
      return "Næste trykzone: starter i dag";
    }
    if (days === 1){
      return "Næste trykzone: starter om 1 dag";
    }

    return "Næste trykzone: starter om " + days + " dage";
  }

  async function renderDashNextPressureZone(){
    const el = $("dashNextPressureZone");
    const zoneEl = $("dashPressureZone");
    if (!el || !zoneEl) return;

    const zone = parsePressureZoneText(zoneEl.textContent);
    el.textContent = nextPressureZoneText(zone);
  }

  function installDashNextPressureZone(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_next_pressure_zone_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashNextPressureZone(); } catch(e){}
        return ret;
      };
      window.__sf_next_pressure_zone_patch_wrapped = true;
    }

    setTimeout(() => { renderDashNextPressureZone().catch(()=>{}); }, 800);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashNextPressureZone);
  } else {
    installDashNextPressureZone();
  }
})();

/* ===== DASH RHYTHM + REALISTIC END PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function fmtKr(n){
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return Math.round(v).toLocaleString("da-DK") + " kr";
  }

  function parseKrFromText(label){
    const txt = String(document.body.innerText || "");
    const re = new RegExp(label + "\\s*:?\\s*(-?[0-9\\.]+)", "i");
    const m = txt.match(re);
    return m ? Number(String(m[1] || "").replace(/\./g, "")) : NaN;
  }

  function phaseOfMonth(day){
    if (day <= 10) return "tidlig måned";
    if (day <= 20) return "midt på måneden";
    return "sen måned";
  }

  function isWeekendFromTs(ts){
    const d = new Date(ts);
    const wd = d.getDay();
    return wd === 0 || wd === 6;
  }

  function amountOf(e){
    return Number(e && e.amount != null ? e.amount : 0) || 0;
  }

  async function fetchRhythmEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  function dedupeEvents(events){
    const seen = new Set();
    const out = [];
    for (const e of (events || [])){
      const k = [
        String(e?.type || ""),
        String(e?.ts || ""),
        String(e?.amount ?? ""),
        String(e?.label || "")
      ].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  function analyseRhythm(events){
    const relevant = dedupeEvents((events || []).filter(e =>
      e && e.ts && (e.type === "surprise" || e.type === "extra-save")
    ));

    if (relevant.length < 4){
      return {
        text: "Rytme: endnu for lidt data",
        adjustment: 0
      };
    }

    let weekendPressure = 0;
    let weekdayPressure = 0;

    const phasePressure = {
      "tidlig måned": 0,
      "midt på måneden": 0,
      "sen måned": 0
    };

    for (const e of relevant){
      const d = new Date(e.ts);
      const day = d.getDate();
      const phase = phaseOfMonth(day);

      // surprise = pres, extra-save = modvægt
      let weight = 0;
      if (e.type === "surprise") weight = Math.abs(amountOf(e));
      if (e.type === "extra-save") weight = -Math.abs(amountOf(e));

      phasePressure[phase] += weight;

      if (isWeekendFromTs(e.ts)) weekendPressure += weight;
      else weekdayPressure += weight;
    }

    const phaseSorted = Object.entries(phasePressure).sort((a,b) => b[1] - a[1]);
    const topPhase = phaseSorted[0][0];

    let rhythmBits = [];
    if (weekendPressure > weekdayPressure * 1.15){
      rhythmBits.push("pres typisk i weekend");
    } else if (weekdayPressure > weekendPressure * 1.15){
      rhythmBits.push("pres typisk på hverdage");
    }

    rhythmBits.push(topPhase);

    const rhythmText = "Rytme: " + rhythmBits.join(" · ");

    // Justering til realistisk slutsaldo:
    // hvis vi historisk har mere surprise end extra-save i den aktuelle fase,
    // så trækker vi lidt ekstra fra forventet slut.
    const nowDay = new Date().getDate();
    const nowPhase = phaseOfMonth(nowDay);
    const phaseAdjRaw = Number(phasePressure[nowPhase] || 0);

    // Dæmp justering så den ikke bliver hysterisk
    const adjustment = Math.max(-3000, Math.min(3000, -phaseAdjRaw * 0.25));

    return {
      text: rhythmText,
      adjustment
    };
  }

  async function renderDashRhythm(){
    const rhythmEl = $("dashRhythm");
    const realisticEl = $("dashRealisticEnd");
    if (!rhythmEl || !realisticEl) return;

    try{
      const events = await fetchRhythmEvents();
      const result = analyseRhythm(events);

      rhythmEl.textContent = result.text;

      const expectedEnd = parseKrFromText("Forventet slut");
      if (!isFinite(expectedEnd)){
        realisticEl.textContent = "Realistisk slut: ukendt";
        return;
      }

      const realisticEnd = expectedEnd + Number(result.adjustment || 0);
      realisticEl.textContent = "Realistisk slut: " + fmtKr(realisticEnd);
    }catch(e){
      rhythmEl.textContent = "Rytme: ukendt";
      realisticEl.textContent = "Realistisk slut: ukendt";
    }
  }

  function installDashRhythm(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_rhythm_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashRhythm(); } catch(e){}
        return ret;
      };
      window.__sf_rhythm_patch_wrapped = true;
    }

    setTimeout(() => { renderDashRhythm().catch(()=>{}); }, 900);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashRhythm);
  } else {
    installDashRhythm();
  }
})();

/* ===== DASH SHOCK CLASSIFIER PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function fetchShockEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  function eventKey(e){
    return [
      String(e?.type || ""),
      String(e?.ts || ""),
      String(e?.amount ?? ""),
      String(e?.label || "")
    ].join("|");
  }

  function dedupe(events){
    const seen = new Set();
    const out = [];
    for (const e of (events || [])){
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  function classifyShock(label, amount){
    const txt = String(label || "").toLowerCase().trim();
    const amt = Math.abs(Number(amount || 0));

    const necessaryWords = [
      "tandlæge", "dyrlæge", "medicin", "reparation", "dæk",
      "forsikring", "el", "varme", "læge", "værksted",
      "bil", "sommerdæk", "vinterdæk"
    ];

    const impulseWords = [
      "take-away", "takeaway", "kiosk", "bager", "café", "cafe",
      "restaurant", "shopping", "snacks", "wolt", "fastfood",
      "bolt", "burger", "pizza"
    ];

    for (const w of necessaryWords){
      if (txt.includes(w)) return "livsnødvendigt";
    }

    for (const w of impulseWords){
      if (txt.includes(w)) return "impuls";
    }

    if (amt >= 800) return "budgetfejl";
    if (amt > 0) return "uklar";

    return "ingen";
  }

  function evaluateShock(kind, amount){
    const amt = Math.abs(Number(amount || 0));

    if (kind === "livsnødvendigt"){
      if (amt >= 1000) return "Chokvurdering: livsnødvendigt chok – buffer relevant";
      return "Chokvurdering: nødvendig udgift";
    }

    if (kind === "impuls"){
      if (amt >= 500) return "Chokvurdering: impuls – tydelig adfærdsrisiko";
      return "Chokvurdering: mindre impuls";
    }

    if (kind === "budgetfejl"){
      return "Chokvurdering: budgetfejl sandsynlig";
    }

    if (kind === "uklar"){
      return "Chokvurdering: kræver bedre label";
    }

    return "Chokvurdering: ingen";
  }

  async function renderDashShockClassifier(){
    const typeEl = $("dashShockType");
    const evalEl = $("dashShockEval");
    if (!typeEl || !evalEl) return;

    try{
      const events = dedupe(await fetchShockEvents());
      const shocks = events
        .filter(e => e && e.type === "surprise" && e.ts)
        .sort((a,b) => String(a.ts).localeCompare(String(b.ts)));

      if (!shocks.length){
        typeEl.textContent = "Seneste choktype: ingen";
        evalEl.textContent = "Chokvurdering: ingen";
        return;
      }

      const last = shocks[shocks.length - 1];
      const label = String(last.label || "");
      const amount = Number(last.amount || 0);
      const kind = classifyShock(label, amount);

      typeEl.textContent = "Seneste choktype: " + kind;
      evalEl.textContent = evaluateShock(kind, amount);
    }catch(e){
      typeEl.textContent = "Seneste choktype: ukendt";
      evalEl.textContent = "Chokvurdering: ukendt";
    }
  }

  function installDashShockClassifier(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_shock_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderDashShockClassifier(); } catch(e){}
        return ret;
      };
      window.__sf_shock_patch_wrapped = true;
    }

    setTimeout(() => { renderDashShockClassifier().catch(()=>{}); }, 1000);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDashShockClassifier);
  } else {
    installDashShockClassifier();
  }
})();

/* ===== FIRST MONTH MODE PATCH v1 ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function fetchFirstMonthEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  function setTextIf(id, text){
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setFirstMonthUi(events){
    const all = Array.isArray(events) ? events : [];
    const checkins = all.filter(e => e && e.type === "checkin");
    const surprises = all.filter(e => e && e.type === "surprise");
    const extra = all.filter(e => e && e.type === "extra-save");

    const firstMonth =
      all.length === 0 ||
      checkins.length < 2 ||
      (surprises.length + extra.length) < 2;

    const banner = $("dashFirstMonth");
    if (!banner) return;

    if (!firstMonth){
      banner.textContent = "";
      return;
    }

    banner.textContent = "Første måned: systemet lærer stadig din økonomi.";

    if (checkins.length < 2){
      setTextIf("dashTempo", "Tempo sidste 7 dage: vises når der er mindst 2 check-ins");
      setTextIf("dashTempoVsPlan", "Tempo vs plan: vises når der er historik");
    }

    if ((surprises.length + extra.length) < 2){
      setTextIf("dashPressureZone", "Typisk trykzone: vises når der er nok hændelser");
      setTextIf("dashNextPressureZone", "Næste trykzone: vises når mønstre findes");
      setTextIf("dashRhythm", "Rytme: vises når adfærdsmønstre kan aflæses");
      setTextIf("dashShockType", "Seneste choktype: vises når der er reelle hændelser");
      setTextIf("dashShockEval", "Chokvurdering: vises når der er reelle hændelser");
    }

    // realistisk slut skal ikke lade som om den kender din rytme endnu
    setTextIf("dashRealisticEnd", "Realistisk slut: vises når historik findes");
  }

  async function renderFirstMonthMode(){
    try{
      const events = await fetchFirstMonthEvents();
      setFirstMonthUi(events);
    }catch(e){
      const banner = $("dashFirstMonth");
      if (banner) banner.textContent = "Første måned: systemet lærer stadig din økonomi.";
    }
  }

  function installFirstMonthMode(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_first_month_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderFirstMonthMode(); } catch(e){}
        return ret;
      };
      window.__sf_first_month_patch_wrapped = true;
    }

    setTimeout(() => { renderFirstMonthMode().catch(()=>{}); }, 1100);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installFirstMonthMode);
  } else {
    installFirstMonthMode();
  }
})();

/* ===== RO MODE UI PATCH v1 ===== */
(function(){
  const ADVANCED_IDS = [
    "dashMeta",
    "dashReason",
    "dashStatusText",
    "dashRisk",
    "dashPressure",
    "dashDaysLeft",
    "dashTempo",
    "dashTempoVsPlan",
    "dashPressureZone",
    "dashNextPressureZone",
    "dashRhythm",
    "dashRealisticEnd",
    "dashShockType",
    "dashShockEval"
  ];

  const PRIMARY_IDS = [
    "dashAvailable",
    "dashExpectedEnd",
    "dashDeviation",
    "dashDaily",
    "dashFirstMonth"
  ];

  function ensureRoModeCss(){
    if (document.getElementById("roModeCss")) return;

    const style = document.createElement("style");
    style.id = "roModeCss";
    style.textContent = `
      .dash-advanced-line{ display:none; }
      body.sf-advanced-open .dash-advanced-line{ display:block; }
      .dash-primary-line{ display:block; }
    `;
    document.head.appendChild(style);
  }

  function markDashboardLines(){
    ensureRoModeCss();

    for (const id of ADVANCED_IDS){
      const el = document.getElementById(id);
      if (el) el.classList.add("dash-advanced-line");
    }

    for (const id of PRIMARY_IDS){
      const el = document.getElementById(id);
      if (el) el.classList.add("dash-primary-line");
    }
  }

  function applyRoModeState(){
    const btn = document.getElementById("btnToggleAdvanced");
    const open = document.body.classList.contains("sf-advanced-open");

    if (btn){
      btn.textContent = open ? "Skjul avanceret" : "Vis avanceret";
    }
  }

  function wireRoModeButton(){
    const btn = document.getElementById("btnToggleAdvanced");
    if (!btn || btn.dataset.roModeBound === "1") return;

    btn.dataset.roModeBound = "1";
    btn.addEventListener("click", function(){
      document.body.classList.toggle("sf-advanced-open");
      applyRoModeState();
    });

    document.body.classList.remove("sf-advanced-open");
    applyRoModeState();
  }

  async function installRoMode(){
    markDashboardLines();
    wireRoModeButton();
    applyRoModeState();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installRoMode);
  } else {
    installRoMode();
  }

  const original = window.renderDash;
  if (typeof original === "function" && !window.__sf_ro_mode_wrapped){
    window.renderDash = async function(){
      const ret = await original.apply(this, arguments);
      try{
        markDashboardLines();
        wireRoModeButton();
        applyRoModeState();
      }catch(e){}
      return ret;
    };
    window.__sf_ro_mode_wrapped = true;
  }
})();


/* ===== EXPECTED LINE FIX v2 ===== */
(function(){
  function renderExpectedLine(){
    const end = document.getElementById("dashExpectedEnd");
    const dev = document.getElementById("dashDeviation");
    if (!end || !dev) return;

    let line = document.getElementById("dashExpectedLine");
    if (!line){
      line = document.createElement("div");
      line.id = "dashExpectedLine";
      line.className = "small";
      line.style.marginTop = "6px";

      const host = end.parentNode;
      if (host) host.insertBefore(line, end);
    }

    line.textContent = "Forventet slut: " + (end.textContent || "—") + " · Afvigelse: " + (dev.textContent || "—");

    end.style.display = "none";
    dev.style.display = "none";

    const txt = end.parentNode;
    if (txt){
      const html = txt.innerHTML;
      txt.innerHTML = txt.innerHTML
        .replace(/Forventet slut:\s*<b id="dashExpectedEnd"[^>]*>.*?<\/b>\s*·\s*Afvigelse:\s*<b id="dashDeviation"[^>]*>.*?<\/b>/, "");
      const movedLine = document.getElementById("dashExpectedLine");
      if (!movedLine && line) txt.prepend(line);
    }
  }

  function installExpectedLineFix(){
    renderExpectedLine();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installExpectedLineFix);
  } else {
    installExpectedLineFix();
  }

  const original = window.renderDash;
  if (typeof original === "function" && !window.__sf_expected_patch_v2){
    window.renderDash = async function(){
      const ret = await original.apply(this, arguments);
      try{ renderExpectedLine(); }catch(e){}
      return ret;
    };
    window.__sf_expected_patch_v2 = true;
  }
})();

/* ===== CLEAN EXPECTED LINE ===== */
(function(){

  function updateExpectedLine(expected, deviation){
    const el = document.getElementById("dashExpectedLine");
    if (!el) return;

    el.textContent =
      "Forventet slut: " + expected +
      " · Afvigelse: " + deviation;
  }

  const orig = window.renderDash;
  if (typeof orig === "function" && !window.__sf_expected_clean){

    window.renderDash = async function(){
      const r = await orig.apply(this, arguments);

      const end = document.getElementById("dashExpectedEnd");
      const dev = document.getElementById("dashDeviation");

      if (end && dev){
        updateExpectedLine(end.textContent, dev.textContent);
      }

      return r;
    };

    window.__sf_expected_clean = true;
  }

})();

/* ===== PRESSURE ZONE DETECTOR ===== */

function detectPressureZone(events){

  const days = [];

  for (const e of events){
    if (e.type !== "surprise") continue;
    if (typeof e.amount !== "number") continue;
    if (e.amount >= 0) continue;

    const d = new Date(e.ts);
    if (!isNaN(d)) days.push(d.getDate());
  }

  if (days.length < 5) return null;

  days.sort((a,b)=>a-b);

  let bestStart = null;
  let bestCount = 0;

  for (let i=0;i<days.length;i++){
    const start = days[i];
    const end = start + 3;

    const count = days.filter(x => x>=start && x<=end).length;

    if (count > bestCount){
      bestCount = count;
      bestStart = start;
    }
  }

  if (!bestStart) return null;

  return {
    start: bestStart,
    end: bestStart + 3,
    hits: bestCount
  };
}


/* ===== PRESSURE ZONE DETECTOR ===== */

function detectPressureZone(events){

  const days = [];

  for (const e of events){
    if (e.type !== "surprise") continue;
    if (typeof e.amount !== "number") continue;
    if (e.amount >= 0) continue;

    const d = new Date(e.ts);
    if (!isNaN(d)) days.push(d.getDate());
  }

  if (days.length < 5) return null;

  days.sort((a,b)=>a-b);

  let bestStart = null;
  let bestCount = 0;

  for (let i=0;i<days.length;i++){
    const start = days[i];
    const end = start + 3;

    const count = days.filter(x => x>=start && x<=end).length;

    if (count > bestCount){
      bestCount = count;
      bestStart = start;
    }
  }

  if (!bestStart) return null;

  return {
    start: bestStart,
    end: bestStart + 3,
    hits: bestCount
  };
}


/* ===== CALM EMPTY STATE PATCH ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function fetchEmptyStateEvents(){
    const r = await fetch("/api/events");
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return Array.isArray(j.events) ? j.events : [];
  }

  function ensureCalmStateLine(){
    let el = $("dashCalmState");
    if (!el){
      el = document.createElement("div");
      el.id = "dashCalmState";
      el.className = "small";
      el.style.marginTop = "8px";

      const anchor = $("dashFirstMonth");
      if (anchor && anchor.parentNode){
        anchor.parentNode.insertBefore(el, anchor.nextSibling);
      }
    }
    return el;
  }

  function setVisible(id, on){
    const el = $(id);
    if (el) el.style.display = on ? "" : "none";
  }

  function applyCalmEmptyState(events){
    const all = Array.isArray(events) ? events : [];
    const realSignals = all.filter(e =>
      e && (e.type === "surprise" || e.type === "extra-save")
    );

    const calmEl = ensureCalmStateLine();
    if (!calmEl) return;

    const noSignalsYet = realSignals.length === 0;

    if (!noSignalsYet){
      calmEl.textContent = "";
      calmEl.style.display = "none";

      setVisible("dashPressureZone", true);
      setVisible("dashNextPressureZone", true);
      setVisible("dashRhythm", true);
      setVisible("dashRealisticEnd", true);
      setVisible("dashShockType", true);
      setVisible("dashShockEval", true);
      return;
    }

    calmEl.style.display = "";
    calmEl.innerHTML = "Ingen chok registreret endnu.<br>Systemet lærer din økonomiske rytme.";

    setVisible("dashPressureZone", false);
    setVisible("dashNextPressureZone", false);
    setVisible("dashRhythm", false);
    setVisible("dashRealisticEnd", false);
    setVisible("dashShockType", false);
    setVisible("dashShockEval", false);
  }

  async function renderCalmEmptyState(){
    try{
      const events = await fetchEmptyStateEvents();
      applyCalmEmptyState(events);
    }catch(e){}
  }

  function installCalmEmptyState(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_calm_empty_state_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderCalmEmptyState(); } catch(e){}
        return ret;
      };
      window.__sf_calm_empty_state_wrapped = true;
    }

    setTimeout(() => { renderCalmEmptyState().catch(()=>{}); }, 1200);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installCalmEmptyState);
  } else {
    installCalmEmptyState();
  }
})();

/* ===== ECONOMIC WEATHER PATCH ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function textNumAfter(label){
    const txt = String(document.body.innerText || "");
    const re = new RegExp(label + "\\s*:?\\s*(-?[0-9\\.]+)", "i");
    const m = txt.match(re);
    if (!m) return NaN;
    return Number(String(m[1] || "").replace(/\./g, ""));
  }

  function remainingDaysInMonth(){
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(0, last - now.getDate());
  }

  function weatherText({daysLeftMoney, remainingDays, dailyBudget, firstMonth}){
    if (firstMonth){
      if (Number.isFinite(daysLeftMoney) && daysLeftMoney < remainingDays - 2){
        return "Økonomisk vejrudsigt: let pres";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
      }
      return "Økonomisk vejrudsigt: rolig";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
    }

    if (Number.isFinite(daysLeftMoney) && daysLeftMoney < remainingDays - 5){
      return "Økonomisk vejrudsigt: stram måned";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
    }

    if (Number.isFinite(daysLeftMoney) && daysLeftMoney < remainingDays - 1){
      return "Økonomisk vejrudsigt: pres om få dage";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
    }

    if (Number.isFinite(dailyBudget) && dailyBudget <= 150){
      return "Økonomisk vejrudsigt: let pres";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
    }

    return "Økonomisk vejrudsigt: rolig";
  let guidance="";
  if(weather==="rolig"){guidance="Hold kursen.";}
  else if(weather==="skyer"){guidance="Hold lidt igen de næste dage.";}
  else if(weather==="blæst"){guidance="Pas på forbruget i denne periode.";}
  else if(weather==="storm"){guidance="Stram økonomien midlertidigt.";}
  setText("dashGuidance", guidance);
  }

  function renderWeatherLine(){
    const el = $("dashWeather");
    if (!el) return;

    const firstMonthTxt = $("dashFirstMonth")?.textContent || "";
    const firstMonth = /første måned/i.test(firstMonthTxt);

    const dailyBudget = textNumAfter("Dagsbudget resten af måneden");
    const daysLeftMoney = textNumAfter("Pengene holder ca");
    const remainingDays = remainingDaysInMonth();

    el.textContent = weatherText({
      daysLeftMoney,
      remainingDays,
      dailyBudget,
      firstMonth
    });
  }

  function installWeatherPatch(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_weather_patch_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { renderWeatherLine(); } catch(e){}
        return ret;
      };
      window.__sf_weather_patch_wrapped = true;
    }

    setTimeout(() => { try{ renderWeatherLine(); }catch(e){} }, 1300);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installWeatherPatch);
  } else {
    installWeatherPatch();
  }
})();

/* ===== DAYS TOP PATCH ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  function textNumAfterLabel(label){
    const txt = String(document.body.innerText || "");
    const re = new RegExp(label + "\\s*:?\\s*(-?[0-9\\.]+)", "i");
    const m = txt.match(re);
    if (!m) return NaN;
    return Number(String(m[1] || "").replace(/\./g, ""));
  }

  function renderDaysTop(){
    const el = $("dashDaysTop");
    if (!el) return;

    const days = textNumAfterLabel("Pengene holder ca");
    if (!Number.isFinite(days) || days <= 0){
      el.textContent = "";
      return;
    }

    el.textContent = "Rækker cirka: " + days + " dage";
  }

  function installDaysTop(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_days_top_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { renderDaysTop(); } catch(e){}
        return ret;
      };
      window.__sf_days_top_wrapped = true;
    }

    setTimeout(() => { try{ renderDaysTop(); }catch(e){} }, 1400);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installDaysTop);
  } else {
    installDaysTop();
  }
})();

/* ===== STRATEGY V2 EVALUATOR ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function sfApiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  function sfNumFromBody(label){
    const txt = String(document.body.innerText || "");
    const re = new RegExp(label + "\\s*:?\\s*(-?[0-9\\.]+)", "i");
    const m = txt.match(re);
    if (!m) return NaN;
    return Number(String(m[1] || "").replace(/\./g, ""));
  }

  function sfRemainingDaysInMonth(){
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(0, last - now.getDate());
  }

  function sfSeverityRank(status){
    if (status === "følger planen") return 1;
    if (status === "mindre afvigelse") return 2;
    if (status === "under pres") return 3;
    if (status === "ikke realistisk lige nu") return 4;
    return 0;
  }

  function sfWorstStatus(results){
    if (!Array.isArray(results) || !results.length) return "ukendt";
    let worst = results[0].status || "ukendt";
    for (const r of results){
      if (sfSeverityRank(r.status) > sfSeverityRank(worst)) worst = r.status;
    }
    return worst;
  }

  function sfOverallText(status){
    if (status === "følger planen") return "Din nuværende strategi holder.";
    if (status === "mindre afvigelse") return "Din strategi holder, men med mindre afvigelser.";
    if (status === "under pres") return "Din nuværende strategi er under pres.";
    if (status === "ikke realistisk lige nu") return "Din nuværende strategi er ikke realistisk lige nu.";
    return "Ingen strategivurdering endnu.";
  }

  function sfOverallAdvice(status, results){
    const firstAdvice = (Array.isArray(results) ? results.find(x => x && x.advice) : null)?.advice;
    if (firstAdvice) return firstAdvice;
    if (status === "følger planen") return "Hold kursen.";
    if (status === "mindre afvigelse") return "Hold lidt igen de næste dage.";
    if (status === "under pres") return "Juster strategien eller sænk presset denne måned.";
    if (status === "ikke realistisk lige nu") return "Skift til en mere defensiv måned eller juster strategien.";
    return "Lav et check-in for at vurdere dine aktive strategier.";
  }

  function sfEvaluateStrategies(finance, ctx){
    const strategies = Array.isArray(finance?.strategies)
      ? finance.strategies.filter(s => s && s.enabled)
      : [];

    const results = [];

    for (const s of strategies){
      const id = String(s.id || "");
      const cfg = s.config || {};

      if (id === "buffer_first"){
        const target = Number(cfg.monthly_target ?? 2000);
        const minDaily = 180;
        const extraSave = Number(ctx.extraSaveTotal ?? 0);

        let status = "følger planen";
        let reason = "Du følger bufferstrategien denne måned.";
        let advice = "Hold kursen.";

        const dailyBudgetOk = Number.isFinite(ctx.dailyBudget) && ctx.dailyBudget >= minDaily;
        const monthStillHolds = Number.isFinite(ctx.daysLeftMoney) && Number.isFinite(ctx.remainingDays)
          ? ctx.daysLeftMoney >= (ctx.remainingDays - 1)
          : true;

        if (!dailyBudgetOk || !monthStillHolds){
          status = "under pres";
          reason = "Bufferstrategien gør måneden strammere end ønsket.";
          advice = "Sænk bufferbidrag midlertidigt eller vent til næste check-in.";
        } else if (extraSave <= 0){
          status = "mindre afvigelse";
          reason = "Bufferbidraget er ikke kommet i gang endnu, men måneden ser stadig stabil ud.";
          advice = "Du kan vente til næste check-in eller starte med et mindre bufferbidrag.";
        } else if (extraSave < target){
          status = "mindre afvigelse";
          reason = "Du sparer op, men under buffer-målet.";
          advice = "Hold kursen eller juster buffer-målet midlertidigt.";
        } else {
          status = "følger planen";
          reason = "Du følger bufferstrategien denne måned.";
          advice = "Hold kursen.";
        }

        results.push({ id, name: s.name, status, reason, advice });
        continue;
      }

      if (id === "no_debt_worsening"){
        let status = "følger planen";
        let reason = "Ingen tydelige tegn på ny gældsforværring.";
        let advice = "Hold kursen.";

        if (Number.isFinite(ctx.dailyBudget) && ctx.dailyBudget < 100){
          status = "under pres";
          reason = "Måneden er så stram, at gældsforværring kan blive en risiko.";
          advice = "Skær midlertidigt ned eller juster andre strategier.";
        }

        results.push({ id, name: s.name, status, reason, advice });
        continue;
      }

      if (id === "daily_floor"){
        const minDaily = Number(cfg.min_daily_budget ?? 180);
        let status = "følger planen";
        let reason = "Dagsbudgettet ligger over dit minimum.";
        let advice = "Hold kursen.";

        if (Number.isFinite(ctx.dailyBudget) && ctx.dailyBudget < (minDaily * 0.7)){
          status = "ikke realistisk lige nu";
          reason = "Dagsbudgettet er væsentligt under dit minimum.";
          advice = "Juster strategien eller skab mere luft i måneden.";
        } else if (Number.isFinite(ctx.dailyBudget) && ctx.dailyBudget < minDaily){
          status = "under pres";
          reason = "Dagsbudgettet er under dit ønskede minimum.";
          advice = "Hold igen nu eller sænk ambitionsniveauet i andre strategier.";
        } else if (Number.isFinite(ctx.dailyBudget) && ctx.dailyBudget < (minDaily + 25)){
          status = "mindre afvigelse";
          reason = "Dagsbudgettet er tæt på dit minimum.";
          advice = "Hold lidt igen de næste dage.";
        }

        results.push({ id, name: s.name, status, reason, advice });
        continue;
      }

      if (id === "monthly_progress"){
        const targetEnd = Number(cfg.target_end_balance ?? 0);
        let status = "følger planen";
        let reason = "Du er på vej mod dit månedlige mål.";
        let advice = "Hold kursen.";

        if (Number.isFinite(ctx.expectedEnd) && ctx.expectedEnd < targetEnd - 1500){
          status = "under pres";
          reason = "Forventet månedsslut ligger under målet.";
          advice = "Juster målet eller sænk presset denne måned.";
        } else if (Number.isFinite(ctx.expectedEnd) && ctx.expectedEnd < targetEnd){
          status = "mindre afvigelse";
          reason = "Du er lidt under dit mål for månedsslut.";
          advice = "Hold igen de næste dage eller acceptér en mindre afvigelse.";
        }

        results.push({ id, name: s.name, status, reason, advice });
      }
    }

    const overallStatus = sfWorstStatus(results);
    return {
      updated_at: new Date().toISOString().slice(0,10),
      overall_status: overallStatus,
      overall_text: sfOverallText(overallStatus),
      overall_advice: sfOverallAdvice(overallStatus, results),
      results
    };
  }

  async function sfRenderStrategyTop(){
    try{
      const finance = await sfApiJson("/api/finance");
      const eventsWrap = await sfApiJson("/api/events");
      const events = Array.isArray(eventsWrap?.events) ? eventsWrap.events : [];

      const dailyBudget = sfNumFromBody("Dagsbudget resten af måneden");
      const daysLeftMoney = sfNumFromBody("Pengene holder ca");
      const expectedEnd = sfNumFromBody("Forventet slut");
      const deviation = sfNumFromBody("Afvigelse");
      const remainingDays = sfRemainingDaysInMonth();

      const extraSaveTotal = events
        .filter(e => e && e.type === "extra-save")
        .reduce((a, e) => a + Number(e.amount || 0), 0);

      const ctx = {
        dailyBudget,
        daysLeftMoney,
        expectedEnd,
        deviation,
        remainingDays,
        extraSaveTotal
      };

      const strategyEval = sfEvaluateStrategies(finance, ctx);

      try{
        const dbg = document.getElementById("debugOut");
        if (dbg){
          dbg.textContent =
            "Init OK\n" +
            "CTX dailyBudget=" + String(ctx.dailyBudget) + "\n" +
            "CTX daysLeftMoney=" + String(ctx.daysLeftMoney) + "\n" +
            "CTX remainingDays=" + String(ctx.remainingDays) + "\n" +
            "CTX expectedEnd=" + String(ctx.expectedEnd) + "\n" +
            "CTX deviation=" + String(ctx.deviation) + "\n" +
            "CTX extraSaveTotal=" + String(ctx.extraSaveTotal) + "\n" +
            "Strategy overall=" + String(strategyEval.overall_status);
        }
      }catch(e){}

      finance.strategy_eval = strategyEval;
      try{
        await sfApiJson("/api/finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finance)
        });
      }catch(e){}

      const top = $("dashStrategyTop");
      const advice = $("dashStrategyAdvice");

      if (top) top.textContent = "Strategi: " + strategyEval.overall_text;
      if (advice) advice.textContent = "Anbefaling: " + strategyEval.overall_advice;

    }catch(e){
      const top = $("dashStrategyTop");
      const advice = $("dashStrategyAdvice");
      if (top) top.textContent = "";
      if (advice) advice.textContent = "";
    }
  }

  function sfInstallStrategyV2(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_strategy_v2_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await sfRenderStrategyTop(); } catch(e){}
        return ret;
      };
      window.__sf_strategy_v2_wrapped = true;
    }

    setTimeout(() => { sfRenderStrategyTop().catch(()=>{}); }, 1600);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", sfInstallStrategyV2);
  } else {
    sfInstallStrategyV2();
  }
})();

/* ===== STRATEGY HUMAN SUMMARY PATCH ===== */
(function(){
  const $ = (id) => document.getElementById(id);

  async function sfHumanApiJson(path, opts){
    const r = await fetch(path, opts || {});
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    if (!r.ok) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  function renderStrategyNames(finance){
    const strategies = Array.isArray(finance?.strategies) ? finance.strategies.filter(s => s && s.enabled) : [];
    return strategies.map(s => "• " + String(s.name || s.id || "Ukendt strategi")).join("\n");
  }

  async function renderHumanStrategySummary(){
    try{
      const finance = await sfHumanApiJson("/api/finance");
      const evalData = finance?.strategy_eval || {};

      const listEl = $("dashStrategyList");
      if (listEl){
        const names = renderStrategyNames(finance);
        listEl.style.whiteSpace = "pre-line";
        listEl.textContent = names ? ("Aktive strategier:\n" + names) : "";
      }
    }catch(e){
      const listEl = $("dashStrategyList");
      if (listEl) listEl.textContent = "";
    }
  }

  function installHumanStrategySummary(){
    const original = window.renderDash;

    if (typeof original === "function" && !window.__sf_strategy_human_summary_wrapped){
      window.renderDash = async function(){
        const ret = await original.apply(this, arguments);
        try { await renderHumanStrategySummary(); } catch(e){}
        return ret;
      };
      window.__sf_strategy_human_summary_wrapped = true;
    }

    setTimeout(() => { renderHumanStrategySummary().catch(()=>{}); }, 1800);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installHumanStrategySummary);
  } else {
    installHumanStrategySummary();
  }
})();
