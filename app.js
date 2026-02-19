/************************************************************
 * Afterlog vNext — app.js (FINAL)
 * - Supabase Auth (email+password) + session persists
 * - Journal: unlimited entries per day (INSERT only)
 *   - Recent: last 3 days only, all entries, 10/page pagination
 *   - History: all time, 10/page pagination
 * - Todo: add/toggle/delete/sort, optional due, collapse completed
 * - Quick Capture modal (tab-aware)
 * - Theme switch (simple)
 * - Sync status: Synced / Syncing / Offline
 * - Robust UI messages + loading states
 ************************************************************/

// ========== 1) SET THESE ==========
const SUPABASE_URL = "https://elsydeedgigdqjvpklqy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kGyupHgHgGCgOyF66C6-BA_VjBIK6an";

// ========== 2) BOOT GUARDS ==========
(function guardSupabaseSDK() {
  if (!window.supabase || !window.supabase.createClient) {
    alert(
      "Supabase SDK not loaded. Check:\n" +
        "<script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script>\n" +
        "and ensure it's BEFORE app.js"
    );
  }
})();

// Prevent double-declare crash if service worker / caching causes re-exec
if (!window.__AFTERLOG_BOOTED__) window.__AFTERLOG_BOOTED__ = true;
else {
  // If app.js is accidentally loaded twice, bail out safely
  console.warn("[Afterlog] app.js loaded twice — aborting second boot.");
}

// ========== 3) CLIENT ==========
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== 4) HELPERS ==========
const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function setSyncStatus(text) {
  const el = $("syncStatus");
  if (!el) return;
  el.textContent = text;
}

function toast(msg, ms = 2200) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

function setBtnLoading(btn, loading, labelWhenNotLoading) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.dataset.prevText ??= btn.textContent;
  if (loading) btn.textContent = "…";
  else btn.textContent = labelWhenNotLoading ?? btn.dataset.prevText;
}

