import * as vault from "./crypto.js";
import { generate, passphrase, strength } from "./generator.js";
import { loadBlob, saveBlob } from "./store.js";
import { detectAndParse, newOnly, exportCsv } from "./importers.js";
import * as totp from "./totp.js";
import { report, breached } from "./health.js";

const app = document.getElementById("app");
const IDLE_MS = 5 * 60 * 1000;
const CLIP_MS = 20 * 1000;

const state = {
  blob: null,
  session: null,
  data: null,
  selected: null,
  editing: false,
  pane: null,
  query: "",
  pending: null, // a login the browser wants saved, handed over by the background page in wren
};

// ---- tiny dom helper: text only, never innerHTML, so entries cannot inject markup ----
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
}

let toastTimer;
function toast(text) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", role: "status" }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

let clipTimer;
async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast("could not copy");
    return;
  }
  toast(`${what} copied, clears in 20 seconds`);
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), CLIP_MS);
}

function meter(input) {
  const bar = h("i");
  const wrap = h("div", { class: "meter" }, bar);
  const label = h("div", { class: "soft", style: "font-size:.8rem;margin-top:4px" });
  const update = () => {
    const s = strength(input.value);
    bar.style.width = input.value ? `${s.level * 33.3}%` : "0";
    bar.className = `l${s.level}`;
    label.textContent = input.value ? s.label : "";
  };
  input.addEventListener("input", update);
  return [wrap, label];
}

// ---- gate screens ----

function gate(title, blurb, ...rest) {
  return h(
    "div",
    { class: "gate" },
    h("img", { class: "logo", src: "assets/logo.svg", alt: "" }),
    h("h1", {}, title),
    h("p", { class: "soft" }, blurb),
    ...rest
  );
}

function setupScreen() {
  const pw = h("input", { type: "password", autocomplete: "new-password", required: true });
  const pw2 = h("input", { type: "password", autocomplete: "new-password", required: true });
  const msg = h("div", { class: "msg warn" });
  const go = h("button", { class: "btn", type: "submit" }, "create vault");
  const form = h(
    "form",
    {
      class: "card",
      onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value.length < 8) return void (msg.textContent = "use at least 8 characters");
        if (pw.value !== pw2.value) return void (msg.textContent = "the two passwords differ");
        go.disabled = true;
        msg.className = "msg soft";
        msg.textContent = "scrambling, this takes a moment";
        try {
          const made = await vault.createVault(pw.value);
          await saveBlob(made.blob);
          state.blob = made.blob;
          state.session = made.session;
          state.data = { entries: [] };
          recoveryScreen(made.recoveryKey);
        } catch (err) {
          go.disabled = false;
          msg.className = "msg warn";
          msg.textContent = err.message;
        }
      },
    },
    h("label", {}, "master password"),
    pw,
    ...meter(pw),
    h("label", {}, "again"),
    pw2,
    h("p", { class: "soft", style: "font-size:.85rem;margin:12px 0" },
      "there is no reset. if you lose this password and your recovery key, the vault cannot be opened by anyone."),
    go,
    msg
  );
  const restore = h("input", { type: "file", accept: ".json", class: "hide", onchange: async (e) => {
    try {
      const blob = JSON.parse(await e.target.files[0].text());
      if (blob.v !== 1 || !blob.wrapPw || !blob.data) throw new Error();
      await saveBlob(blob);
      state.blob = blob;
      lockScreen();
      toast("backup restored, unlock it with its master password");
    } catch {
      msg.className = "msg warn";
      msg.textContent = "that is not a burrow backup";
    }
  } });
  show(gate("burrow", "a quiet place for your passwords. nothing here leaves your device.", form,
    h("p", { class: "soft", style: "font-size:.85rem;margin-top:16px" }, "already have a backup? ",
      h("button", { class: "link", type: "button", onclick: () => restore.click() }, "restore it"), restore)));
  pw.focus();
}

