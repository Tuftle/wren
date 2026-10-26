/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const find = document.getElementById("find");
const results = document.getElementById("results");

// --- jump to a tab (or something you closed a moment ago) --------------------------------------
async function search() {
  const q = find.value.trim().toLowerCase();
  results.textContent = "";
  if (!q) {
    return;
  }
  const tabs = (await browser.tabs.query({})).filter(
    t => (t.title || "").toLowerCase().includes(q) || (t.url || "").toLowerCase().includes(q)
  );
  const closed = (await browser.sessions.getRecentlyClosed({ maxResults: 25 }))
    .filter(s => s.tab && ((s.tab.title || "").toLowerCase().includes(q) || (s.tab.url || "").toLowerCase().includes(q)));
  for (const t of tabs.slice(0, 8)) {
    results.append(wrenEl("li", {
      onclick: async () => {
        await browser.tabs.update(t.id, { active: true });
        await browser.windows.update(t.windowId, { focused: true });
        window.close();
      },
    }, wrenEl("span", { class: "title", text: t.title || t.url }), wrenEl("span", { class: "tag", text: "open" })));
  }
  for (const s of closed.slice(0, 4)) {
    results.append(wrenEl("li", {
      onclick: async () => {
        await browser.sessions.restore(s.tab.sessionId);
        window.close();
      },
    }, wrenEl("span", { class: "title", text: s.tab.title || s.tab.url }), wrenEl("span", { class: "tag", text: "closed" })));
  }
  if (!results.children.length) {
    results.append(wrenEl("li", { class: "soft", text: "nothing matches" }));
  }
}
find.addEventListener("input", search);
find.addEventListener("keydown", e => {
  if (e.key == "Enter") {
    results.querySelector("li")?.click();
  }
});

// --- reading time of this page --------------------------------------------------------------
browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  if (!tab || !/^https?:/.test(tab.url || "")) {
    return;
  }
  try {
    const { minutes, words } = await browser.tabs.sendMessage(tab.id, { type: "readingTime" });
    document.getElementById("reading").textContent =
      words > 80 ? `about ${minutes} min to read this page (${words} words)` : "";
  } catch (e) {
    // the page can not be asked (a new tab, a settings page)
  }
});

// --- focus and sounds --------------------------------------------------------------------
const focusButton = document.getElementById("focus");
async function showFocus() {
  const { on } = await browser.runtime.sendMessage({ type: "focusState" });
  focusButton.classList.toggle("on", on);
  document.getElementById("focusNote").textContent = on ? "on. press again to stop" : "hide the bars";
}
focusButton.addEventListener("click", async () => {
  const { on } = await browser.runtime.sendMessage({ type: "focusState" });
  await browser.runtime.sendMessage({ type: "focus", on: !on });
  window.close();
});
showFocus();

async function showSound() {
  const { playing } = await browser.runtime.sendMessage({ type: "sounds", action: "state" });
  for (const kind of ["rain", "fire", "cafe"]) {
    document.getElementById(kind).classList.toggle("on", playing == kind);
  }
}
for (const kind of ["rain", "fire", "cafe"]) {
  document.getElementById(kind).addEventListener("click", async () => {
    const { playing } = await browser.runtime.sendMessage({ type: "sounds", action: "state" });
    await browser.runtime.sendMessage({ type: "sounds", action: playing == kind ? "stop" : "play", kind });
    showSound();
  });
}
showSound();

// --- links open in a tab, and the popup goes away ----------------------------------------------
document.querySelectorAll("[data-open]").forEach(a => a.addEventListener("click", async e => {
  e.preventDefault();
  await browser.tabs.create({ url: browser.runtime.getURL("pages/" + a.getAttribute("href")) });
  window.close();
}));

document.getElementById("panic").addEventListener("click", () => browser.wren.panic());

// --- this page, this site, tabs ----------------------------------------------------------------------
const send = message => browser.runtime.sendMessage(message);
const note = text => { document.getElementById("note").textContent = text; };
let current = null;
const host = () => wrenHost(current?.url || "");

async function showSite() {
  if (!current || !/^https?:/.test(current.url)) {
    document.querySelector("#darkBtn").disabled = document.querySelector("#scriptsBtn").disabled = true;
    return;
  }
  const site = (await WrenSettings.get()).siteSettings[host()] || {};
  document.getElementById("siteName").textContent = host();
  document.getElementById("darkBtn").classList.toggle("on", !!site.dark);
  document.getElementById("scriptsBtn").classList.toggle("on", !!site.noScripts);
}
browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { current = tab; showSite(); });