function ymdUTC(d = new Date()) {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function addDaysUTC(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return ymdUTC(dt);
}

function toLocalDateTime(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${da} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

function normalizeTags(tags) {
  // DB is "text" (string). But we accept arrays too to avoid join crashes.
  if (Array.isArray(tags)) return tags.filter(Boolean).join(", ");
  if (typeof tags === "string") return tags;
  return "";
}

function normalizeText(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function currentView() {
  // which main tab is active
  return $("todoView")?.classList.contains("hidden") ? "journal" : "todo";
}

function setAuthMsg(msg = "") {
  const el = $("authMsg");
  if (el) el.textContent = msg;
}
function setAuthErr(msg = "") {
  const el = $("authError");
  if (el) el.textContent = msg;
}
function setJournalHint(msg = "") {
  const el = $("journalHint");
  if (el) el.textContent = msg;
}
function setQCHint(msg = "") {
  const el = $("qcHint");
  if (el) el.textContent = msg;
}

// ========== 5) STATE ==========
const state = {
  user: null,

  themeIndex: 0, // simple cycle

  // Pagination
  recentPage: 1,
  recentPageSize: 10,
  recentTotal: 0,

  historyPage: 1,
  historyPageSize: 10,
  historyTotal: 0,

  // Todo
  todos: [],
  doneCollapsed: false,

  // Journal composer
  mood: "",

  // Quick capture
  qcMode: "journal",
};

function setOfflineAwareStatus() {
  if (!isOnline()) setSyncStatus("Offline");
  else setSyncStatus("Synced");
}

// ========== 6) INIT UI REFS ==========
function showAuth() {
  $("authRoot")?.classList.remove("hidden");
  $("app")?.classList.add("hidden");
}
function showApp() {
  $("authRoot")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");
}

// ========== 7) AUTH ==========
let authMode = "login"; // login | signup

function setAuthMode(mode) {
  authMode = mode;
  $("authTabLogin")?.classList.toggle("active", mode === "login");
  $("authTabSignup")?.classList.toggle("active", mode === "signup");
  const action = $("authAction");
  if (action) action.textContent = mode === "login" ? "Log in" : "Sign up";

  // input autocomplete hint
  const pass = $("authPassword");
  if (pass) pass.autocomplete = mode === "login" ? "current-password" : "new-password";

  setAuthMsg("");
  setAuthErr("");
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  setAuthMsg("");
  setAuthErr("");

  if (!isOnline()) {
    setAuthErr("Offline. Please connect to the internet to sign in.");
    setSyncStatus("Offline");
    return;
  }

  const email = normalizeText($("authEmail")?.value);
  const password = $("authPassword")?.value ?? "";

  if (!email || !password) {
    setAuthErr("Please enter email and password.");
    return;
  }

  const btn = $("authAction");
  setBtnLoading(btn, true);

  setSyncStatus("Syncing");

  try {
    if (authMode === "signup") {
      setAuthMsg("Creating account…");
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;

      // Depending on Supabase settings, email confirmation may be required.
      if (data?.user && !data?.session) {
        setAuthMsg("Check your email to confirm signup.");
        toast("Confirmation email sent.");
      } else {
        setAuthMsg("Signed up.");
        toast("Welcome!");
      }
    } else {
      setAuthMsg("Logging in…");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.session) {
        setAuthMsg("Logged in.");
      }
    }

    // session will be picked up by onAuthStateChange
  } catch (err) {
    const msg = String(err?.message || err || "Auth error");
    // friendlier common cases
    if (msg.toLowerCase().includes("email logins are disabled")) {
      setAuthErr("Email logins are disabled in Supabase Auth settings.");
    } else if (msg.toLowerCase().includes("invalid login credentials")) {
      setAuthErr("Invalid email or password.");
    } else if (msg.toLowerCase().includes("rate limit")) {
      setAuthErr("Rate limit exceeded. Wait a bit and try again.");
    } else {
      setAuthErr(msg);
    }
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } finally {
    setBtnLoading(btn, false, authMode === "login" ? "Log in" : "Sign up");
  }
}

async function doLogout() {
  try {
    setSyncStatus("Syncing");
    await sb.auth.signOut();
    toast("Logged out");
  } finally {
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

// ========== 8) JOURNAL — SAVE ==========
function wireJournalComposer() {
  const input = $("journalInput");
  const count = $("journalCount");
  if (input && count) {
    const update = () => (count.textContent = `${input.value.length} / 160`);
    input.addEventListener("input", update);
    update();
  }

  // mood chips
  document.querySelectorAll(".miniChip").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".miniChip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.mood = b.dataset.mood || "";
    });
  });
}

async function saveJournalFromComposer() {
  const content = normalizeText($("journalInput")?.value);
  const tags = normalizeText($("tagsInput")?.value || $("journalTags")?.value || ""); // supports either id if you add later
  const mood = state.mood || null;

  if (!content) {
    setJournalHint("Write one line first.");
    toast("Nothing to save.");
    return;
  }

  const btn = $("saveJournal");
  setBtnLoading(btn, true, "Save");
  setJournalHint("");
  setSyncStatus(isOnline() ? "Syncing" : "Offline");

  try {
    // IMPORTANT: unlimited per day = INSERT only (no upsert / onConflict)
    const { error } = await sb.from("journal_entries").insert({
      content,
      mood,
      tags: tags || null,
      entry_date: ymdUTC(new Date()), // keep a stable UTC day key
    });
    if (error) throw error;

    $("journalInput").value = "";
    $("journalInput")?.dispatchEvent(new Event("input"));
    state.mood = "";
    document.querySelectorAll(".miniChip").forEach((x) => x.classList.remove("active"));

    toast("Saved");
    await refreshJournalAll();
    await refreshStreak();
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    const msg = String(err?.message || err || "Save error");
    setJournalHint(msg);
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } finally {
    setBtnLoading(btn, false, "Save");
  }
}