function recoveryScreen(key) {
  const ok = h("input", { type: "checkbox", style: "width:auto;margin-right:8px" });
  const next = h("button", { class: "btn", disabled: true, onclick: openVault }, "open my vault");
  ok.addEventListener("change", () => (next.disabled = !ok.checked));
  show(
    gate(
      "your recovery key",
      "this opens your vault if you forget the master password. it is shown once.",
      h("div", { class: "card stack" },
        h("div", { class: "keybox" }, key),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", onclick: () => copy(key, "key") }, "copy"),
          h("button", { class: "btn ghost", onclick: () => saveText("burrow-recovery-key.txt", key + "\n") }, "save as file")),
        h("label", { style: "color:var(--text)" }, ok, "i saved it somewhere safe"),
        next)
    )
  );
}

function lockScreen() {
  const pw = h("input", { type: "password", autocomplete: "current-password", required: true });
  const msg = h("div", { class: "msg warn" });
  const go = h("button", { class: "btn", type: "submit" }, "unlock");
  show(
    gate(
      "burrow",
      "your vault is locked.",
      h("form", {
        class: "card",
        onsubmit: async (e) => {
          e.preventDefault();
          go.disabled = true;
          msg.className = "msg soft";
          msg.textContent = "opening";
          try {
            const { session } = await vault.unlock(state.blob, pw.value);
            await enter(session);
          } catch (err) {
            go.disabled = false;
            msg.className = "msg warn";
            msg.textContent = err.message;
            pw.select();
          }
        },
      },
        h("label", {}, "master password"), pw,
        h("div", { style: "margin-top:14px" }, go),
        msg,
        h("div", { class: "soft", style: "font-size:.85rem" },
          "forgot it? ", h("button", { class: "link", type: "button", onclick: recoveryUnlockScreen }, "use your recovery key")))
    )
  );
  pw.focus();
}

function recoveryUnlockScreen() {
  const key = h("input", { type: "text", autocomplete: "off", spellcheck: false, required: true, placeholder: "xxxxx-xxxxx-xxxxx-..." });
  const msg = h("div", { class: "msg warn" });
  show(
    gate("recovery", "enter the key you saved when you made this vault.",
      h("form", {
        class: "card",
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            const { session } = await vault.unlockWithRecovery(state.blob, key.value);
            await enter(session);
            toast("opened. choose a new master password now.");
            changePasswordScreen();
          } catch (err) {
            msg.textContent = err.message;
          }
        },
      },
        h("label", {}, "recovery key"), key,
        h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "submit" }, "open"),
          " ", h("button", { class: "btn ghost", type: "button", onclick: lockScreen }, "back")),
        msg)
    )
  );
  key.focus();
}

function changePasswordScreen() {
  const pw = h("input", { type: "password", autocomplete: "new-password", required: true });
  const pw2 = h("input", { type: "password", autocomplete: "new-password", required: true });
  const msg = h("div", { class: "msg warn" });
  show(
    gate("new master password", "your entries stay exactly as they are.",
      h("form", {
        class: "card",
        onsubmit: async (e) => {
          e.preventDefault();
          if (pw.value.length < 8) return void (msg.textContent = "use at least 8 characters");
          if (pw.value !== pw2.value) return void (msg.textContent = "the two passwords differ");
          msg.className = "msg soft";
          msg.textContent = "scrambling, this takes a moment";
          const { blob } = await vault.changePassword(state.blob, state.session, pw.value);
          await saveBlob(blob);
          state.blob = blob;
          toast("master password changed");
          render();
        },
      },
        h("label", {}, "new master password"), pw, ...meter(pw),
        h("label", {}, "again"), pw2,
        h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "submit" }, "change"),
          " ", h("button", { class: "btn ghost", type: "button", onclick: render }, "cancel")),
        msg)
    )
  );
  pw.focus();
}

// ---- vault ----

async function enter(session) {
  state.session = session;
  state.data = await vault.readData(state.blob, session);
  openVault();
}

