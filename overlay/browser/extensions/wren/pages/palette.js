/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The command palette: type a few letters, press Enter. It lists everything Wren can do.

// the tab that was in front before this window opened
async function page() {
  const wins = await browser.windows.getAll({ windowTypes: ["normal"], populate: true });
  const focused = wins.sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0))[0];
  return focused.tabs.find(t => t.active);
}
const open = file => browser.tabs.create({ url: browser.runtime.getURL("pages/" + file) });
const send = message => browser.runtime.sendMessage(message);
const toggle = async key => WrenSettings.set({ [key]: !(await WrenSettings.get())[key] });
const say = text => { document.getElementById("msg").textContent = text; };

const ACTIONS = [
  ["focus mode", "hide the bars, quiet notifications", async () => { const { on } = await send({ type: "focusState" }); await send({ type: "focus", on: !on }); }],
  ["panic: forget everything and close", "", () => browser.wren.panic()],
  ["open burrow", "your passwords", () => open("burrow/index.html")],
  ["fill this page's login from burrow", "needs burrow unlocked", async () => browser.tabs.sendMessage((await page()).id, { type: "vault:fillNow" })],
  ["lock burrow", "forget the open logins", () => send({ type: "vault:lock" })],
  ["open privacy report", "", () => open("privacy.html")],
  ["open wren pages (notes, sheet, draw)", "", () => open("pages.html")],
  ["open daily digest", "", () => open("digest.html")],
  ["open wren tools (digest, highlights, snippets, sessions…)", "", () => open("tools.html")],
  ["check for updates", "is there a newer wren?", () => open("update.html")],
  ["open settings", "", () => open("settings.html")],
  ["open shortcuts cheat sheet", "", () => open("shortcuts.html")],
  ["why is it slow?", "memory by page", () => open("slow.html")],
  ["time report", "where your time went", () => open("time.html")],
  ["check bookmarks for dead links", "", () => open("bookmarks.html")],
  ["quick capture a note or link", "", () => send({ type: "openSmall", page: "capture.html", width: 440, height: 250 })],
  ["this site looks weird", "tell tuftle, site name and time only", () => send({ type: "openSmall", page: "report.html", width: 480, height: 400 })],
  ["group tabs by site", "", async () => say((await send({ type: "groupBySite" })) + " groups made")],
  ["put idle tabs to sleep now", "", async () => say((await send({ type: "sleepNow" })) + " tabs asleep")],
  ["mute every tab", "", () => send({ type: "muteAll", mute: true })],
  ["unmute every tab", "", () => send({ type: "muteAll", mute: false })],
  ["turn evening shade on or off", "", () => toggle("shade")],
  ["turn link hints on or off", "press f on a page", () => toggle("hints")],
  ["turn the clipboard shelf on or off", "", () => toggle("clipboardShelf")],
  ["new guest window", "a private window", () => browser.windows.create({ incognito: true })],
  ["highlight the selected text", "", async () => browser.tabs.sendMessage((await page()).id, { type: "highlightSelection" })],
  ["listen to this page", "", async () => browser.tabs.sendMessage((await page()).id, { type: "listen", action: "start" })],
  ["stop listening", "", async () => browser.tabs.sendMessage((await page()).id, { type: "listen", action: "stop" })],
  ["copy this page as a markdown link", "", async () => { const t = await page(); await navigator.clipboard.writeText(`[${t.title}](${t.url})`); say("copied"); }],
  ["copy this page as a citation", "", async () => {
    const t = await page();
    await navigator.clipboard.writeText(`${t.title}. ${wrenHost(t.url)}. ${t.url} (accessed ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })})`);
    say("copied");
  }],
  ["save this page's readable copy", "", async () => say((await send({ type: "snapshot", tabId: (await page()).id })) ? "saved" : "nothing readable here")],
  ["save this page as a clean pdf", "", async () => send({ type: "cleanPdf", tabId: (await page()).id })],
  ["watch this page for changes", "", async () => { const t = await page(); await send({ type: "watch", action: "add", url: t.url, title: t.title }); say("watching"); }],
  ["remind me about this page in an hour", "closes the tab", async () => send({ type: "remind", tabId: (await page()).id, minutes: 60 })],
  ["remind me about this page tomorrow", "closes the tab", async () => send({ type: "remind", tabId: (await page()).id, minutes: 60 * 24 })],
  ["rename this tab", "", async () => { const t = await page(); const [title] = await browser.tabs.executeScript(t.id, { code: 'prompt("name this tab", document.title)' }); if (title) { await browser.tabs.sendMessage(t.id, { type: "renameTab", title }); } }],
  ["save all tabs as a session", "", async () => { await send({ type: "session", action: "save", name: "session " + wrenDay() + " " + new Date().toLocaleTimeString().slice(0, 5) }); say("session saved"); }],
  ["open the trail map", "how you moved between pages", () => open("trail.html")],
  ["open the table", "your tabs as papers on a desk", () => open("table.html")],
  ["open the bookshelf", "bookmarks as books", () => open("shelf.html")],
  ["open your year in review", "", () => open("review.html")],
  ["open rooms", "separate cookies for work, shopping…", () => open("rooms.html")],
  ["open the extension shelf", "", () => open("extensions.html")],
  ["open mods", "", () => open("mods.html")],
  ["import from a firefox profile", "", () => open("import.html")],
  ["open comfort settings", "type, size, calm motion", () => open("access.html")],
  ["open under the hood", "about: pages and diagnostics", () => open("advanced.html")],
  ["make a postcard of this page", "", async () => send({ type: "postcard", tabId: (await page()).id })],
  ["translate this page", "on this computer", async () => say((await browser.wren.openTranslations()) ? "" : "nothing to translate here")],
  ["start ambient mode now", "a calm scene", async () => { const t = await browser.tabs.create({ url: browser.runtime.getURL("pages/start.html") }); setTimeout(() => browser.tabs.executeScript(t.id, { code: "window.__ambientNow && window.__ambientNow()" }).catch(() => {}), 800); }],
  ["play the hatching egg again", "", () => browser.tabs.create({ url: browser.runtime.getURL("pages/start.html#hatch") })],
  ["mood: wren", "", () => send({ type: "mood", name: "default", sound: false })],
  ["mood: library", "warm gold and a fireplace", () => send({ type: "mood", name: "library", sound: true })],
  ["mood: late train", "blue and rain", () => send({ type: "mood", name: "train", sound: true })],
  ["mood: seaside", "teal and waves", () => send({ type: "mood", name: "seaside", sound: true })],
  ["bedtime mode on or off", "dim, quiet, blocked sites", () => toggle("bedtime")],
  ["show link hints", "", async () => browser.tabs.sendMessage((await page()).id, { type: "hints" })],
];