// ========== 9) JOURNAL — RECENT / HISTORY ==========
function renderEntryItem(r) {
  const tagsText = normalizeTags(r.tags);
  const moodText = r.mood ? ` ${esc(r.mood)}` : "";

  return `
    <li class="item">
      <div class="itemTop">
        <div class="itemDate">${esc(r.entry_date || "")}</div>
        <div class="itemTime">${esc(toLocalDateTime(r.created_at || ""))}</div>
      </div>
      <div class="itemBody">${esc(r.content || "")}${moodText}</div>
      ${tagsText ? `<div class="itemMeta">${esc(tagsText)}</div>` : ``}
    </li>
  `;
}

function ensurePaginationControls(containerId, type) {
  // type: "recent" | "history"
  const root = $(containerId);
  if (!root) return;

  let pager = root.querySelector(".pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "pager";
    pager.innerHTML = `
      <button class="btn mini" data-action="prev" type="button">Prev</button>
      <div class="pagerInfo" data-role="info"></div>
      <button class="btn mini" data-action="next" type="button">Next</button>
    `;
    root.appendChild(pager);

    pager.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.action;

      if (type === "recent") {
        const maxPage = Math.max(1, Math.ceil(state.recentTotal / state.recentPageSize));
        if (action === "prev") state.recentPage = Math.max(1, state.recentPage - 1);
        if (action === "next") state.recentPage = Math.min(maxPage, state.recentPage + 1);
        refreshRecent();
      } else {
        const maxPage = Math.max(1, Math.ceil(state.historyTotal / state.historyPageSize));
        if (action === "prev") state.historyPage = Math.max(1, state.historyPage - 1);
        if (action === "next") state.historyPage = Math.min(maxPage, state.historyPage + 1);
        refreshHistory();
      }
    });
  }

  const info = pager.querySelector('[data-role="info"]');
  if (info) {
    if (type === "recent") {
      const maxPage = Math.max(1, Math.ceil(state.recentTotal / state.recentPageSize));
      info.textContent = `Page ${state.recentPage} / ${maxPage} • ${state.recentTotal} entries`;
    } else {
      const maxPage = Math.max(1, Math.ceil(state.historyTotal / state.historyPageSize));
      info.textContent = `Page ${state.historyPage} / ${maxPage} • ${state.historyTotal} entries`;
    }
  }
}