const ACT = {
  async listen() {
    const { speaking } = await browser.tabs.sendMessage(current.id, { type: "listenState" });
    await browser.tabs.sendMessage(current.id, { type: "listen", action: speaking ? "stop" : "start" });
    note(speaking ? "stopped" : "reading aloud");
  },
  async copylink() { await navigator.clipboard.writeText(`[${current.title}](${current.url})`); note("copied as a markdown link"); },
  async cite() {
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    await navigator.clipboard.writeText(`${current.title}. ${host()}. ${current.url} (accessed ${date})`);
    note("copied as a citation");
  },
  async save() { note((await send({ type: "snapshot", tabId: current.id })) ? "saved a readable copy" : "nothing readable on this page"); },
  async pdf() { await send({ type: "cleanPdf", tabId: current.id }); window.close(); },
  async watch() { await send({ type: "watch", action: "add", url: current.url, title: current.title }); note("watching this page"); },
  async remind1() { await send({ type: "remind", tabId: current.id, minutes: 60 }); window.close(); },
  async remind24() { await send({ type: "remind", tabId: current.id, minutes: 1440 }); window.close(); },
  async dark() { const site = (await WrenSettings.get()).siteSettings[host()] || {}; await send({ type: "site", host: host(), patch: { dark: !site.dark } }); note("reload the page to see it"); showSite(); },
  async noscripts() { const site = (await WrenSettings.get()).siteSettings[host()] || {}; await send({ type: "site", host: host(), patch: { noScripts: !site.noScripts } }); note("reload the page to see it"); showSite(); },
  async zoomin() { const z = Math.min(3, (await browser.tabs.getZoom(current.id)) + 0.1); await browser.tabs.setZoom(current.id, z); await send({ type: "site", host: host(), patch: { zoom: Math.round(z * 100) / 100 } }); note("zoom " + Math.round(z * 100) + "%"); },
  async zoomout() { const z = Math.max(0.3, (await browser.tabs.getZoom(current.id)) - 0.1); await browser.tabs.setZoom(current.id, z); await send({ type: "site", host: host(), patch: { zoom: Math.round(z * 100) / 100 } }); note("zoom " + Math.round(z * 100) + "%"); },
  async weird() { await send({ type: "openSmall", page: "report.html", width: 480, height: 400 }); window.close(); },
  async group() { note((await send({ type: "groupBySite" })) + " groups made"); },
  async sleep() { note((await send({ type: "sleepNow" })) + " tabs put to sleep"); },
  async mute() { await send({ type: "muteAll", mute: true }); note("muted"); },
  async unmute() { await send({ type: "muteAll", mute: false }); note("unmuted"); },
  async guest() { await browser.windows.create({ incognito: true }); window.close(); },
  async postcard() { await send({ type: "postcard", tabId: current.id }); window.close(); },
  async translate() { note((await browser.wren.openTranslations()) ? "" : "nothing to translate here"); },
  async palette() { await send({ type: "openSmall", page: "palette.html", width: 560, height: 460 }); window.close(); },
};
document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
  try {
    await ACT[b.dataset.act]();
  } catch (e) {
    note("not possible on this page");
  }
}));

// workspaces, as quick links
send({ type: "ws", action: "list" }).then(({ names, current: cur }) => {
  const row = document.getElementById("wsRow");
  if (names.length > 1) {
    row.textContent = "workspace: ";
    for (const name of names) {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = name == cur ? "[" + name + "]" : name;
      a.style.marginRight = ".6rem";
      a.addEventListener("click", async e => { e.preventDefault(); await send({ type: "ws", action: "switch", name }); window.close(); });
      row.append(a);
    }
  }
});

// how heavy this page is, and how fast it loaded
browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  if (!tab) {
    return;
  }
  const info = await send({ type: "pageInfo", tabId: tab.id }).catch(() => null);
  if (info) {
    const mb = (info.bytes / 1048576).toFixed(1);
    document.getElementById("weatherNote").textContent =
      `${info.weather} page: ${mb} MB over ${info.requests} requests, loaded in ${(info.loadMs / 1000).toFixed(1)} s` +
      (info.blocked ? `, ${info.blocked} trackers kept out` : "");
  }
});
