"use strict";

/* ====================================================================
   Finanz-Manager — Frontend-Logik (Vanilla JS, kein Build-Schritt)
   Persistenz läuft über Tauri-Commands (Rust) -> lokale JSON-Datei.
   ==================================================================== */

const hasTauri = !!(window.__TAURI__ && window.__TAURI__.core);
const invoke = hasTauri
  ? window.__TAURI__.core.invoke
  : async () => { throw new Error("Tauri nicht verfügbar"); };

/* ---------- Stammdaten ---------- */
const EXPENSE_CATS = ["Wohnen", "Lebensmittel", "Transport", "Freizeit", "Gesundheit", "Shopping", "Abos", "Sonstiges"];
const INCOME_CATS  = ["Gehalt", "Nebenjob", "Erstattung", "Geschenk", "Sonstiges"];
const SUB_CATS     = ["Streaming", "Musik", "Software", "Cloud", "Fitness", "News", "Gaming", "Sonstiges"];

const CYCLES = {
  weekly:    { label: "Wöchentlich",     perMonth: 52 / 12 },
  monthly:   { label: "Monatlich",       perMonth: 1 },
  quarterly: { label: "Vierteljährlich", perMonth: 1 / 3 },
  yearly:    { label: "Jährlich",        perMonth: 1 / 12 },
};

const PAGES = {
  dashboard:     { title: "Übersicht",     sub: "Dein finanzieller Überblick" },
  transactions:  { title: "Buchungen",     sub: "Alle Einnahmen und Ausgaben" },
  subscriptions: { title: "Abos",          sub: "Wiederkehrende Zahlungen im Blick" },
  settings:      { title: "Einstellungen", sub: "App-Daten verwalten" },
};

/* ---------- App-Zustand ---------- */
let state = { transactions: [], subscriptions: [], initialized: false };
let txFilter = "all";