async function refreshRecent() {
  const list = $("journalList"); // Recent list id in your HTML
  const recentWrap = list?.closest(".panel") || null;

  if (!list) return;

  // last 3 days in UTC: today, -1, -2
  const today = ymdUTC(new Date());
  const fromDate = addDaysUTC(today, -2);

  const from = (state.recentPage - 1) * state.recentPageSize;
  const to = from + state.recentPageSize - 1;

  try {
    setSyncStatus(isOnline() ? "Syncing" : "Offline");

    const { data, error, count } = await sb
      .from("journal_entries")
      .select("id, content, mood, tags, created_at, entry_date", { count: "exact" })
      .gte("entry_date", fromDate)
      .lte("entry_date", today)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    state.recentTotal = count ?? (data?.length ?? 0);

    if (!data || data.length === 0) {
      list.innerHTML = `
        <li class="empty">
          <div class="emptyTitle">No entries.</div>
          <div class="emptySub">Last 3 days only.</div>
        </li>
      `;
    } else {
      list.innerHTML = data.map(renderEntryItem).join("");
    }

    // attach pagination under the Recent panel
    if (recentWrap) {
      recentWrap.dataset.kind = "recent";
      ensurePaginationControls(recentWrap.id || (recentWrap.id = "recentPanel"), "recent");
    }

    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    const msg = String(err?.message || err || "Load error");
    list.innerHTML = `
      <li class="empty">
        <div class="emptyTitle">Error</div>
        <div class="emptySub">${esc(msg)}</div>
      </li>
    `;
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

async function refreshHistory() {
  // History container: create if not exists (keeps your existing UI)
  let historyPanel = document.getElementById("historyPanel");
  if (!historyPanel) {
    // find journal view and append a history panel after recent
    const journalView = document.getElementById("journalView");
    if (journalView) {
      historyPanel = document.createElement("div");
      historyPanel.className = "panel";
      historyPanel.id = "historyPanel";
      historyPanel.innerHTML = `
        <div class="panelTop">
          <div class="panelTitle">
            <div class="h2">History</div>
            <div class="sub">All time</div>
          </div>
        </div>
        <ul id="historyList" class="list"></ul>
      `;
      journalView.appendChild(historyPanel);
    }
  }

  const list = $("historyList");
  if (!list) return;

  const from = (state.historyPage - 1) * state.historyPageSize;
  const to = from + state.historyPageSize - 1;

  try {
    setSyncStatus(isOnline() ? "Syncing" : "Offline");

    const { data, error, count } = await sb
      .from("journal_entries")
      .select("id, content, mood, tags, created_at, entry_date", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    state.historyTotal = count ?? (data?.length ?? 0);

    if (!data || data.length === 0) {
      list.innerHTML = `
        <li class="empty">
          <div class="emptyTitle">No history yet.</div>
          <div class="emptySub">Start with one line.</div>
        </li>
      `;
    } else {
      list.innerHTML = data.map(renderEntryItem).join("");
    }

    ensurePaginationControls("historyPanel", "history");

    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    const msg = String(err?.message || err || "Load error");
    list.innerHTML = `
      <li class="empty">
        <div class="emptyTitle">Error</div>
        <div class="emptySub">${esc(msg)}</div>
      </li>
    `;
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

async function refreshJournalAll() {
  await refreshRecent();
  await refreshHistory();
}

// ========== 10) STREAK ==========
async function refreshStreak() {
  const el = $("streakText");
  if (!el) return;

  try {
    // fetch a chunk of recent days, get unique dates
    const { data, error } = await sb
      .from("journal_entries")
      .select("entry_date")
      .order("entry_date", { ascending: false })
      .limit(250);

    if (error) throw error;

    const dates = new Set((data || []).map((r) => r.entry_date).filter(Boolean));

    let streak = 0;
    let cursor = ymdUTC(new Date()); // today UTC
    while (dates.has(cursor)) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    }

    el.textContent = `Streak: ${streak}`;
  } catch {
    // ignore streak failures
  }
}

// ========== 11) TODO ==========
function renderTodoItem(t, isDoneList) {
  const due = t.due_date ? `<span class="pill">${esc(t.due_date)}</span>` : "";
  const checked = t.is_done ? "checked" : "";
  const cls = t.is_done ? "todoRow doneRow" : "todoRow";

  return `
    <li class="${cls}" data-id="${esc(t.id)}">
      <label class="todoLeft">
        <input class="todoChk" type="checkbox" ${checked} />
        <span class="todoText">${esc(t.text)}</span>
      </label>
      <div class="todoRight">
        ${due}
        <button class="iconBtn todoDel" type="button" title="Delete">✕</button>
      </div>
    </li>
  `;
}

async function loadTodos() {
  const list = $("todoList");
  const doneList = $("doneList");
  if (!list || !doneList) return;

  try {
    setSyncStatus(isOnline() ? "Syncing" : "Offline");

    const { data, error } = await sb
      .from("todos")
      .select("id, text, due_date, is_done, created_at")
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const todos = data || [];
    const active = todos.filter((t) => !t.is_done);
    const done = todos.filter((t) => t.is_done);

    list.innerHTML = active.length ? active.map((t) => renderTodoItem(t, false)).join("") : `<li class="empty"><div class="emptyTitle">No tasks.</div></li>`;
    doneList.innerHTML = done.length ? done.map((t) => renderTodoItem(t, true)).join("") : `<li class="empty"><div class="emptyTitle">No completed tasks.</div></li>`;

    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    const msg = String(err?.message || err || "Todo load error");
    list.innerHTML = `<li class="empty"><div class="emptyTitle">Error</div><div class="emptySub">${esc(msg)}</div></li>`;
    doneList.innerHTML = "";
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

async function addTodoFromMain() {
  const text = normalizeText($("todoInput")?.value);
  const due = $("todoDue")?.value || null; // Smart default: not forced
  if (!text) return toast("Enter a task.");

  const btn = $("addTodo");
  setBtnLoading(btn, true, "Add");
  setSyncStatus(isOnline() ? "Syncing" : "Offline");

  try {
    const { error } = await sb.from("todos").insert({
      text,
      due_date: due || null,
      is_done: false,
    });
    if (error) throw error;

    $("todoInput").value = "";
    if ($("todoDue")) $("todoDue").value = ""; // keep it optional
    toast("Added");
    await loadTodos();
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    toast(String(err?.message || err || "Add failed"));
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } finally {
    setBtnLoading(btn, false, "Add");
  }
}

async function toggleTodo(id, nextDone) {
  setSyncStatus(isOnline() ? "Syncing" : "Offline");
  const { error } = await sb.from("todos").update({ is_done: nextDone }).eq("id", id);
  if (error) throw error;
}

async function deleteTodo(id) {
  setSyncStatus(isOnline() ? "Syncing" : "Offline");
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) throw error;
}

function wireTodoEvents() {
  // Add button + enter key
  $("addTodo")?.addEventListener("click", addTodoFromMain);
  $("todoInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTodoFromMain();
    }
  });

  // Delegate toggle/delete
  const panel = $("todoView");
  panel?.addEventListener("click", async (e) => {
    const row = e.target.closest("li[data-id]");
    if (!row) return;
    const id = row.dataset.id;

    try {
      if (e.target.classList.contains("todoDel")) {
        await deleteTodo(id);
        toast("Deleted");
        await loadTodos();
        setSyncStatus(isOnline() ? "Synced" : "Offline");
        return;
      }

      if (e.target.classList.contains("todoChk")) {
        const nextDone = e.target.checked;
        await toggleTodo(id, nextDone);
        await loadTodos();
        toast(nextDone ? "Completed" : "Reopened");
        setSyncStatus(isOnline() ? "Synced" : "Offline");
      }
    } catch (err) {
      toast(String(err?.message || err || "Todo error"));
      setSyncStatus(isOnline() ? "Synced" : "Offline");
    }
  });
}

// ========== 12) QUICK CAPTURE ==========
function openModal() {
  $("modal")?.classList.remove("hidden");
  setQCHint("");
  // tab-aware default
  const v = currentView();
  if (v === "todo") setQCMode("todo");
  else setQCMode("journal");
}

function closeModal() {
  $("modal")?.classList.add("hidden");
  setQCHint("");
}

function setQCMode(mode) {
  state.qcMode = mode;
  $("qcJournalTab")?.classList.toggle("active", mode === "journal");
  $("qcTodoTab")?.classList.toggle("active", mode === "todo");
  $("qcJournal")?.classList.toggle("hidden", mode !== "journal");
  $("qcTodo")?.classList.toggle("hidden", mode !== "todo");
}

async function qcSaveJournal() {
  const content = normalizeText($("qcJournalText")?.value);
  if (!content) return setQCHint("Write one line first.");

  setSyncStatus(isOnline() ? "Syncing" : "Offline");
  setQCHint("Saving…");

  try {
    const { error } = await sb.from("journal_entries").insert({
      content,
      entry_date: ymdUTC(new Date()),
    });
    if (error) throw error;

    $("qcJournalText").value = "";
    setQCHint("Saved.");
    toast("Saved");
    await refreshJournalAll();
    await refreshStreak();
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    setQCHint(String(err?.message || err || "Save failed"));
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

async function qcAddTodo() {
  const text = normalizeText($("qcTodoText")?.value);
  const due = $("qcTodoDue")?.value || null;
  if (!text) return setQCHint("Enter a task first.");

  setSyncStatus(isOnline() ? "Syncing" : "Offline");
  setQCHint("Adding…");

  try {
    const { error } = await sb.from("todos").insert({
      text,
      due_date: due || null,
      is_done: false,
    });
    if (error) throw error;

    $("qcTodoText").value = "";
    if ($("qcTodoDue")) $("qcTodoDue").value = "";
    setQCHint("Added.");
    toast("Added");
    await loadTodos();
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  } catch (err) {
    setQCHint(String(err?.message || err || "Add failed"));
    setSyncStatus(isOnline() ? "Synced" : "Offline");
  }
}

function wireQuickCapture() {
  $("quickBtn")?.addEventListener("click", openModal);
  $("modalClose")?.addEventListener("click", closeModal);
  $("modal")?.addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });

  $("qcJournalTab")?.addEventListener("click", () => setQCMode("journal"));
  $("qcTodoTab")?.addEventListener("click", () => setQCMode("todo"));

  $("qcSaveJournal")?.addEventListener("click", qcSaveJournal);
  $("qcAddTodo")?.addEventListener("click", qcAddTodo);

  // keyboard
  $("qcJournalText")?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") qcSaveJournal();
  });
  $("qcTodoText")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") qcAddTodo();
  });
}

