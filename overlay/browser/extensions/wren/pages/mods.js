/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const ask = (action, extra = {}) => browser.runtime.sendMessage({ type: "mods", action, ...extra });
const note = document.getElementById("note");
let pendingMod = null;

async function renderBuiltin(mods) {
  const box = document.getElementById("builtin");
  box.textContent = "";
  for (const mod of await ask("builtin")) {
    const have = mods.some(m => m.id == mod.id);
    const add = wrenEl("button", { class: "btn small", text: have ? "added" : "add", disabled: have });
    add.addEventListener("click", async () => {
      const checked = await ask("check", { mod });
      showPending(checked);
    });
    box.append(wrenEl("div", { class: "item" },
      wrenEl("div", { class: "t" }, wrenEl("b", { text: mod.name }), wrenEl("span", { class: "soft", text: mod.description })), add));
  }
}

async function render() {
  const mods = await ask("list");
  renderBuiltin(mods);
  const list = document.getElementById("list");
  list.textContent = "";
  document.getElementById("empty").hidden = mods.length > 0;
  for (const mod of mods) {
    const on = wrenEl("input", { type: "checkbox", "aria-label": "turn " + mod.name + " on or off" });
    on.checked = mod.enabled;
    on.addEventListener("change", () => ask("toggle", { id: mod.id, enabled: on.checked }));
    const remove = wrenEl("button", { class: "btn small alt", text: "remove" });
    remove.addEventListener("click", async () => {
      await ask("remove", { id: mod.id });
      render();
    });
    list.append(wrenEl("div", { class: "item" }, on,
      wrenEl("div", { class: "t" }, wrenEl("b", { text: mod.name + "  " + mod.version }), wrenEl("span", { class: "soft", text: mod.description || "by " + mod.author })),
      remove));
  }
}

function showPending(mod) {
  pendingMod = mod;
  document.getElementById("pName").textContent = mod.name;
  document.getElementById("pAuthor").textContent = mod.author;
  document.getElementById("pVersion").textContent = mod.version;
  document.getElementById("pDesc").textContent = mod.description;
  const sites = (mod.sites || []).flatMap(s => s.matches);
  const pSites = document.getElementById("pSites");
  pSites.hidden = !sites.length;
  pSites.textContent = sites.length ? "it also changes how these web sites look: " + [...new Set(sites.map(m => m.replace(/^\*?:?\/\//, "").replace(/\/.*$/, "")))].join(", ") : "";
  const siteStyles = (mod.sites || []).map(s => "/* on " + s.matches.join(", ") + " */\n" + s.css);
  document.getElementById("pCss").textContent = [mod.css, ...siteStyles].filter(Boolean).join("\n\n") || "(no style)";
  const prefs = Object.entries(mod.prefs || {});
  document.getElementById("pPrefsBox").hidden = !prefs.length;
  const ul = document.getElementById("pPrefs");
  ul.textContent = "";
  for (const [name, value] of prefs) {
    ul.append(wrenEl("li", { text: name + " = " + value }));
  }
  document.getElementById("pending").hidden = false;
  document.getElementById("pending").scrollIntoView({ block: "center" });
}

async function check(text) {
  try {
    const mod = await ask("check", { mod: JSON.parse(text) });
    note.textContent = "";
    showPending(mod);
  } catch (e) {
    note.textContent = "that did not work: " + (e.message || e);
  }
}

document.getElementById("check").addEventListener("click", () => check(document.getElementById("paste").value));
document.getElementById("file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (file) {
    check(await file.text());
  }
});
document.getElementById("pAdd").addEventListener("click", async () => {
  if (!pendingMod) {
    return;
  }
  await ask("install", { mod: { format: 1, ...pendingMod } });
  await browser.storage.local.remove("pendingMod");
  document.getElementById("pending").hidden = true;
  pendingMod = null;
  render();
});
document.getElementById("pNo").addEventListener("click", async () => {
  await browser.storage.local.remove("pendingMod");
  document.getElementById("pending").hidden = true;
  pendingMod = null;
});

(async () => {
  await render();
  const { pendingMod: staged } = await browser.storage.local.get("pendingMod");
  if (staged) {
    showPending(staged);
  }
})();
