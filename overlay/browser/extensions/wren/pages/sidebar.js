/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// --- tabs --------------------------------------------------------------------------------------
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#tabs button").forEach(o => o.classList.toggle("on", o == b));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id == b.dataset.tab));
}));

// --- nook ------------------------------------------------------------------------------------
(async () => {
  const base = await wrenNook();
  const frame = document.getElementById("frame");
  // nook fades in once it has loaded, so the panel is never a white box
  frame.addEventListener("load", () => frame.classList.add("loaded"));
  const go = url => {
    frame.classList.remove("loaded");
    frame.src = url;
  };
  go(base + "/");
  document.getElementById("nookForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("nookQ").value.trim();
    if (q) {
      go(base + "/search?q=" + encodeURIComponent(q));
    }
  });
  const links = document.getElementById("nookLinks");
  for (const [label, path] of [["weather", "/weather"], ["maps", "/maps"], ["convert", "/convert"], ["books", "/books"]]) {
    links.append(wrenEl("a", { href: "#", text: label, onclick: e => { e.preventDefault(); go(base + path); } }));
  }
})();

// --- notes and to do ---------------------------------------------------------------------------
const scratch = document.getElementById("scratch");
let todos = [];
browser.storage.local.get(["scratch", "todos"]).then(data => {
  scratch.value = data.scratch || "";
  todos = data.todos || [];
  drawTodos();
});
let saveTimer;
scratch.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => browser.storage.local.set({ scratch: scratch.value }), 300);
});

function drawTodos() {
  const list = document.getElementById("todos");
  list.textContent = "";
  todos.forEach((t, i) => list.append(wrenEl("li", { class: t.done ? "done" : "" },
    wrenEl("input", { type: "checkbox", checked: t.done, onchange: e => { t.done = e.target.checked; saveTodos(); } }),
    wrenEl("a", { href: "#", text: t.text }),
    wrenEl("button", { class: "x", text: "×", title: "remove", onclick: () => { todos.splice(i, 1); saveTodos(); } }))));
}
function saveTodos() {
  browser.storage.local.set({ todos });
  drawTodos();
}
document.getElementById("todoForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("todoText");
  if (input.value.trim()) {
    todos.push({ text: input.value.trim(), done: false });
    input.value = "";
    saveTodos();
  }
});

// --- sounds ------------------------------------------------------------------------------------
async function showSound(state) {
  state = state || (await browser.runtime.sendMessage({ type: "sounds", action: "state" }));
  document.querySelectorAll("[data-sound]").forEach(b => b.classList.toggle("on", b.dataset.sound == state.playing));
  document.getElementById("volume").value = Math.round(state.volume * 100);
}
document.querySelectorAll("[data-sound]").forEach(b => b.addEventListener("click", async () => {
  const kind = b.dataset.sound;
  showSound(await browser.runtime.sendMessage({ type: "sounds", action: kind == "stop" ? "stop" : "play", kind }));
}));
document.getElementById("volume").addEventListener("input", e =>
  browser.runtime.sendMessage({ type: "sounds", action: "volume", value: e.target.value / 100 }));
showSound();

// --- boards (collections) ---------------------------------------------------------------------
let collections = {};
async function loadBoards() {
  ({ collections = {} } = await browser.storage.local.get("collections"));
  drawBoards();
}
function drawBoards() {
  const root = document.getElementById("boardList");
  root.textContent = "";
  const names = Object.keys(collections);
  if (!names.length) {
    root.append(wrenEl("p", { class: "soft", text: "boards hold pages you want to keep together. right-click any page and choose “save this page to a wren collection”, or add the open page below." }));
  }
  for (const name of names) {
    const items = collections[name];
    root.append(wrenEl("div", { class: "card board" },
      wrenEl("h2", { text: name == "inbox" ? "inbox" : name }),
      wrenEl("div", { class: "tools" },
        wrenEl("button", { text: "add this page", onclick: () => addCurrent(name) }),
        wrenEl("button", { text: "export", onclick: () => wrenSaveFile("wren-board-" + name + ".json", JSON.stringify(items, null, 2)) }),
        name != "inbox" ? wrenEl("button", { text: "delete board", onclick: () => { delete collections[name]; saveBoards(); } }) : null),
      wrenEl("ul", { class: "list" }, items.map((item, i) => wrenEl("li", {},
        wrenEl("a", { href: item.url, text: item.title || item.url, title: item.url, onclick: e => { e.preventDefault(); browser.tabs.create({ url: item.url }); } }),
        wrenEl("button", { class: "x", text: "×", onclick: () => { items.splice(i, 1); saveBoards(); } }))))));
  }
}
async function saveBoards() {
  await browser.storage.local.set({ collections });
  drawBoards();
}
async function addCurrent(name) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && !collections[name].some(i => i.url == tab.url)) {
    collections[name].unshift({ url: tab.url, title: tab.title, added: Date.now() });
    saveBoards();
  }
}
document.getElementById("boardForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("boardName");
  const name = input.value.trim().slice(0, 40);
  if (name && !collections[name]) {
    collections[name] = [];
    input.value = "";
    saveBoards();
  }
});
browser.storage.onChanged.addListener(changes => {
  if (changes.collections) {
    collections = changes.collections.newValue || {};
    drawBoards();
  }
});
loadBoards();
