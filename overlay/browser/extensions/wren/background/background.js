/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wren's background work: sounds, focus mode, tidy-up jobs, and a few small guards. Everything it
// learns stays in this browser's own storage.

const RISKY = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jse|wsf|jar|lnk|hta|reg|dll)$/i;
let focusOn = false;

// --- messages from Wren's pages ---------------------------------------------------------------
// (not async: a listener that always returns a promise would answer every message first, and then the
// other background scripts would never get to answer theirs)
browser.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case "sounds":
      if (message.action == "play") {
        WrenSounds.play(message.kind);
      } else if (message.action == "stop") {
        WrenSounds.stop();
      } else if (message.action == "volume") {
        WrenSounds.setVolume(message.value);
      }
      return Promise.resolve(WrenSounds.state());
    case "focus":
      return setFocus(message.on);
    case "music":
      return WrenMusicEngine.handle(message);
    case "focusState":
      return Promise.resolve({ on: focusOn });
    case "settingsChanged":
      return applySettings().then(() => true);
    default:
      return undefined;
  }
});

// --- focus mode: bars hidden, notifications quiet for a while ---------------------------------
async function setFocus(on) {
  focusOn = on;
  await browser.wren.setFocus(on);
  if (on) {
    const { stats = {} } = await browser.storage.local.get("stats");
    stats.focusSessions = (stats.focusSessions || 0) + 1;
    await browser.storage.local.set({ stats });
    await browser.wren.setQuietMode(true);
    const { focusMinutes } = await WrenSettings.get();
    browser.alarms.create("focus-end", { delayInMinutes: focusMinutes });
  } else {
    browser.alarms.clear("focus-end");
    await browser.wren.setQuietMode(false);
  }
  return { on: focusOn };
}

browser.commands.onCommand.addListener(async command => {
  if (command == "focus-mode") {
    setFocus(!focusOn);
  } else if (command == "panic") {
    browser.wren.panic();
  } else if (command == "shortcuts") {
    browser.tabs.create({ url: browser.runtime.getURL("pages/shortcuts.html") });
  }
});

// --- alarms: end of focus, history tidy-up, mail glance ---------------------------------------
browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name == "focus-end") {
    WrenSounds.chime();
    await setFocus(false);
    browser.notifications.create("focus-end", {
      type: "basic",
      iconUrl: browser.runtime.getURL("pages/bird.svg"),
      title: "focus time is over",
      message: "nice work. the bars are back.",
    });
  } else if (alarm.name == "tidy") {
    tidyHistory();
  } else if (alarm.name == "mail") {
    checkMail();
  }
});

async function tidyHistory() {
  const { historyDays } = await WrenSettings.get();
  if (historyDays > 0) {
    await browser.history.deleteRange({ startTime: 0, endTime: Date.now() - historyDays * 86400000 });
  }
}

// --- the cookie sweeper: when the last tab of a site closes, its cookies go -------------------
const tabHosts = new Map();

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || tab.url) {
    tabHosts.set(tabId, wrenHost(tab.url));
  }
});

browser.tabs.onRemoved.addListener(async tabId => {
  const host = tabHosts.get(tabId);
  tabHosts.delete(tabId);
  const settings = await WrenSettings.get();
  if (!settings.sweeper || !host || [...tabHosts.values()].includes(host)) {
    return;
  }
  if (settings.sweeperKeep.some(k => host == k || host.endsWith("." + k))) {
    return;
  }
  browser.browsingData.removeCookies({ hostnames: [host, "www." + host] });
});

browser.tabs.query({}).then(tabs => tabs.forEach(t => tabHosts.set(t.id, wrenHost(t.url))));

// --- risky downloads get a word of warning ----------------------------------------------------
browser.downloads.onCreated.addListener(async item => {
  const { riskyDownloads } = await WrenSettings.get();
  const name = (item.filename || item.url || "").split(/[\\/?#]/).filter(Boolean).pop() || "";
  if (riskyDownloads && RISKY.test(name)) {
    browser.notifications.create("risky-" + item.id, {
      type: "basic",
      iconUrl: browser.runtime.getURL("pages/bird.svg"),
      title: "careful with this file",
      message: name + " can run programs. only open it if you trust where it came from. wren can scan it for you in the privacy page.",
    });
  }
});

// --- ask nook about the selected text ---------------------------------------------------------
browser.contextMenus.create({
  id: "ask-nook",
  title: "ask nook about “%s”",
  contexts: ["selection"],
});
browser.contextMenus.create({
  id: "save-collection",
  title: "save this page to a wren collection",
  contexts: ["page", "link"],
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId == "ask-nook") {
    const base = await wrenNook();
    browser.windows.create({
      type: "popup",
      url: base + "/search?q=" + encodeURIComponent(info.selectionText.slice(0, 200)),
      width: 480,
      height: 700,
    });
  } else if (info.menuItemId == "save-collection") {
    const url = info.linkUrl || tab.url;
    const title = info.linkUrl ? info.linkText || info.linkUrl : tab.title;
    const { collections = {} } = await browser.storage.local.get("collections");
    const board = collections.inbox || [];
    if (!board.some(i => i.url == url)) {
      board.unshift({ url, title, added: Date.now() });
    }
    collections.inbox = board;
    await browser.storage.local.set({ collections });
  }
});

// --- a bookmark can carry a note about why it was saved ---------------------------------------
const startedAt = Date.now();
browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // only when a person bookmarks the page they are looking at (not imports, sync or first-run bookmarks)
  if (Date.now() - startedAt < 15000 || bookmark.type != "bookmark" || !bookmark.url) {
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url == bookmark.url) {
    browser.windows.create({
      type: "popup",
      url: browser.runtime.getURL("pages/bookmark-note.html") + "?id=" + encodeURIComponent(id),
      width: 400,
      height: 250,
    });
  }
});

// --- mail glance: the unread count on the toolbar button ---------------------------------------
async function checkMail() {
  const { mail, mailFeed } = await WrenSettings.get();
  if (!mail) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }
  try {
    const response = await fetch(mailFeed, { credentials: "include" });
    const xml = await response.text();
    const count = Number((xml.match(/<fullcount>(\d+)<\/fullcount>/) || [])[1] || 0);
    browser.browserAction.setBadgeText({ text: count ? String(count) : "" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#8a4b2a" });
  } catch (e) {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

async function applySettings() {
  const settings = await WrenSettings.get();
  browser.alarms.create("tidy", { delayInMinutes: 1, periodInMinutes: 720 });
  if (settings.mail) {
    browser.alarms.create("mail", { delayInMinutes: 0.2, periodInMinutes: 3 });
  } else {
    browser.alarms.clear("mail");
  }
  checkMail();
}

applySettings();