// ========== 13) THEME ==========
function applyTheme(idx) {
  // simple theme cycling via data-theme attr (CSS側が対応してる想定)
  document.documentElement.dataset.theme = String(idx);
  toast(`Theme ${idx + 1}`);
}
function wireTheme() {
  $("themeBtn")?.addEventListener("click", () => {
    state.themeIndex = (state.themeIndex + 1) % 3; // 3 variants
    applyTheme(state.themeIndex);
  });
}

// ========== 14) NAV (Journal/Todo) ==========
function showJournal() {
  $("journalView")?.classList.remove("hidden");
  $("todoView")?.classList.add("hidden");
  $("tabJournal")?.classList.add("active");
  $("tabTodo")?.classList.remove("active");
}
function showTodo() {
  $("journalView")?.classList.add("hidden");
  $("todoView")?.classList.remove("hidden");
  $("tabJournal")?.classList.remove("active");
  $("tabTodo")?.classList.add("active");
}

function wireMainTabs() {
  $("tabJournal")?.addEventListener("click", showJournal);
  $("tabTodo")?.addEventListener("click", async () => {
    showTodo();
    await loadTodos();
  });
  $("logoutBtn")?.addEventListener("click", doLogout);
}

// ========== 15) ONLINE/OFFLINE ==========
function wireOnlineEvents() {
  window.addEventListener("online", () => setOfflineAwareStatus());
  window.addEventListener("offline", () => setOfflineAwareStatus());
  setOfflineAwareStatus();
}

