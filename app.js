(() => {
  // Boot guard (prevents double-init)
  if (window.__AFTERLOG_BOOTED__) return;
  window.__AFTERLOG_BOOTED__ = true;

  // ===== CONFIG =====
  const SUPABASE_URL = "PUT_YOUR_SUPABASE_URL_HERE";
  const SUPABASE_ANON_KEY = "PUT_YOUR_SB_PUBLISHABLE_KEY_HERE";
  const PAGE_SIZE = 10; // recent/history 共通

  // ===== Helpers =====
  const $ = (id) => document.getElementById(id);
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");
  const setText = (el, t) => { el.textContent = t; };

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const toDate = (iso) => new Date(iso + "T00:00:00");
  const addDaysISO = (iso, d) => {
    const dt = toDate(iso);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().slice(0, 10);
  };

  function escapeHtml(str) {
    return (str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Toast
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    setText(el, msg);
    show(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(el), 1200);
  }

  // Sync status
  function setSync(text) { setText($("syncStatus"), text); }
  function syncByNet() { setSync(navigator.onLine ? "Synced" : "Offline"); }
  window.addEventListener("online", syncByNet);
  window.addEventListener("offline", syncByNet);
  syncByNet();

  // Supabase SDK guard
  const sb = window.supabase || window.supabaseJs;
  if (!sb?.createClient) {
    alert("Supabase SDK not loaded. Check index.html head script.");
    throw new Error("Supabase SDK not loaded");
  }

  // Singleton client (prevents "already declared")
  window.__AFTERLOG_SUPABASE__ =
    window.__AFTERLOG_SUPABASE__ ||
    sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabase = window.__AFTERLOG_SUPABASE__;

  // ===== Theme =====
  const THEMES = ["gold", "emerald", "mono"];
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "gold") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
  }
  function getTheme() { return localStorage.getItem("afterlog_theme") || "gold"; }
  function setTheme(t) { localStorage.setItem("afterlog_theme", t); applyTheme(t); toast("Theme."); }
  applyTheme(getTheme());
  $("themeBtn").addEventListener("click", () => {
    const cur = getTheme();
    const idx = THEMES.indexOf(cur);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  });

  // ===== DOM =====
  const authRoot = $("authRoot");
  const appRoot = $("app");

  const authTabLogin = $("authTabLogin");
  const authTabSignup = $("authTabSignup");
  const authForm = $("authForm");
  const authEmail = $("authEmail");
  const authPassword = $("authPassword");
  const authAction = $("authAction");
  const authMsg = $("authMsg");
  const authError = $("authError");

  const tabJournal = $("tabJournal");
  const tabTodo = $("tabTodo");
  const logoutBtn = $("logoutBtn");
  const journalView = $("journalView");
  const todoView = $("todoView");

  const entryDate = $("entryDate");
  const journalInput = $("journalInput");
  const journalCount = $("journalCount");
  const tagInput = $("tagInput");
  const saveJournalBtn = $("saveJournal");
  const journalHint = $("journalHint");
  const streakText = $("streakText");

  const recentList = $("recentList");
  const recentPrev = $("recentPrev");
  const recentNext = $("recentNext");
  const recentPageText = $("recentPage");

  const historyList = $("historyList");
  const histPrev = $("histPrev");
  const histNext = $("histNext");
  const histPageText = $("histPage");

  const todoInput = $("todoInput");
  const todoDue = $("todoDue");
  const addTodoBtn = $("addTodo");
  const todoList = $("todoList");
  const doneList = $("doneList");

  // Quick capture
  const modal = $("modal");
  const modalClose = $("modalClose");
  const quickBtn = $("quickBtn");
  const qcJournalTab = $("qcJournalTab");
  const qcTodoTab = $("qcTodoTab");
  const qcJournal = $("qcJournal");
  const qcTodo = $("qcTodo");
  const qcJournalText = $("qcJournalText");
  const qcSaveJournal = $("qcSaveJournal");
  const qcTodoText = $("qcTodoText");
  const qcTodoDue = $("qcTodoDue");
  const qcAddTodo = $("qcAddTodo");
  const qcHint = $("qcHint");

  // ===== State =====
  let authMode = "login";
  let currentUser = null;
  let selectedMood = null;

  let recentPage = 1;
  let recentHasNext = false;

  let histPage = 1;
  let histHasNext = false;

  let todos = [];

  // ===== Tabs =====
  function setMainTab(name) {
    tabJournal.classList.toggle("active", name === "journal");
    tabTodo.classList.toggle("active", name === "todo");
    if (name === "journal") { show(journalView); hide(todoView); }
    else { show(todoView); hide(journalView); }
  }
  tabJournal.addEventListener("click", () => setMainTab("journal"));
  tabTodo.addEventListener("click", () => setMainTab("todo"));
  setMainTab("journal");

  // ===== Auth =====
  function setAuthMode(m) {
    authMode = m;
    authTabLogin.classList.toggle("active", m === "login");
    authTabSignup.classList.toggle("active", m === "signup");
    setText(authAction, m === "login" ? "Log in" : "Sign up");
    setText(authMsg, "");
    setText(authError, "");
  }
  authTabLogin.addEventListener("click", () => setAuthMode("login"));
  authTabSignup.addEventListener("click", () => setAuthMode("signup"));
  setAuthMode("login");

  function setAuthLoading(on) {
    authAction.disabled = on;
    authEmail.disabled = on;
    authPassword.disabled = on;
    setText(authAction, on ? (authMode === "login" ? "Logging in…" : "Signing up…") : (authMode === "login" ? "Log in" : "Sign up"));
  }

  function humanizeAuthError(msg) {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "Couldn’t verify. Check email/password.";
    if (m.includes("rate limit")) return "Too many attempts. Please wait a bit.";
    if (m.includes("already")) return "This email is already registered.";
    return msg || "Auth error";
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setText(authMsg, "");
    setText(authError, "");

    const email = (authEmail.value || "").trim();
    const password = authPassword.value || "";
    if (!email || !password) { setText(authError, "Please enter email and password."); return; }
    if (password.length < 6) { setText(authError, "Password must be at least 6 characters."); return; }

    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setText(authMsg, "Welcome back.");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setText(authMsg, "Account created.");
      }
      toast("Synced.");
    } catch (err) {
      setText(authError, humanizeAuthError(err?.message));
    } finally {
      setAuthLoading(false);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    setSync("Syncing…");
    await supabase.auth.signOut();
    setSync("Synced");
    toast("Signed out.");
  });

  function route(session) {
    if (session?.user) {
      currentUser = session.user;
      hide(authRoot);
      show(appRoot);
      boot();
    } else {
      currentUser = null;
      show(authRoot);
      hide(appRoot);
    }
  }

  supabase.auth.getSession().then(({ data }) => route(data?.session));
  supabase.auth.onAuthStateChange((_e, session) => route(session));

  // ===== Journal UI =====
  entryDate.value = todayISO();

  function updateCount() {
    const len = (journalInput.value || "").length;
    setText(journalCount, `${len} / 160`);
  }
  journalInput.addEventListener("input", updateCount);
  updateCount();

  // mood chips
  document.querySelectorAll(".miniChip[data-mood]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      selectedMood = (selectedMood === mood) ? null : mood;
      document.querySelectorAll(".miniChip[data-mood]").forEach(b => b.style.outline = "");
      if (selectedMood) btn.style.outline = "2px solid rgba(255,255,255,.22)";
      toast(selectedMood ? `Mood ${selectedMood}` : "Mood cleared.");
    });
  });

  // save (INSERT = unlimited)
  async function saveJournal({ silent=false } = {}) {
    const text = (journalInput.value || "").trim();
    if (!text) {
      setText(journalHint, "Nothing written today. That’s okay.");
      if (!silent) toast("Nothing to save.");
      return;
    }
    if (!currentUser) return;

    const dateIso = entryDate.value || todayISO();
    const tags = (tagInput.value || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 12);

    saveJournalBtn.disabled = true;
    setText(saveJournalBtn, "Saving…");
    setSync("Syncing…");

    try {
      const { error } = await supabase.from("journal_entries").insert([{
        user_id: currentUser.id,
        entry_date: dateIso,
        content: text,
        mood: selectedMood,
        tags
      }]);
      if (error) throw error;

      setSync("Synced");
      if (!silent) toast("Saved.");
      setText(journalHint, dateIso === todayISO() ? "Today." : "Saved.");

      // refresh lists
      await loadRecent(1);
      await loadHistory(1);
      await computeStreak();
    } catch (err) {
      setSync(navigator.onLine ? "Synced" : "Offline");
      setText(journalHint, err?.message || "Save failed.");
      toast("Couldn’t save.");
    } finally {
      saveJournalBtn.disabled = false;
      setText(saveJournalBtn, "Save");
    }
  }

  saveJournalBtn.addEventListener("click", () => saveJournal());
  journalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveJournal();
    }
  });

  // ===== Recent (last 3 days only) =====
  async function loadRecent(page=1) {
    if (!currentUser) return;
    recentPage = page;
    setText(recentPageText, String(recentPage));

    const today = todayISO();
    const from = addDaysISO(today, -2);

    const fromIdx = (recentPage - 1) * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE; // we'll fetch +1 to know next
    setSync("Syncing…");

    // Fetch PAGE_SIZE + 1 to determine hasNext
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, entry_date, content, mood, tags, created_at")
      .eq("user_id", currentUser.id)
      .gte("entry_date", from)
      .lte("entry_date", today)
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx); // inclusive, so this is PAGE_SIZE+1 rows

    setSync("Synced");
    if (error) {
      recentList.innerHTML = `<li class="item"><div class="itemTitle">Error</div><div class="itemMeta">${escapeHtml(error.message)}</div></li>`;
      return;
    }

    const rows = data || [];
    recentHasNext = rows.length > PAGE_SIZE;
    const slice = rows.slice(0, PAGE_SIZE);

    recentPrev.disabled = recentPage <= 1;
    recentNext.disabled = !recentHasNext;

    if (slice.length === 0) {
      recentList.innerHTML = `<li class="item"><div class="itemTitle">No entries.</div><div class="itemMeta">Last 3 days only.</div></li>`;
      return;
    }

    recentList.innerHTML = slice.map(r => renderJournalRow(r)).join("");
  }

  recentPrev.addEventListener("click", () => loadRecent(Math.max(1, recentPage - 1)));
  recentNext.addEventListener("click", () => { if (recentHasNext) loadRecent(recentPage + 1); });

  // ===== History (all time) =====
  async function loadHistory(page=1) {
    if (!currentUser) return;
    histPage = page;
    setText(histPageText, String(histPage));

    const fromIdx = (histPage - 1) * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE; // fetch +1
    setSync("Syncing…");

    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, entry_date, content, mood, tags, created_at")
      .eq("user_id", currentUser.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);

    setSync("Synced");
    if (error) {
      historyList.innerHTML = `<li class="item"><div class="itemTitle">Error</div><div class="itemMeta">${escapeHtml(error.message)}</div></li>`;
      return;
    }

    const rows = data || [];
    histHasNext = rows.length > PAGE_SIZE;
    const slice = rows.slice(0, PAGE_SIZE);

    histPrev.disabled = histPage <= 1;
    histNext.disabled = !histHasNext;

    if (slice.length === 0) {
      historyList.innerHTML = `<li class="item"><div class="itemTitle">No history yet.</div><div class="itemMeta">Start with one line.</div></li>`;
      return;
    }

    historyList.innerHTML = slice.map(r => renderJournalRow(r, true)).join("");
  }

  histPrev.addEventListener("click", () => loadHistory(Math.max(1, histPage - 1)));
  histNext.addEventListener("click", () => { if (histHasNext) loadHistory(histPage + 1); });

  function renderJournalRow(r, showDate=true) {
    const dt = showDate ? (r.entry_date || "") : "";
    const mood = r.mood || "";
    const tags = (r.tags || []).length ? `#${(r.tags || []).join(" #")}` : "";
    const time = (r.created_at || "").replace("T", " ").slice(0, 16);
    return `
      <li class="item">
        <div class="itemTop">
          <div class="itemTitle">${showDate ? escapeHtml(dt) : "Entry"}</div>
          <div class="badge">${escapeHtml(mood)}</div>
        </div>
        <div class="itemMeta">${escapeHtml(r.content || "")}</div>
        <div class="itemMeta">${escapeHtml(tags)} ${tags ? "•" : ""} ${escapeHtml(time)}</div>
      </li>
    `;
  }

  // ===== Streak (day-based) =====
  async function computeStreak() {
    if (!currentUser) return;
    const today = todayISO();
    const from = addDaysISO(today, -60);

    const { data, error } = await supabase
      .from("journal_entries")
      .select("entry_date")
      .eq("user_id", currentUser.id)
      .gte("entry_date", from)
      .lte("entry_date", today);

    if (error || !data) return;

    const days = new Set(data.map(x => x.entry_date));
    let streak = 0;
    let cur = today;
    while (days.has(cur)) {
      streak++;
      cur = addDaysISO(cur, -1);
    }
    setText(streakText, `Streak: ${streak}`);
  }

  // ===== Todo =====
  async function loadTodos() {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) return;
    todos = data || [];
    renderTodos();
  }

  function renderTodos() {
    const today = todayISO();
    const active = todos.filter(t => !t.completed);
    const done = todos.filter(t => t.completed);

    todoList.innerHTML = "";
    doneList.innerHTML = "";

    const mk = (t) => {
      const due = t.due_date ? t.due_date : "";
      const isToday = due && due === today;
      return `
        <li class="item">
          <div class="todoLine">
            <button class="check" data-id="${t.id}" type="button" aria-label="toggle"></button>
            <div class="todoText">${escapeHtml(t.content)}</div>
            ${due ? `<span class="badge ${isToday ? "today" : ""}">${escapeHtml(isToday ? "Today" : due)}</span>` : ""}
            <button class="miniBtn" data-del="${t.id}" type="button">Delete</button>
          </div>
        </li>
      `;
    };

    todoList.innerHTML = active.length
      ? active.map(mk).join("")
      : `<li class="item"><div class="itemTitle">No active tasks.</div><div class="itemMeta">Keep it light.</div></li>`;

    doneList.innerHTML = done.length
      ? done.map(mk).join("")
      : `<li class="item"><div class="itemTitle">No completed tasks.</div><div class="itemMeta">Small wins count.</div></li>`;

    document.querySelectorAll(".check[data-id]").forEach(btn => {
      btn.addEventListener("click", () => toggleTodo(btn.dataset.id));
    });
    document.querySelectorAll(".miniBtn[data-del]").forEach(btn => {
      btn.addEventListener("click", () => deleteTodo(btn.dataset.del));
    });
  }

  async function addTodo(content, due) {
    const text = (content || "").trim();
    if (!text) { toast("Nothing to add."); return; }
    setSync("Syncing…");
    const { error } = await supabase.from("todos").insert([{
      user_id: currentUser.id,
      content: text,
      due_date: due || null,
      completed: false
    }]);
    setSync("Synced");
    if (error) { toast("Couldn’t add."); return; }
    toast("Saved.");
    await loadTodos();
  }

  async function toggleTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    setSync("Syncing…");
    const { error } = await supabase
      .from("todos")
      .update({ completed: !t.completed })
      .eq("id", id);
    setSync("Synced");
    if (error) { toast("Couldn’t update."); return; }
    toast("Saved.");
    await loadTodos();
  }

  async function deleteTodo(id) {
    setSync("Syncing…");
    const { error } = await supabase.from("todos").delete().eq("id", id);
    setSync("Synced");
    if (error) { toast("Couldn’t delete."); return; }
    toast("Deleted.");
    await loadTodos();
  }

  addTodoBtn.addEventListener("click", async () => {
    await addTodo(todoInput.value, todoDue.value || null);
    todoInput.value = "";
    todoDue.value = "";
    todoInput.focus();
  });

  todoInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await addTodo(todoInput.value, todoDue.value || null);
      todoInput.value = "";
      todoDue.value = "";
    }
    if (e.key === "Escape") {
      todoInput.value = "";
      toast("Cleared.");
    }
  });

  // ===== Quick Capture =====
  function setQcTab(name) {
    qcJournalTab.classList.toggle("active", name === "journal");
    qcTodoTab.classList.toggle("active", name === "todo");
    if (name === "journal") { show(qcJournal); hide(qcTodo); }
    else { show(qcTodo); hide(qcJournal); }
  }

  function openModal(defaultTab) {
    show(modal);
    qcHint.textContent = "";
    setQcTab(defaultTab);
    setTimeout(() => (defaultTab === "todo" ? qcTodoText : qcJournalText).focus(), 0);
  }
  function closeModal() { hide(modal); }

  quickBtn.addEventListener("click", () => {
    const onJournal = !journalView.classList.contains("hidden");
    openModal(onJournal ? "journal" : "todo");
  });
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  qcJournalTab.addEventListener("click", () => setQcTab("journal"));
  qcTodoTab.addEventListener("click", () => setQcTab("todo"));

  qcSaveJournal.addEventListener("click", async () => {
    const text = (qcJournalText.value || "").trim();
    if (!text) { qcHint.textContent = "Nothing to save."; return; }
    journalInput.value = text;
    updateCount();
    await saveJournal();
    qcJournalText.value = "";
    closeModal();
  });

  qcAddTodo.addEventListener("click", async () => {
    await addTodo(qcTodoText.value, qcTodoDue.value || null);
    qcTodoText.value = "";
    qcTodoDue.value = "";
    closeModal();
  });

  // ===== Boot =====
  async function boot() {
    entryDate.value = todayISO();
    recentPage = 1;
    histPage = 1;
    await loadRecent(1);
    await loadHistory(1);
    await computeStreak();
    await loadTodos();
    toast("Loaded.");
  }
})();
