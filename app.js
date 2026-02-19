/*************************************************
 * Afterlog v1.0 — FINAL
 * - Boot guard + Supabase singleton (prevents "already declared")
 * - Auth feedback (A: Logging in… / Signing up…)
 * - Journal (1/day), recent 3, streak, jump date
 * - Todo (add/toggle/delete/undo/sort/due/collapse)
 * - Themes (no layout change), toast, quick capture, sync status
 *************************************************/

(() => {
  if (window.__AFTERLOG_BOOTED__) return;
  window.__AFTERLOG_BOOTED__ = true;

  // ===== CONFIG =====
  const SUPABASE_URL = "https://elsydeedgigdqjvpklqy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_kGyupHgHgGCgOyF66C6-BA_VjBIK6an";
  const BUILD = "1.0";

  // ===== Helpers =====
  const $ = (id) => document.getElementById(id);
  const show = (el) => el?.classList.remove("hidden");
  const hide = (el) => el?.classList.add("hidden");
  const setText = (el, t) => { if (el) el.textContent = t; };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const toDate = (iso) => new Date(iso + "T00:00:00");
  const addDays = (iso, d) => {
    const dt = toDate(iso);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().slice(0,10);
  };

  // Toast
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    if (!el) return;
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

  // ===== Supabase SDK guard =====
  const sb = window.supabase || window.supabaseJs;
  if (!sb?.createClient) {
    alert("Supabase SDK not loaded. (Check index.html head script)");
    throw new Error("Supabase SDK not loaded");
  }

  window.__AFTERLOG_SUPABASE__ =
    window.__AFTERLOG_SUPABASE__ ||
    sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const supabase = window.__AFTERLOG_SUPABASE__;

  // ===== Theme =====
  const THEMES = ["gold", "emerald", "mono"];
  function applyTheme(theme) {
    const root = document.documentElement;
    root.dataset.theme = theme === "gold" ? "" : theme;
    // if dataset empty, remove attribute for gold
    if (theme === "gold") root.removeAttribute("data-theme");
  }
  function getTheme() { return localStorage.getItem("afterlog_theme") || "gold"; }
  function setTheme(t) { localStorage.setItem("afterlog_theme", t); applyTheme(t); toast("Theme."); }
  applyTheme(getTheme());
  $("themeBtn")?.addEventListener("click", () => {
    const cur = getTheme();
    const idx = THEMES.indexOf(cur);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
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

  const journalInput = $("journalInput");
  const journalCount = $("journalCount");
  const saveJournalBtn = $("saveJournal");
  const journalList = $("journalList");
  const streakText = $("streakText");
  const jumpDate = $("jumpDate");
  const journalHint = $("journalHint");

  const todoInput = $("todoInput");
  const todoDue = $("todoDue");
  const addTodoBtn = $("addTodo");
  const todoList = $("todoList");
  const doneList = $("doneList");

  // Quick Capture
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

  // ===== Guards (整合性チェック) =====
  const requiredIds = [
    authRoot, appRoot,
    authTabLogin, authTabSignup, authForm, authEmail, authPassword, authAction, authMsg, authError,
    tabJournal, tabTodo, logoutBtn, journalView, todoView,
    journalInput, journalCount, saveJournalBtn, journalList, streakText, jumpDate,
    todoInput, todoDue, addTodoBtn, todoList, doneList,
    modal, modalClose, quickBtn, qcJournalTab, qcTodoTab, qcJournal, qcTodo, qcJournalText, qcSaveJournal, qcTodoText, qcTodoDue, qcAddTodo, qcHint
  ];
  if (requiredIds.some(x => !x)) {
    alert("HTML/JS mismatch: missing element(s). Please use the provided index.html.");
    throw new Error("HTML/JS mismatch");
  }

  // ===== App tab switching =====
  function setMainTab(name) {
    tabJournal.classList.toggle("active", name === "journal");
    tabTodo.classList.toggle("active", name === "todo");
    if (name === "journal") { show(journalView); hide(todoView); }
    else { show(todoView); hide(journalView); }
  }
  tabJournal.addEventListener("click", () => setMainTab("journal"));
  tabTodo.addEventListener("click", () => setMainTab("todo"));
  setMainTab("journal");

  // ===== Auth mode =====
  let authMode = "login";
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

  function setAuthLoading(on, label) {
    authAction.disabled = on;
    authEmail.disabled = on;
    authPassword.disabled = on;
    setText(authAction, on ? label : (authMode === "login" ? "Log in" : "Sign up"));
  }

  function humanizeAuthError(msg) {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "Couldn’t verify. Check email/password.";
    if (m.includes("password") && m.includes("length")) return "Password is too short.";
    if (m.includes("rate limit")) return "Too many attempts. Please wait a bit.";
    if (m.includes("email") && m.includes("already")) return "This email is already registered.";
    return msg || "Auth error";
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setText(authMsg, "");
    setText(authError, "");

    const email = (authEmail.value || "").trim();
    const password = authPassword.value || "";

    if (!email || !password) {
      setText(authError, "Please enter email and password.");
      return;
    }
    if (password.length < 6) {
      setText(authError, "Password must be at least 6 characters.");
      return;
    }

    setAuthLoading(true, authMode === "login" ? "Logging in…" : "Signing up…");
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
      setAuthLoading(false, "");
    }
  });

  logoutBtn.addEventListener("click", async () => {
    setSync("Syncing…");
    await supabase.auth.signOut();
    setSync("Synced");
    toast("Signed out.");
  });

  // ===== Routing by session =====
  let currentUserId = null;
  function route(session) {
    if (session?.user) {
      currentUserId = session.user.id;
      hide(authRoot);
      show(appRoot);
      bootData(); // load data when logged in
    } else {
      currentUserId = null;
      show(authRoot);
      hide(appRoot);
    }
  }
  supabase.auth.getSession().then(({ data }) => route(data?.session));
  supabase.auth.onAuthStateChange((_e, session) => route(session));

  // ===== Journal state =====
  let selectedMood = null;
  let autoSaveTimer = null;
  let lastSavedText = "";

  // Mood selection
  document.querySelectorAll(".miniChip[data-mood]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      selectedMood = (selectedMood === mood) ? null : mood;
      // visual select
      document.querySelectorAll(".miniChip[data-mood]").forEach(b => b.style.outline = "");
      if (selectedMood) btn.style.outline = "2px solid rgba(255,255,255,.22)";
      toast(selectedMood ? `Mood ${selectedMood}` : "Mood cleared.");
    });
  });

  function updateCount() {
    const len = (journalInput.value || "").length;
    setText(journalCount, `${len} / 160`);
  }
  journalInput.addEventListener("input", () => {
    updateCount();
    setText(journalHint, "");
    // autosave after 3s idle
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      // silent autosave only if changed + non-empty
      const text = (journalInput.value || "").trim();
      if (text && text !== lastSavedText) saveJournal({ silent: true });
    }, 3000);
  });
  updateCount();

  journalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveJournal();
    }
  });

  saveJournalBtn.addEventListener("click", () => saveJournal());

  jumpDate.value = todayISO();
  jumpDate.addEventListener("change", async () => {
    const iso = jumpDate.value || todayISO();
    await loadJournalForDate(iso);
    toast("Loaded.");
  });

  async function saveJournal({ silent = false } = {}) {
    const text = (journalInput.value || "").trim();
    if (!text) {
      setText(journalHint, "Nothing written today. That’s okay.");
      if (!silent) toast("Nothing to save.");
      return;
    }
    if (!currentUserId) return;

    const dateIso = jumpDate.value || todayISO();
    setSync("Syncing…");
    try {
      // upsert by unique (user_id, entry_date)
      const { error } = await supabase
        .from("journal_entries")
        .upsert({
          user_id: currentUserId,
          entry_date: dateIso,
          content: text,
          mood: selectedMood,
          tags: []
        }, { onConflict: "user_id,entry_date" });

      if (error) throw error;

      lastSavedText = text;
      setSync("Synced");
      if (!silent) toast("Saved.");
      await loadRecent();
      await computeStreak();
    } catch (err) {
      setSync(navigator.onLine ? "Synced" : "Offline");
      if (!silent) toast("Couldn’t save.");
      setText(journalHint, err?.message || "Save failed.");
    }
  }

  async function loadJournalForDate(iso) {
    if (!currentUserId) return;
    setSync("Syncing…");
    const { data, error } = await supabase
      .from("journal_entries")
      .select("entry_date, content, mood")
      .eq("user_id", currentUserId)
      .eq("entry_date", iso)
      .maybeSingle();

    setSync("Synced");

    if (error) {
      setText(journalHint, error.message);
      return;
    }

    if (!data) {
      journalInput.value = "";
      lastSavedText = "";
      selectedMood = null;
      document.querySelectorAll(".miniChip[data-mood]").forEach(b => b.style.outline = "");
      updateCount();
      setText(journalHint, "Nothing written today. That’s okay.");
      return;
    }

    journalInput.value = data.content || "";
    lastSavedText = data.content || "";
    selectedMood = data.mood || null;
    document.querySelectorAll(".miniChip[data-mood]").forEach(b => {
      b.style.outline = (selectedMood && b.dataset.mood === selectedMood) ? "2px solid rgba(255,255,255,.22)" : "";
    });
    updateCount();
    setText(journalHint, iso === todayISO() ? "Today." : "Loaded.");
  }

  async function loadRecent() {
    if (!currentUserId) return;
    const today = todayISO();
    const from = addDays(today, -2); // last 3 days (today-2..today)
    const { data, error } = await supabase
      .from("journal_entries")
      .select("entry_date, content, mood")
      .eq("user_id", currentUserId)
      .gte("entry_date", from)
      .lte("entry_date", today)
      .order("entry_date", { ascending: false });

    if (error) return;

    journalList.innerHTML = "";
    if (!data || data.length === 0) {
      journalList.innerHTML = `<li class="item"><div class="itemTitle">No entries yet.</div><div class="itemMeta">Start with one line.</div></li>`;
      return;
    }

    for (const row of data) {
      const isToday = row.entry_date === todayISO();
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML = `
        <div class="itemTop">
          <div class="itemTitle">${isToday ? "Today" : row.entry_date}</div>
          <div class="badge ${isToday ? "today" : ""}">${row.mood ? row.mood : ""}</div>
        </div>
        <div class="itemMeta">${escapeHtml(row.content)}</div>
      `;
      li.addEventListener("click", async () => {
        jumpDate.value = row.entry_date;
        await loadJournalForDate(row.entry_date);
        toast("Loaded.");
      });
      journalList.appendChild(li);
    }
  }

  async function computeStreak() {
    if (!currentUserId) return;
    // fetch last 60 days entries dates
    const today = todayISO();
    const from = addDays(today, -60);
    const { data, error } = await supabase
      .from("journal_entries")
      .select("entry_date")
      .eq("user_id", currentUserId)
      .gte("entry_date", from)
      .lte("entry_date", today);

    if (error || !data) return;

    const set = new Set(data.map(r => r.entry_date));
    let streak = 0;
    let cursor = today;
    while (set.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    setText(streakText, `Streak: ${streak}`);
  }

  // ===== Todo state =====
  let todos = [];
  let undo = null; // { row, timer }

  function renderTodos() {
    const today = todayISO();
    const active = todos.filter(t => !t.completed).sort((a,b) => (a.due_date||"9999") > (b.due_date||"9999") ? 1 : -1);
    const done = todos.filter(t => t.completed).sort((a,b) => (a.updated_at||"") < (b.updated_at||"") ? 1 : -1);

    todoList.innerHTML = "";
    doneList.innerHTML = "";

    const mk = (t) => {
      const li = document.createElement("li");
      li.className = "item";
      const due = t.due_date ? t.due_date : "";
      const isToday = due && due === today;
      li.innerHTML = `
        <div class="todoLine">
          <button class="check" type="button" aria-label="toggle"></button>
          <div class="todoText">${escapeHtml(t.content)}</div>
          ${due ? `<span class="badge ${isToday ? "today" : ""}">${isToday ? "Today" : due}</span>` : ""}
          <button class="miniBtn" type="button">Delete</button>
        </div>
      `;
      const checkBtn = li.querySelector(".check");
      const delBtn = li.querySelector(".miniBtn");
      checkBtn.addEventListener("click", () => toggleTodo(t));
      delBtn.addEventListener("click", () => deleteTodo(t));
      return li;
    };

    if (active.length === 0) {
      todoList.innerHTML = `<li class="item"><div class="itemTitle">No active tasks.</div><div class="itemMeta">Keep it light.</div></li>`;
    } else {
      active.forEach(t => todoList.appendChild(mk(t)));
    }

    if (done.length === 0) {
      doneList.innerHTML = `<li class="item"><div class="itemTitle">No completed tasks.</div><div class="itemMeta">Small wins count.</div></li>`;
    } else {
      done.forEach(t => doneList.appendChild(mk(t)));
    }
  }

  async function loadTodos() {
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });
    if (error) return;
    todos = data || [];
    renderTodos();
  }

  async function addTodo(content, due) {
    const text = (content || "").trim();
    if (!text) { toast("Nothing to add."); return; }
    setSync("Syncing…");
    const payload = { user_id: currentUserId, content: text, due_date: due || null, completed:false };
    const { data, error } = await supabase.from("todos").insert(payload).select("*").single();
    setSync("Synced");
    if (error) { toast("Couldn’t add."); return; }
    todos.unshift(data);
    renderTodos();
    toast("Saved.");
  }

  async function toggleTodo(t) {
    setSync("Syncing…");
    const { data, error } = await supabase
      .from("todos")
      .update({ completed: !t.completed })
      .eq("id", t.id)
      .select("*")
      .single();
    setSync("Synced");
    if (error) { toast("Couldn’t update."); return; }
    todos = todos.map(x => x.id === t.id ? data : x);
    renderTodos();
    toast("Saved.");
  }

  async function deleteTodo(t) {
    // optimistic remove + undo window
    const removed = t;
    todos = todos.filter(x => x.id !== t.id);
    renderTodos();
    toast("Deleted. Undo?");

    if (undo?.timer) clearTimeout(undo.timer);
    undo = {
      row: removed,
      timer: setTimeout(async () => {
        // commit delete after 5s
        setSync("Syncing…");
        await supabase.from("todos").delete().eq("id", removed.id);
        setSync("Synced");
        undo = null;
      }, 5000)
    };

    // click toast to undo (simple)
    $("toast").onclick = async () => {
      if (!undo) return;
      clearTimeout(undo.timer);
      // restore row in DB if already deleted? in our flow not yet deleted
      todos.unshift(undo.row);
      undo = null;
      renderTodos();
      toast("Restored.");
      $("toast").onclick = null;
    };
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
  function openModal(defaultTab) {
    show(modal);
    if (defaultTab === "todo") setQcTab("todo");
    else setQcTab("journal");
    qcHint.textContent = "";
    setTimeout(() => {
      (defaultTab === "todo" ? qcTodoText : qcJournalText).focus();
    }, 0);
  }
  function closeModal() { hide(modal); }

  function setQcTab(name) {
    qcJournalTab.classList.toggle("active", name === "journal");
    qcTodoTab.classList.toggle("active", name === "todo");
    if (name === "journal") { show(qcJournal); hide(qcTodo); }
    else { show(qcTodo); hide(qcJournal); }
  }

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
    // save to selected jump date (today by default)
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

  qcTodoText.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await addTodo(qcTodoText.value, qcTodoDue.value || null);
      qcTodoText.value = "";
      qcTodoDue.value = "";
      closeModal();
    }
    if (e.key === "Escape") closeModal();
  });

  // ===== Boot data after login =====
  async function bootData() {
    // initialize journal for today
    jumpDate.value = todayISO();
    await loadJournalForDate(todayISO());
    await loadRecent();
    await computeStreak();
    await loadTodos();
    toast(`Loaded. (v${BUILD})`);
  }

  // ===== HTML escape =====
  function escapeHtml(str) {
    return (str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