// ========== 16) BOOT ==========
async function onSignedIn(user) {
  state.user = user;
  showApp();

  // reset paging on login
  state.recentPage = 1;
  state.historyPage = 1;

  await refreshJournalAll();
  await refreshStreak();
  await loadTodos();
}

async function onSignedOut() {
  state.user = null;
  showAuth();
}

function wireAuthUI() {
  $("authTabLogin")?.addEventListener("click", () => setAuthMode("login"));
  $("authTabSignup")?.addEventListener("click", () => setAuthMode("signup"));
  $("authForm")?.addEventListener("submit", handleAuthSubmit);
  setAuthMode("login");
}

function wireJournalUI() {
  wireJournalComposer();
  $("saveJournal")?.addEventListener("click", saveJournalFromComposer);

  // optional jump date (if you later implement)
  $("jumpDate")?.addEventListener("change", () => {
    toast("Jump is UI-only for now.");
  });
}

async function boot() {
  // global UI wires
  wireOnlineEvents();
  wireTheme();
  wireQuickCapture();
  wireMainTabs();
  wireAuthUI();
  wireJournalUI();
  wireTodoEvents();

  // Supabase auth state listener
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await onSignedIn(session.user);
    } else {
      await onSignedOut();
    }
  });

  // initial session check (persistence)
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    await onSignedIn(data.session.user);
  } else {
    await onSignedOut();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // safety status
  setSyncStatus(isOnline() ? "Synced" : "Offline");

  // IMPORTANT: ensure app.js doesn't crash if loaded twice
  if (window.__AFTERLOG_BOOTED__ === true && !window.__AFTERLOG_RUNNING__) {
    window.__AFTERLOG_RUNNING__ = true;
    boot().catch((e) => {
      console.error(e);
      toast(String(e?.message || e || "Boot error"));
    });
  }
});

