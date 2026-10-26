/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const $ = id => document.getElementById(id);
const send = message => browser.runtime.sendMessage(message);
const x = (text, onclick) => wrenEl("button", { class: "x", text, onclick });
const when = t => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#tabs button").forEach(o => o.classList.toggle("on", o == b));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id == b.dataset.tab));
}));
if (location.hash) {
  document.querySelector(`#tabs [data-tab="${location.hash.slice(1)}"]`)?.click();
}

// --- workspaces ----------------------------------------------------------------------------------------
async function drawWs(state) {
  state = state || (await send({ type: "ws", action: "list" }));
  const list = $("wsList");
  list.textContent = "";
  for (const name of state.names) {
    list.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: name + (name == state.current ? "  (here)" : ""), onclick: async e => { e.preventDefault(); drawWs(await send({ type: "ws", action: "switch", name })); } }),
      name != "main" ? x("delete", async () => drawWs(await send({ type: "ws", action: "delete", name }))) : null));
  }
}
$("wsForm").addEventListener("submit", async e => {
  e.preventDefault();
  drawWs(await send({ type: "ws", action: "add", name: $("wsName").value }));
  $("wsName").value = "";
});
drawWs();

// --- sessions -----------------------------------------------------------------------------------------
async function drawSessions() {
  const { sessions = {} } = await browser.storage.local.get("sessions");
  const list = $("sesList");
  list.textContent = "";
  for (const [name, s] of Object.entries(sessions)) {
    const count = s.windows.reduce((n, w) => n + w.length, 0);
    list.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: `${name}  ·  ${count} tabs  ·  ${when(s.saved)}`, onclick: async e => { e.preventDefault(); await send({ type: "session", action: "restore", name }); } }),
      x("export", () => wrenSaveFile(name.replace(/[^\w\- ]+/g, "") + ".json", JSON.stringify(s, null, 2))),
      x("delete", async () => { await send({ type: "session", action: "delete", name }); drawSessions(); })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "no sessions yet." }));
  }
}
$("sesForm").addEventListener("submit", async e => {
  e.preventDefault();
  await send({ type: "session", action: "save", name: $("sesName").value });
  $("sesName").value = "";
  drawSessions();
});
drawSessions();

// --- highlights ---------------------------------------------------------------------------------------
(async () => {
  const { highlights = {} } = await browser.storage.local.get("highlights");
  const list = $("hlList");
  for (const [url, items] of Object.entries(highlights)) {
    for (const h of items) {
      list.append(wrenEl("li", {},
        wrenEl("a", { href: url, text: "“" + h.text.slice(0, 120) + "”  —  " + (h.title || wrenHost(url)), onclick: e => { e.preventDefault(); browser.tabs.create({ url }); } }),
        x("delete", async () => {
          const { highlights: all = {} } = await browser.storage.local.get("highlights");
          all[url] = (all[url] || []).filter(i => i.id != h.id);
          if (!all[url].length) {
            delete all[url];
          }
          await browser.storage.local.set({ highlights: all });
          location.hash = "highlights";
          location.reload();
        })));
    }
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "nothing highlighted yet. select text on a page and press “highlight”." }));
  }
})();

// --- saved copies -------------------------------------------------------------------------------------
async function drawSaved() {
  const { snapshots = {} } = await browser.storage.local.get("snapshots");
  const q = $("savedFind").value.trim().toLowerCase();
  const list = $("savedList");
  list.textContent = "";
  for (const [url, s] of Object.entries(snapshots).sort((a, b) => b[1].saved - a[1].saved)) {
    if (q && !(s.title + " " + s.text).toLowerCase().includes(q)) {
      continue;
    }
    list.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: s.title || url, title: url, onclick: e => { e.preventDefault(); browser.tabs.create({ url: browser.runtime.getURL("pages/snapshot.html") + "?u=" + encodeURIComponent(url) }); } }),
      wrenEl("span", { class: "soft", text: wrenHost(url) }),
      x("delete", async () => { delete snapshots[url]; await browser.storage.local.set({ snapshots }); drawSaved(); })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: q ? "nothing matches." : "no saved copies yet. right-click a page and choose “save this page to a wren collection”." }));
  }
}
$("savedFind").addEventListener("input", drawSaved);
drawSaved();

