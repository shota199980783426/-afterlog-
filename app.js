// ===== Supabase =====
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_KEY";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DOM =====
const auth = document.getElementById("auth");
const app = document.getElementById("app");

const tabJournal = document.getElementById("tabJournal");
const tabTodo = document.getElementById("tabTodo");
const journalView = document.getElementById("journalView");
const todoView = document.getElementById("todoView");

const toast = document.getElementById("toast");
const syncStatus = document.getElementById("syncStatus");

// ===== Helpers =====
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}
function setSync(text) {
  syncStatus.textContent = text;
}

// ===== Auth =====
document.getElementById("loginBtn").onclick = async () => {
  setSync("Syncing");
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  setSync("Synced");
  if (error) showToast(error.message);
};

document.getElementById("signupBtn").onclick = async () => {
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value
  });
  showToast(error ? error.message : "Check your email");
};

document.getElementById("logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
  location.reload();
};

supabase.auth.onAuthStateChange((_e, session) => {
  if (session) {
    auth.classList.add("hidden");
    app.classList.remove("hidden");
    loadJournal();
    loadTodos();
  }
});

// ===== Tabs =====
tabJournal.onclick = () => {
  tabJournal.classList.add("active");
  tabTodo.classList.remove("active");
  journalView.classList.remove("hidden");
  todoView.classList.add("hidden");
};
tabTodo.onclick = () => {
  tabTodo.classList.add("active");
  tabJournal.classList.remove("active");
  todoView.classList.remove("hidden");
  journalView.classList.add("hidden");
};

// ===== Journal =====
async function loadJournal() {
  const { data } = await supabase
    .from("journal_entries")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  journalList.innerHTML = "";
  data.forEach(row => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${row.content}</span>
      <button data-id="${row.id}">×</button>`;
    li.querySelector("button").onclick = () => deleteJournal(row.id);
    journalList.appendChild(li);
  });
}

async function deleteJournal(id) {
  await supabase.from("journal_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  showToast("Deleted");
  loadJournal();
}

saveJournal.onclick = async () => {
  if (!journalInput.value) return;
  setSync("Syncing");
  await supabase.from("journal_entries").insert({
    content: journalInput.value
  });
  journalInput.value = "";
  setSync("Synced");
  loadJournal();
};

// ===== Todo =====
async function loadTodos() {
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(4,0,0,0);
  if (now < todayStart) todayStart.setDate(todayStart.getDate()-1);

  const { data } = await supabase
    .from("todos")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  todoActive.innerHTML = "";
  todoCompleted.innerHTML = "";

  data.forEach(t => {
    const li = document.createElement("li");
    const doneToday = t.is_done && t.done_at && new Date(t.done_at) >= todayStart;
    li.innerHTML = `
      <label>
        <input type="checkbox" ${doneToday ? "checked" : ""}>
        ${t.text}
      </label>
      <button>×</button>
    `;

    li.querySelector("input").onchange = async (e) => {
      await supabase.from("todos").update({
        is_done: e.target.checked,
        done_at: e.target.checked ? new Date().toISOString() : null
      }).eq("id", t.id);
      loadTodos();
    };

    li.querySelector("button").onclick = async () => {
      await supabase.from("todos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", t.id);
      showToast("Deleted");
      loadTodos();
    };

    (doneToday ? todoCompleted : todoActive).appendChild(li);
  });
}

addTodo.onclick = async () => {
  if (!todoInput.value) return;
  await supabase.from("todos").insert({ text: todoInput.value });
  todoInput.value = "";
  loadTodos();
};
