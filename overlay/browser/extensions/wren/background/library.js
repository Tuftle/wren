/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Saved copies of pages, quick capture, the clean PDF, and the palette and capture windows.

// --- offline copies: a readable copy of a page, kept in this browser ---------------------------------------
async function snapshotTab(tabId) {
  try {
    const page = await browser.tabs.sendMessage(tabId, { type: "readable" });
    if (!page || !page.text || page.text.length < 80) {
      return false;
    }
    const { snapshots = {} } = await browser.storage.local.get("snapshots");
    snapshots[wrenKey(page.url)] = { title: page.title, html: page.html, text: page.text.slice(0, 60000), saved: Date.now() };
    // keep the newest 300
    const keys = Object.keys(snapshots).sort((a, b) => snapshots[b].saved - snapshots[a].saved);
    for (const k of keys.slice(300)) {
      delete snapshots[k];
    }
    await browser.storage.local.set({ snapshots });
    return true;
  } catch (e) {
    return false;
  }
}

// saving a page to a board keeps a copy too
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId == "save-collection" && !info.linkUrl && tab) {
    snapshotTab(tab.id);
  }
});

// --- the clean PDF: only the article, in Wren's reading style ---------------------------------------------
async function cleanPdf(tabId) {
  const page = await browser.tabs.sendMessage(tabId, { type: "readable" });
  await browser.storage.local.set({ cleanDoc: page });
  browser.tabs.create({ url: browser.runtime.getURL("pages/clean.html") });
}

// --- quick capture and the palette: two small windows --------------------------------------------------
function smallWindow(page, width, height) {
  browser.windows.create({ type: "popup", url: browser.runtime.getURL("pages/" + page), width, height });
}

browser.commands.onCommand.addListener(command => {
  if (command == "capture") {
    smallWindow("capture.html", 440, 250);
  } else if (command == "palette") {
    smallWindow("palette.html", 560, 460);
  }
});

async function makePostcard(tabId) {
  const [selection] = await browser.tabs.executeScript(tabId, { code: "getSelection().toString()" });
  const page = await browser.tabs.sendMessage(tabId, { type: "readable" }).catch(() => null);
  const tab = await browser.tabs.get(tabId);
  const firstWords = page ? page.text.split(/\n+/).find(p => p.trim().length > 80) || page.text : "";
  await browser.storage.local.set({
    postcardDoc: { title: tab.title, url: tab.url, quote: (selection || "").trim() || firstWords.trim().slice(0, 240) },
  });
  browser.tabs.create({ url: browser.runtime.getURL("pages/postcard.html") });
}

// the last normal window you used, so a small window (palette, reports) knows which page it was opened from
let lastNormalWindow = null;
browser.windows.getAll({ windowTypes: ["normal"] }).then(wins => {
  lastNormalWindow ??= (wins.find(w => w.focused) || wins[0])?.id ?? null;
});
browser.windows.onFocusChanged.addListener(async id => {
  if (id == browser.windows.WINDOW_ID_NONE) {
    return;
  }
  try {
    if ((await browser.windows.get(id)).type == "normal") {
      lastNormalWindow = id;
    }
  } catch (e) {
    // the window is already gone
  }
});

// the icon in the address bar: tell tuftle this site looks wrong
browser.pageAction.onClicked.addListener(tab => {
  lastNormalWindow = tab.windowId;
  smallWindow("report.html", 480, 400);
});

async function frontTab() {
  const [tab] = await browser.tabs.query({ active: true, windowId: lastNormalWindow ?? browser.windows.WINDOW_ID_CURRENT });
  return tab ? { url: tab.url } : null;
}

browser.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case "frontTab":
      return frontTab();
    case "postcard":
      return makePostcard(message.tabId);
    case "snapshot":
      return snapshotTab(message.tabId);
    case "cleanPdf":
      return cleanPdf(message.tabId);
    case "openSmall":
      smallWindow(message.page, message.width || 440, message.height || 300);
      return Promise.resolve(true);
    default:
      return undefined;
  }
});