// --- snippets and search shortcuts (two small maps) --------------------------------------------------
function mapEditor(key, formId, keyId, valId, listId, label) {
  async function draw() {
    const settings = await WrenSettings.get();
    const list = $(listId);
    list.textContent = "";
    for (const [k, v] of Object.entries(settings[key])) {
      list.append(wrenEl("li", {}, wrenEl("span", { text: label(k) }), wrenEl("span", { class: "soft grow", text: v.slice(0, 90) }),
        x("delete", async () => { const next = { ...(await WrenSettings.get())[key] }; delete next[k]; await WrenSettings.set({ [key]: next }); draw(); })));
    }
  }
  $(formId).addEventListener("submit", async e => {
    e.preventDefault();
    const k = $(keyId).value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const v = $(valId).value.trim();
    if (k && v) {
      await WrenSettings.set({ [key]: { ...(await WrenSettings.get())[key], [k]: v } });
      $(keyId).value = $(valId).value = "";
      draw();
    }
  });
  draw();
}
mapEditor("snippets", "snForm", "snKey", "snText", "snList", k => ";" + k);
mapEditor("searchShortcuts", "scForm", "scKey", "scUrl", "scList", k => k + " …");

// --- blocklist ----------------------------------------------------------------------------------------
WrenSettings.get().then(s => { $("blText").value = s.blocklist.join("\n"); });
$("blText").addEventListener("change", () =>
  WrenSettings.set({ blocklist: $("blText").value.split(/\s+/).map(h => h.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean) }));

// --- watched pages ------------------------------------------------------------------------------------
async function drawWatch() {
  const { watchers = [] } = await browser.storage.local.get("watchers");
  const list = $("watchList");
  list.textContent = "";
  for (const w of watchers) {
    list.append(wrenEl("li", {},
      wrenEl("a", { href: w.url, text: (w.changed ? "• changed: " : "") + (w.title || w.url), onclick: async e => { e.preventDefault(); w.changed = false; await browser.storage.local.set({ watchers }); browser.tabs.create({ url: w.url }); } }),
      wrenEl("span", { class: "soft", text: w.checked ? "checked " + when(w.checked) : "not checked yet" }),
      x("stop", async () => { await browser.storage.local.set({ watchers: watchers.filter(o => o != w) }); drawWatch(); })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "not watching anything." }));
  }
}
$("watchNow").addEventListener("click", async () => { await send({ type: "watch", action: "check" }); drawWatch(); });
drawWatch();

// --- reminders ----------------------------------------------------------------------------------------
(async () => {
  const { reminders = [] } = await browser.storage.local.get("reminders");
  const list = $("remList");
  for (const r of reminders) {
    list.append(wrenEl("li", {}, wrenEl("a", { href: r.url, text: r.title || r.url, onclick: e => { e.preventDefault(); browser.tabs.create({ url: r.url }); } }), wrenEl("span", { class: "soft", text: "back " + when(r.due) })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "no reminders waiting." }));
  }
})();

// --- notification digest ------------------------------------------------------------------------------
(async () => {
  const { digestNotes = [] } = await browser.storage.local.get("digestNotes");
  const list = $("digestList");
  for (const n of digestNotes) {
    list.append(wrenEl("li", {}, wrenEl("span", { text: `${n.host}: ${n.title}${n.body ? " — " + n.body : ""}` }), wrenEl("span", { class: "soft", text: when(n.time) })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "nothing collected." }));
  }
  browser.browserAction.setBadgeText({ text: "" });
})();
$("digestClear").addEventListener("click", async () => { await browser.storage.local.remove("digestNotes"); location.hash = "digest"; location.reload(); });

// --- clipboard shelf ----------------------------------------------------------------------------------
(async () => {
  const clips = await send({ type: "clips" });
  const list = $("clipList");
  for (const c of clips) {
    list.append(wrenEl("li", {}, wrenEl("a", { href: "#", text: c.slice(0, 140).replace(/\s+/g, " "), onclick: async e => { e.preventDefault(); await navigator.clipboard.writeText(c); e.target.textContent = "copied again"; } })));
  }
  if (!list.children.length) {
    list.append(wrenEl("li", { class: "soft", text: "nothing on the shelf." }));
  }
})();