/* ---------- Helfer ---------- */
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const money = (n) => eur.format(Number(n) || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (iso) => String(iso).slice(0, 7);
const $ = (sel) => document.querySelector(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function parseAmount(v) {
  return Math.abs(parseFloat(String(v).replace(",", ".")) || 0);
}

function daysUntil(iso) {
  const target = new Date(iso + "T00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function colorFor(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(145deg, hsl(${h} 60% 60%), hsl(${(h + 40) % 360} 60% 48%))`;
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/** In-App-Bestätigungsdialog — gibt ein Promise<boolean> zurück. */
function confirmDialog(message, { title = "Bestätigen", confirmLabel = "Löschen" } = {}) {
  return new Promise((resolve) => {
    const dlg = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-msg").textContent = message;
    $("#confirm-yes").textContent = confirmLabel;

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      $("#confirm-yes").removeEventListener("click", onYes);
      $("#confirm-no").removeEventListener("click", onNo);
      dlg.removeEventListener("close", onClose);
      if (dlg.open) dlg.close();
      resolve(result);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onClose = () => finish(false);

    $("#confirm-yes").addEventListener("click", onYes);
    $("#confirm-no").addEventListener("click", onNo);
    dlg.addEventListener("close", onClose);
    dlg.showModal();
  });
}

/* ---------- Persistenz ---------- */
async function persist() {
  if (!hasTauri) return;
  try {
    await invoke("save_data", { data: state });
  } catch (e) {
    console.error("Speichern fehlgeschlagen:", e);
  }
}

async function loadState() {
  if (!hasTauri) return;
  try {
    const data = await invoke("load_data");
    state.transactions  = Array.isArray(data.transactions)  ? data.transactions  : [];
    state.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    state.initialized   = data.initialized === true;
  } catch (e) {
    console.error("Laden fehlgeschlagen:", e);
  }
}

/* ---------- Berechnungen ---------- */
function computeStats() {
  let income = 0, expense = 0, mIncome = 0, mExpense = 0;
  const mk = monthKey(todayISO());
  for (const t of state.transactions) {
    const a = Number(t.amount) || 0;
    if (t.type === "income") {
      income += a;
      if (monthKey(t.date) === mk) mIncome += a;
    } else {
      expense += a;
      if (monthKey(t.date) === mk) mExpense += a;
    }
  }
  const subMonthly = state.subscriptions.reduce(
    (s, sub) => s + (Number(sub.amount) || 0) * (CYCLES[sub.cycle]?.perMonth || 1), 0
  );
  return { balance: income - expense, income, expense, mIncome, mExpense, subMonthly };
}

/* ====================================================================
   Rendering
   ==================================================================== */
function render() {
  const s = computeStats();
  $("#sidebar-balance").textContent = money(s.balance);
  renderDashboard(s);
  renderTransactions();
  renderSubscriptions();
}

/* ---------- Übersicht ---------- */
function renderDashboard(s) {
  const cards = [
    { label: "Kontostand",        value: money(s.balance),    color: "var(--accent)",  meta: `${state.transactions.length} Buchungen gesamt` },
    { label: "Einnahmen / Monat", value: money(s.mIncome),    color: "var(--income)",  meta: "Im aktuellen Monat" },
    { label: "Ausgaben / Monat",  value: money(s.mExpense),   color: "var(--expense)", meta: "Im aktuellen Monat" },
    { label: "Abo-Kosten / Monat",value: money(s.subMonthly), color: "var(--warn)",    meta: `${state.subscriptions.length} aktive Abos` },
  ];
  $("#stat-grid").innerHTML = cards.map((c) => `
    <div class="stat">
      <div class="stat-top">
        <span class="stat-dot" style="background:${c.color}"></span>
        <span class="stat-label">${c.label}</span>
      </div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-meta">${c.meta}</div>
    </div>`).join("");

  // Ausgaben nach Kategorie (aktueller Monat)
  const mk = monthKey(todayISO());
  const byCat = {};
  for (const t of state.transactions) {
    if (t.type === "expense" && monthKey(t.date) === mk) {
      byCat[t.category] = (byCat[t.category] || 0) + (Number(t.amount) || 0);
    }
  }
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  $("#category-chart").innerHTML = entries.length
    ? entries.map(([cat, val]) => `
        <div class="bar-row">
          <span class="bar-name">${cat}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (val / max) * 100)}%"></div></div>
          <span class="bar-val">${money(val)}</span>
        </div>`).join("")
    : emptyState("📊", "Noch keine Ausgaben diesen Monat");

  // Anstehende Zahlungen
  const upcoming = [...state.subscriptions]
    .sort((a, b) => daysUntil(a.nextPayment) - daysUntil(b.nextPayment))
    .slice(0, 6);
  $("#upcoming-list").innerHTML = upcoming.length
    ? upcoming.map((sub) => {
        const d = daysUntil(sub.nextPayment);
        let cls = "", txt;
        if (d < 0)        { cls = "over"; txt = `${Math.abs(d)} Tage überfällig`; }
        else if (d === 0) { cls = "due";  txt = "Heute fällig"; }
        else if (d <= 7)  { cls = "due";  txt = `in ${d} Tag${d === 1 ? "" : "en"}`; }
        else              { txt = fmtDate(sub.nextPayment); }
        return `
          <div class="up-row">
            <div>
              <div class="up-name">${sub.name}</div>
              <div class="up-when ${cls}">${txt}</div>
            </div>
            <div class="up-amt">${money(sub.amount)}</div>
          </div>`;
      }).join("")
    : emptyState("🔔", "Keine Abos angelegt");

  // Letzte Buchungen
  const recent = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 5);
  $("#recent-list").innerHTML = recent.length
    ? recent.map((t) => txRow(t)).join("")
    : emptyState("💸", "Noch keine Buchungen erfasst");
}

/* ---------- Buchungen ---------- */
function txRow(t) {
  const sign = t.type === "income" ? "+" : "−";
  return `
    <div class="tx-row" data-id="${t.id}">
      <div class="tx-ico ${t.type}">${t.type === "income" ? "↑" : "↓"}</div>
      <div class="tx-main">
        <div class="tx-title">${t.category}</div>
        <div class="tx-meta">${fmtDate(t.date)}${t.note ? " · " + escapeHtml(t.note) : ""}</div>
      </div>
      <div class="tx-amt ${t.type}">${sign} ${money(t.amount)}</div>
      <button class="row-del" data-del-tx="${t.id}" title="Löschen">✕</button>
    </div>`;
}

function renderTransactions() {
  const list = [...state.transactions]
    .filter((t) => txFilter === "all" || t.type === txFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  $("#transactions-list").innerHTML = list.length
    ? list.map((t) => txRow(t)).join("")
    : emptyState("🗂️", "Keine Buchungen in dieser Ansicht");
}

/* ---------- Abos ---------- */
function renderSubscriptions() {
  const subs = [...state.subscriptions].sort(
    (a, b) => daysUntil(a.nextPayment) - daysUntil(b.nextPayment)
  );
  const monthly = subs.reduce(
    (s, x) => s + (Number(x.amount) || 0) * (CYCLES[x.cycle]?.perMonth || 1), 0
  );
  const summary = [
    { label: "Aktive Abos",       value: String(subs.length), color: "var(--accent)" },
    { label: "Kosten pro Monat",  value: money(monthly),      color: "var(--warn)" },
    { label: "Kosten pro Jahr",   value: money(monthly * 12), color: "var(--expense)" },
  ];
  $("#sub-summary").innerHTML = summary.map((c) => `
    <div class="stat">
      <div class="stat-top">
        <span class="stat-dot" style="background:${c.color}"></span>
        <span class="stat-label">${c.label}</span>
      </div>
      <div class="stat-value">${c.value}</div>
    </div>`).join("");

  $("#subscriptions-list").innerHTML = subs.length
    ? subs.map((sub) => {
        const m = (Number(sub.amount) || 0) * (CYCLES[sub.cycle]?.perMonth || 1);
        const d = daysUntil(sub.nextPayment);
        const when = d < 0 ? "überfällig" : d === 0 ? "heute" : `in ${d} Tagen`;
        return `
          <div class="sub-row" data-id="${sub.id}">
            <div class="sub-badge" style="background:${colorFor(sub.name)}">${sub.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="sub-name">${escapeHtml(sub.name)}</div>
              <div class="sub-meta">${sub.category} · nächste Zahlung ${when}</div>
            </div>
            <span class="sub-cycle">${CYCLES[sub.cycle]?.label || sub.cycle}</span>
            <div class="sub-cost">
              <div class="sub-cost-main">${money(sub.amount)}</div>
              <div class="sub-cost-sub">≈ ${money(m)}/Monat</div>
            </div>
            <button class="row-del" data-del-sub="${sub.id}" title="Löschen">✕</button>
          </div>`;
      }).join("")
    : emptyState("🔁", "Noch keine Abos — leg dein erstes an");
}

function emptyState(icon, text) {
  return `<div class="empty"><div class="empty-ico">${icon}</div><div class="empty-text">${text}</div></div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ====================================================================
   Navigation & Topbar
   ==================================================================== */
function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === "view-" + view));
  $("#page-title").textContent = PAGES[view].title;
  $("#page-sub").textContent = PAGES[view].sub;
  renderTopbar(view);
}

function renderTopbar(view) {
  const box = $("#topbar-actions");
  box.innerHTML = "";
  if (view === "transactions" || view === "dashboard") {
    box.appendChild(actionBtn("+ Buchung", () => openTxDialog()));
  }
  if (view === "subscriptions" || view === "dashboard") {
    box.appendChild(actionBtn("+ Abo", () => openSubDialog()));
  }
}

function actionBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "btn primary";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/* ====================================================================
   Dialoge
   ==================================================================== */
function fillSelect(sel, options) {
  sel.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
}

function openTxDialog() {
  const form = $("#tx-form");
  form.reset();
  form.querySelector('input[name="type"][value="expense"]').checked = true;
  syncSeg();
  $("#tx-date").value = todayISO();
  fillSelect($("#tx-category"), EXPENSE_CATS);
  $("#tx-dialog").showModal();
}

function openSubDialog() {
  const form = $("#sub-form");
  form.reset();
  const d = new Date();
  d.setDate(d.getDate() + 30);
  $("#sub-date").value = d.toISOString().slice(0, 10);
  fillSelect($("#sub-category"), SUB_CATS);
  $("#sub-dialog").showModal();
}

function syncSeg() {
  const type = $("#tx-form").querySelector('input[name="type"]:checked').value;
  document.querySelectorAll("#tx-type-seg .seg-opt").forEach((opt) => {
    opt.classList.toggle("active", opt.querySelector("input").value === type);
  });
  fillSelect($("#tx-category"), type === "income" ? INCOME_CATS : EXPENSE_CATS);
}

/* ====================================================================
   Beispieldaten
   ==================================================================== */
function sampleData() {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const day = (d) => `${y}-${m}-${String(d).padStart(2, "0")}`;
  const future = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const transactions = [
    { type: "income",  amount: 2800,  category: "Gehalt",       date: day(1),  note: "Monatsgehalt" },
    { type: "income",  amount: 320,   category: "Nebenjob",     date: day(11), note: "" },
    { type: "expense", amount: 880,   category: "Wohnen",       date: day(3),  note: "Miete" },
    { type: "expense", amount: 89.4,  category: "Lebensmittel", date: day(5),  note: "Wocheneinkauf" },
    { type: "expense", amount: 62.3,  category: "Transport",    date: day(7),  note: "Tanken" },
    { type: "expense", amount: 19.5,  category: "Gesundheit",   date: day(8),  note: "Apotheke" },
    { type: "expense", amount: 44.8,  category: "Freizeit",     date: day(9),  note: "Restaurant" },
    { type: "expense", amount: 73.1,  category: "Lebensmittel", date: day(12), note: "Wocheneinkauf" },
    { type: "expense", amount: 28.9,  category: "Shopping",     date: day(14), note: "Drogerie" },
    { type: "expense", amount: 17.99, category: "Abos",         date: day(15), note: "Netflix" },
    { type: "expense", amount: 24,    category: "Freizeit",     date: day(16), note: "Kino" },
  ].map((t) => ({ id: uid(), ...t }));

  const subscriptions = [
    { name: "Netflix",        amount: 17.99, cycle: "monthly",   category: "Streaming", nextPayment: future(3) },
    { name: "Spotify",        amount: 10.99, cycle: "monthly",   category: "Musik",     nextPayment: future(8) },
    { name: "iCloud+",        amount: 2.99,  cycle: "monthly",   category: "Cloud",     nextPayment: future(12) },
    { name: "Fitnessstudio",  amount: 29.99, cycle: "monthly",   category: "Fitness",   nextPayment: future(1) },
    { name: "ChatGPT Plus",   amount: 22.0,  cycle: "monthly",   category: "Software",  nextPayment: future(19) },
    { name: "Amazon Prime",   amount: 89.9,  cycle: "yearly",    category: "Streaming", nextPayment: future(140) },
    { name: "Handyvertrag",   amount: 14.99, cycle: "monthly",   category: "Sonstiges", nextPayment: future(6) },
  ].map((s) => ({ id: uid(), ...s }));

  return { transactions, subscriptions };
}

/* ====================================================================
   Updates
   ==================================================================== */
async function loadVersion() {
  let v = "0.1.0";
  if (hasTauri) {
    try { v = await invoke("app_version"); } catch (e) { console.error(e); }
  }
  $("#version-tag").textContent = "v" + v;
  $("#about-version").textContent = v;
}

async function checkForUpdates(silent) {
  const status = $("#update-status");
  const checkBtn = $("#btn-check-update");
  const installBtn = $("#btn-install-update");

  if (!hasTauri) {
    if (!silent) status.textContent = "Updates sind nur in der installierten App verfügbar.";
    return;
  }
  if (!silent) {
    status.textContent = "Suche nach Updates …";
    status.classList.add("busy");
    checkBtn.disabled = true;
  }

  try {
    const info = await invoke("check_update");
    if (info) {
      installBtn.hidden = false;
      status.classList.remove("busy");
      status.innerHTML =
        `<strong>Version ${escapeHtml(info.version)} ist verfügbar</strong>` +
        ` (aktuell: ${escapeHtml(info.current_version)}).` +
        (info.notes ? `<br>${escapeHtml(info.notes)}` : "");
      if (silent) toast(`Update auf v${info.version} verfügbar`);
    } else if (!silent) {
      status.classList.remove("busy");
      status.textContent = "Du verwendest bereits die neueste Version. ✓";
    }
  } catch (e) {
    console.error("Update-Prüfung fehlgeschlagen:", e);
    if (!silent) {
      status.classList.remove("busy");
      status.textContent = "Aktuell keine Updates gefunden.";
    }
  } finally {
    checkBtn.disabled = false;
  }
}

async function installUpdate() {
  const status = $("#update-status");
  const installBtn = $("#btn-install-update");
  installBtn.disabled = true;
  status.classList.add("busy");
  status.textContent = "Update wird geladen und installiert — die App startet gleich neu …";
  try {
    // Bei Erfolg startet die App neu; Code danach wird nicht mehr erreicht.
    await invoke("install_update");
  } catch (e) {
    console.error(e);
    status.classList.remove("busy");
    status.textContent = "Update fehlgeschlagen: " + e;
    installBtn.disabled = false;
  }
}

/* ====================================================================
   Initialisierung
   ==================================================================== */
async function init() {
  // Navigation
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Filter-Chips
  document.querySelectorAll(".filter-bar .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-bar .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      txFilter = chip.dataset.filter;
      renderTransactions();
    });
  });

  // Dialog: Typ-Umschalter
  document.querySelectorAll('#tx-type-seg input').forEach((r) =>
    r.addEventListener("change", syncSeg));

  // Dialog: Abbrechen-Buttons
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()));

  // Formular: Buchung speichern
  $("#tx-form").addEventListener("submit", async (e) => {
    const fd = new FormData(e.target);
    const amount = parseAmount(fd.get("amount"));
    if (!amount) return;
    state.transactions.push({
      id: uid(),
      type: fd.get("type"),
      amount,
      category: fd.get("category"),
      date: fd.get("date"),
      note: (fd.get("note") || "").trim(),
    });
    await persist();
    render();
    toast("Buchung gespeichert");
  });

  // Formular: Abo speichern
  $("#sub-form").addEventListener("submit", async (e) => {
    const fd = new FormData(e.target);
    const amount = parseAmount(fd.get("amount"));
    if (!amount) return;
    state.subscriptions.push({
      id: uid(),
      name: (fd.get("name") || "").trim(),
      amount,
      cycle: fd.get("cycle"),
      category: fd.get("category"),
      nextPayment: fd.get("nextPayment"),
    });
    await persist();
    render();
    toast("Abo gespeichert");
  });

  // Löschen (Event-Delegation)
  document.body.addEventListener("click", async (e) => {
    const delTx = e.target.closest("[data-del-tx]");
    const delSub = e.target.closest("[data-del-sub]");
    if (delTx) {
      state.transactions = state.transactions.filter((t) => t.id !== delTx.dataset.delTx);
      await persist();
      render();
      toast("Buchung gelöscht");
    } else if (delSub) {
      state.subscriptions = state.subscriptions.filter((s) => s.id !== delSub.dataset.delSub);
      await persist();
      render();
      toast("Abo gelöscht");
    }
  });

  // Einstellungen
  $("#btn-sample").addEventListener("click", async () => {
    const data = sampleData();
    state.transactions = data.transactions;
    state.subscriptions = data.subscriptions;
    state.initialized = true;
    await persist();
    render();
    toast("Beispieldaten geladen");
  });

  $("#btn-reset").addEventListener("click", async () => {
    const ok = await confirmDialog(
      "Alle Buchungen und Abos werden unwiderruflich gelöscht. Es werden danach keine Beispieldaten neu angelegt.",
      { title: "Alle Daten löschen", confirmLabel: "Endgültig löschen" }
    );
    if (!ok) return;
    state.transactions = [];
    state.subscriptions = [];
    state.initialized = true;
    await persist();
    render();
    toast("Alle Daten gelöscht");
  });

  // Update-Buttons
  $("#btn-check-update").addEventListener("click", () => checkForUpdates(false));
  $("#btn-install-update").addEventListener("click", installUpdate);

  // Daten laden
  await loadState();
  if (hasTauri) {
    try { $("#data-path").textContent = await invoke("data_path"); }
    catch { $("#data-path").textContent = "unbekannt"; }
  } else {
    $("#data-path").textContent = "Browser-Vorschau (keine Persistenz)";
  }

  // Erststart: Beispieldaten nur EINMALIG anlegen — danach nie wieder
  // automatisch, auch wenn der Nutzer alle Daten gelöscht hat.
  if (!state.initialized) {
    if (state.transactions.length === 0 && state.subscriptions.length === 0) {
      const data = sampleData();
      state.transactions = data.transactions;
      state.subscriptions = data.subscriptions;
    }
    state.initialized = true;
    await persist();
  }

  await loadVersion();

  switchView("dashboard");
  render();

  // Im Hintergrund still nach Updates suchen (meldet sich nur, wenn es eins gibt).
  checkForUpdates(true);
}

document.addEventListener("DOMContentLoaded", init);