function openVault() {
  state.selected = state.data.entries[0]?.id ?? null;
  state.editing = false;
  state.query = "";
  armIdle();
  render();
  announce();
  if (state.pending) {
    const p = state.pending;
    state.pending = null;
    startEdit(null, p);
  }
}

// In wren the background page fills logins into web pages, so it needs to know what is unlocked.
// It keeps this in memory only, and it is cleared on lock. Elsewhere `burrowHost` does not exist.
function announce() {
  const unlocked = Boolean(state.session);
  globalThis.burrowHost?.({
    locked: !unlocked,
    entries: unlocked ? state.data.entries.map(({ id, site, url, user, pass }) => ({ id, site, url, user, pass })) : [],
  });
}
globalThis.burrowLock = () => state.session && lock();

async function commit(data) {
  const blob = await vault.writeData(state.blob, state.session, data);
  await saveBlob(blob);
  state.blob = blob;
  state.data = data;
  announce();
}

function lock() {
  state.session?.lock();
  Object.assign(state, { session: null, data: null, selected: null, editing: false, pane: null, query: "" });
  clearTimeout(idleTimer);
  clearInterval(totpTimer);
  announce();
  lockScreen();
}

let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  if (state.session) idleTimer = setTimeout(lock, IDLE_MS);
}
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, armIdle, true);
document.addEventListener("keydown", (e) => {
  if (!state.session || !e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (key === "l") {
    e.preventDefault();
    lock();
  } else if (key === "k") {
    e.preventDefault();
    if (state.editing || state.pane) { state.editing = false; state.pane = null; render(); }
    const box = document.querySelector('input[type="search"]');
    box?.focus();
    box?.select();
  }
});

function saveText(name, text, type = "text/plain") {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

function visibleEntries() {
  const q = state.query.trim().toLowerCase();
  return state.data.entries
    .filter((e) => !q || `${e.site} ${e.user}`.toLowerCase().includes(q))
    .sort((a, b) => a.site.localeCompare(b.site));
}

let totpTimer;

function render() {
  if (!state.session) return;
  clearInterval(totpTimer);
  const list = visibleEntries();
  const search = h("input", {
    type: "search", placeholder: "search", value: state.query, "aria-label": "search",
    onkeydown: (e) => {
      if (e.key === "Enter" && list[0]) select(list[0].id);
    },
    oninput: (e) => {
      state.query = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const again = document.querySelector('input[type="search"]');
      again.focus();
      again.setSelectionRange(pos, pos);
    },
  });
  const side = h("aside", { class: "side" },
    h("header", {}, h("span", { class: "brand" }, "burrow"),
      h("button", { class: "btn ghost", onclick: lock, title: "lock (ctrl+l)" }, "lock")),
    search,
    h("button", { class: "btn", onclick: () => startEdit(null) }, "new entry"),
    h("div", { class: "list" },
      list.map((e) =>
        h("button", { class: "item" + (e.id === state.selected ? " on" : ""), onclick: () => select(e.id) },
          h("b", {}, e.site || "untitled"), h("span", {}, e.user || " ")))),
    h("div", { class: "soft", style: "font-size:.85rem" },
      h("button", { class: "link", onclick: () => { state.pane = "tools"; state.editing = false; render(); } }, "tools"), " · ",
      h("button", { class: "link", onclick: changePasswordScreen }, "change password"), " · ",
      h("button", { class: "link", onclick: backup }, "save backup")));
  show(h("div", { class: "shell" }, side, h("section", { class: "main" }, mainPane())));
}

function select(id) {
  state.selected = id;
  state.editing = false;
  state.pane = null;
  render();
}

function backup() {
  saveText("burrow-vault.json", JSON.stringify(state.blob, null, 2), "application/json");
  toast("encrypted backup saved");
}

function mainPane() {
  if (state.editing) return editForm();
  if (state.pane === "tools") return toolsPane();
  const entry = state.data.entries.find((e) => e.id === state.selected);
  if (!entry) {
    return h("div", { class: "empty" },
      h("h2", {}, state.data.entries.length ? "pick an entry" : "nothing here yet"),
      h("p", { class: "soft" }, state.data.entries.length ? "or make a new one." : "add your first login with new entry."));
  }
  return viewEntry(entry);
}

function viewEntry(e) {
  let shown = false;
  const pass = h("code", {}, "••••••••••");
  const reveal = h("button", { class: "link", onclick: () => {
    shown = !shown;
    pass.textContent = shown ? e.pass : "••••••••••";
    reveal.textContent = shown ? "hide" : "show";
  } }, "show");
  const field = (label, value, copyable) =>
    value
      ? h("div", { class: "field" }, h("small", {}, label),
          h("div", { class: "val" }, h("span", {}, value),
            copyable && h("button", { class: "link", onclick: () => copy(value, label) }, "copy")))
      : null;
  return h("div", {},
    h("h2", {}, e.site || "untitled"),
    h("div", { class: "card" },
      field("username", e.user, true),
      h("div", { class: "field" }, h("small", {}, "password"),
        h("div", { class: "val" }, pass, h("span", {}, reveal, " · ",
          h("button", { class: "link", onclick: () => copy(e.pass, "password") }, "copy")))),
      e.totp && totpField(e),
      e.notes && h("div", { class: "field" }, h("small", {}, "notes"),
        h("div", { style: "white-space:pre-wrap" }, e.notes))),
    h("p", { class: "soft", style: "font-size:.85rem" }, `changed ${new Date(e.changed).toLocaleDateString()}`),
    h("div", { class: "row" },
      h("button", { class: "btn ghost", onclick: () => startEdit(e.id) }, "edit"),
      h("button", { class: "btn danger", onclick: async () => {
        if (!confirm(`delete ${e.site || "this entry"}? this cannot be undone.`)) return;
        await commit({ ...state.data, entries: state.data.entries.filter((x) => x.id !== e.id) });
        state.selected = visibleEntries()[0]?.id ?? null;
        render();
        toast("deleted");
      } }, "delete")));
}

function totpField(e) {
  const num = h("code", {}, "······");
  const left = h("span", { class: "soft" }, "");
  let current = "";
  const tick = async () => {
    try {
      current = await totp.code(e.totp);
      num.textContent = current.replace(/(\d{3})(\d{3})/, "$1 $2");
      left.textContent = `${totp.secondsLeft()}s`;
    } catch {
      num.textContent = "invalid secret";
      left.textContent = "";
      clearInterval(totpTimer);
    }
  };
  tick();
  totpTimer = setInterval(tick, 1000);
  return h("div", { class: "field" }, h("small", {}, "one-time code"),
    h("div", { class: "val" }, num, h("span", {}, left, " ",
      h("button", { class: "link", onclick: () => current && copy(current, "code") }, "copy"))));
}

function toolsPane() {
  const msg = h("div", { class: "msg soft" });
  const say = (text, bad) => { msg.className = "msg " + (bad ? "warn" : "soft"); msg.textContent = text; };
  const out = h("div", { class: "stack" });

  const file = h("input", { type: "file", accept: ".csv,.json", class: "hide", onchange: async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const fresh = newOnly(state.data.entries, detectAndParse(await f.text()));
      if (!fresh.length) return say("nothing new in that file");
      await commit({ ...state.data, entries: [...state.data.entries, ...fresh] });
      render();
      toast(`added ${fresh.length} ${fresh.length === 1 ? "entry" : "entries"}`);
    } catch (err) {
      say(err.message, true);
    }
  } });

  const list = (entries) => h("div", {}, entries.map((e) =>
    h("button", { class: "item", onclick: () => select(e.id) }, h("b", {}, e.site), h("span", {}, e.user || " "))));

  const checkup = () => {
    const r = report(state.data.entries);
    out.replaceChildren(
      h("h3", {}, "weak passwords"),
      r.weak.length ? list(r.weak) : h("p", { class: "soft" }, "none, nice."),
      h("h3", {}, "reused passwords"),
      ...(r.reused.length
        ? r.reused.map((g) => h("div", { class: "card", style: "margin-bottom:8px" }, list(g)))
        : [h("p", { class: "soft" }, "none, nice.")]));
  };

  const breach = async () => {
    if (!confirm("this sends the first 5 characters of a scrambled fingerprint of each password to haveibeenpwned.com. never the password itself. continue?")) return;
    say("checking");
    try {
      const hits = await breached(state.data.entries);
      say(hits.length ? "" : "none of your passwords appear in known breaches.");
      out.replaceChildren(
        h("h3", {}, "found in breaches"),
        hits.length
          ? h("div", {}, hits.map(({ entry: e, count }) =>
              h("button", { class: "item", onclick: () => select(e.id) },
                h("b", {}, e.site), h("span", { class: "warn" }, `seen ${count.toLocaleString()} times, change it`))))
          : h("p", { class: "soft" }, "all clear."));
    } catch (err) {
      say(err.message, true);
    }
  };

  const exportPlain = () => {
    if (!confirm("this file holds every password in plain text. keep it safe and delete it when you are done. continue?")) return;
    saveText("burrow-export.csv", exportCsv(state.data.entries), "text/csv");
  };

  return h("div", {},
    h("h2", {}, "tools"),
    h("div", { class: "card stack" },
      h("div", {}, h("b", {}, "import"),
        h("p", { class: "soft", style: "margin:4px 0 8px" }, "a password export from chrome, edge, firefox or bitwarden (json). it is read on this device only."),
        h("button", { class: "btn ghost", onclick: () => file.click() }, "choose a file"), file),
      h("div", {}, h("b", {}, "checkup"),
        h("p", { class: "soft", style: "margin:4px 0 8px" }, "finds weak and reused passwords. stays on your device."),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", onclick: checkup }, "run checkup"),
          h("button", { class: "btn ghost", onclick: breach }, "check for breaches"))),
      h("div", {}, h("b", {}, "export"),
        h("p", { class: "soft", style: "margin:4px 0 8px" }, "the encrypted backup is safe to keep anywhere. the csv is readable by anyone."),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", onclick: backup }, "encrypted backup"),
          h("button", { class: "btn danger", onclick: exportPlain }, "plain csv")))),
    msg, out);
}