let items = [];
let at = 0;

async function build() {
  items = ACTIONS.map(([label, hint, run]) => ({ label, hint, run }));
  const ws = await send({ type: "ws", action: "list" });
  for (const name of ws.names) {
    items.push({ label: "switch to workspace: " + name, hint: name == ws.current ? "current" : "", run: () => send({ type: "ws", action: "switch", name }) });
  }
  const { sessions = {} } = await browser.storage.local.get("sessions");
  for (const name of Object.keys(sessions)) {
    items.push({ label: "restore session: " + name, hint: "", run: () => send({ type: "session", action: "restore", name }) });
  }
  try {
    for (const entry of await browser.wren.getBackList()) {
      if (!entry.current) {
        items.push({ label: "back to: " + (entry.title || entry.url), hint: "this tab's history", run: () => browser.wren.gotoHistory(entry.index) });
      }
    }
  } catch (e) {
    // no history to show
  }
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    items.push({ label: "go to tab: " + (t.title || t.url), hint: wrenHost(t.url), run: async () => { await browser.tabs.update(t.id, { active: true }); await browser.windows.update(t.windowId, { focused: true }); } });
  }
  draw();
}

function draw() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const shown = items.filter(i => words.every(w => (i.label + " " + i.hint).toLowerCase().includes(w))).slice(0, 40);
  at = Math.min(at, Math.max(0, shown.length - 1));
  const list = document.getElementById("list");
  list.textContent = "";
  shown.forEach((item, i) => {
    const li = wrenEl("li", { class: i == at ? "on" : "", onclick: () => run(item) }, wrenEl("span", { text: item.label }), wrenEl("span", { class: "hint", text: item.hint }));
    list.append(li);
    if (i == at) {
      li.scrollIntoView({ block: "nearest" });
    }
  });
  list._shown = shown;
}

async function run(item) {
  await item.run();
  if (!document.getElementById("msg").textContent) {
    window.close();
  } else {
    setTimeout(() => window.close(), 900);
  }
}

const input = document.getElementById("q");
input.addEventListener("input", () => { at = 0; draw(); });
input.addEventListener("keydown", e => {
  const list = document.getElementById("list");
  if (e.key == "ArrowDown") {
    at = Math.min((list._shown || []).length - 1, at + 1);
    draw();
    e.preventDefault();
  } else if (e.key == "ArrowUp") {
    at = Math.max(0, at - 1);
    draw();
    e.preventDefault();
  } else if (e.key == "Enter") {
    const item = (list._shown || [])[at];
    if (item) {
      run(item);
    }
  } else if (e.key == "Escape") {
    window.close();
  }
});
build();