function startEdit(id, prefill = null) {
  state.pane = null;
  state.prefill = prefill;
  state.editing = id ?? "new";
  render();
  document.getElementById("f-site")?.focus();
}

function editForm() {
  const old = state.data.entries.find((e) => e.id === state.editing);
  const start = old ?? state.prefill ?? {};
  const f = (id, label, val = "", extra = {}) => [
    h("label", { for: id }, label),
    h("input", { id, value: val, autocomplete: "off", spellcheck: false, ...extra }),
  ];
  const opts = { length: 20, lower: true, upper: true, digits: true, symbols: true };
  const passInput = h("input", { id: "f-pass", value: start.pass ?? "", autocomplete: "off", spellcheck: false });
  const words = { mode: "chars", count: 7, capitalize: false, number: false };
  const gen = () => {
    passInput.value = words.mode === "words" ? passphrase(words) : generate(opts);
    passInput.dispatchEvent(new Event("input"));
  };
  const lenOut = h("span", {}, String(opts.length));
  const box = (key, label) =>
    h("label", {}, h("input", { type: "checkbox", checked: opts[key], onchange: (e) => {
      opts[key] = e.target.checked;
      if (!Object.values(opts).slice(1).some(Boolean)) { opts[key] = true; e.target.checked = true; }
    } }), label);
  const countOut = h("span", {}, String(words.count));
  const charsPart = h("div", {},
    h("div", { class: "row" }, h("span", { class: "soft" }, "length"),
      h("input", { type: "range", min: 8, max: 64, value: opts.length, oninput: (e) => {
        opts.length = +e.target.value; lenOut.textContent = e.target.value;
      } }), lenOut),
    h("div", { class: "opts" }, box("lower", "abc"), box("upper", "ABC"), box("digits", "123"), box("symbols", "!@#")));
  const wordsPart = h("div", { class: "hide" },
    h("div", { class: "row" }, h("span", { class: "soft" }, "words"),
      h("input", { type: "range", min: 4, max: 12, value: words.count, oninput: (e) => {
        words.count = +e.target.value; countOut.textContent = e.target.value;
      } }), countOut),
    h("div", { class: "opts" },
      h("label", {}, h("input", { type: "checkbox", onchange: (e) => (words.capitalize = e.target.checked) }), "Capitals"),
      h("label", {}, h("input", { type: "checkbox", onchange: (e) => (words.number = e.target.checked) }), "a number")),
    h("p", { class: "soft", style: "font-size:.8rem;margin:0 0 8px" }, "each word adds 8 bits. 7 words is about 56 bits, easy to type and remember."));
  const kind = h("select", { "aria-label": "kind of password", onchange: (e) => {
    words.mode = e.target.value;
    charsPart.classList.toggle("hide", words.mode === "words");
    wordsPart.classList.toggle("hide", words.mode !== "words");
  } }, h("option", { value: "chars" }, "random characters"), h("option", { value: "words" }, "words"));
  const panel = h("div", { class: "gen hide" }, kind, charsPart, wordsPart,
    h("button", { class: "btn", type: "button", onclick: gen }, "fill with a new password"));

  const msg = h("div", { class: "msg warn" });
  return h("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value.trim();
      const entry = {
        id: old?.id ?? crypto.randomUUID(),
        site: val("f-site"),
        url: val("f-url"),
        user: val("f-user"),
        pass: document.getElementById("f-pass").value,
        notes: document.getElementById("f-notes").value,
        totp: totp.secretFrom(document.getElementById("f-totp").value),
        changed: Date.now(),
      };
      if (entry.totp) {
        try { await totp.code(entry.totp); } catch { return void (msg.textContent = "that one-time secret is not valid"); }
      }
      if (!entry.site) return void (msg.textContent = "give it a name or site");
      const entries = old
        ? state.data.entries.map((x) => (x.id === old.id ? entry : x))
        : [...state.data.entries, entry];
      await commit({ ...state.data, entries });
      state.selected = entry.id;
      state.editing = false;
      render();
      toast("saved");
      if (state.prefill) {
        state.prefill = null;
        setTimeout(() => globalThis.burrowPending && window.close(), 900); // opened from a login in wren: done
      }
    },
  },
    h("h2", {}, old ? "edit entry" : "new entry"),
    h("div", { class: "card" },
      f("f-site", "site or name", start.site, { required: true }),
      f("f-url", "web address (used to fill logins in wren)", start.url, { placeholder: "https://example.com" }),
      f("f-user", "username", start.user),
      h("label", { for: "f-pass" }, "password"),
      h("div", { class: "row" }, passInput,
        h("button", { class: "btn ghost", type: "button", onclick: () => panel.classList.toggle("hide") }, "generate")),
      panel,
      ...f("f-totp", "one-time code secret (optional)", old?.totp, { placeholder: "paste the setup key or otpauth link" }),
      h("label", { for: "f-notes" }, "notes"),
      h("textarea", { id: "f-notes" }, old?.notes ?? "")),
    h("div", { class: "row", style: "margin-top:14px" },
      h("button", { class: "btn", type: "submit" }, "save"),
      h("button", { class: "btn ghost", type: "button", onclick: () => { state.editing = false; state.prefill = null; render(); } }, "cancel")),
    msg);
}

// ---- start ----

(async function boot() {
  state.pending = (await globalThis.burrowPending?.()) ?? null;
  state.blob = await loadBlob();
  state.blob ? lockScreen() : setupScreen();
})();
