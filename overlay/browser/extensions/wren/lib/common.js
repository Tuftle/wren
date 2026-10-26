/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Shared by Wren's pages and its background script: settings, and a few small helpers.

const WREN_DEFAULTS = {
  // start page
  pet: false,
  widgets: false,
  topSites: true,
  seasonal: true,
  // privacy
  sweeper: false,
  sweeperKeep: [],
  historyDays: 0,
  riskyDownloads: true,
  safeLinks: true,
  linkClean: true,
  digest: false,
  timeReport: false,
  // mail glance
  mail: false,
  mailFeed: "https://mail.google.com/mail/feed/atom",
  // focus
  focusMinutes: 25,
  blocklist: [],
  // pages
  highlights: true,
  peek: true,
  hints: true,
  drafts: true,
  snippetsOn: true,
  clipboardShelf: false,
  // tabs
  sleepTabs: false,
  sleepMinutes: 60,
  // evening shade
  shade: false,
  shadeAuto: false,
  shadeFrom: 20,
  shadeTo: 7,
  shadeLevel: 35,
  music: true,
  // the feel of the window
  siteTint: true,
  timeTint: true,
  mood: "default",
  bedtime: false,
  bedFrom: 22,
  bedTo: 7,
  bedSound: true,
  // the start page
  ambient: true,
  ambientMinutes: 3,
  dailyGood: false,
  routine: false,
  hatched: false,
  // accessibility
  access: { font: "", size: 100, spacing: 0, calm: false, contrast: false },
  // typing "w cats" in the address bar
  searchShortcuts: {
    w: "https://en.wikipedia.org/wiki/Special:Search?search=%s",
    yt: "https://www.youtube.com/results?search_query=%s",
    gh: "https://github.com/search?q=%s",
    mdn: "https://developer.mozilla.org/en-US/search?q=%s",
    maps: "https://www.openstreetmap.org/search?query=%s",
  },
  // snippets: ";addr" becomes the text
  snippets: {},
  // per-site: { "example.com": { dark: true, zoom: 1.2, noScripts: false } }
  siteSettings: {},
};

const WrenSettings = {
  async get() {
    const { settings } = await browser.storage.local.get("settings");
    return { ...WREN_DEFAULTS, ...(settings || {}) };
  },
  async set(change) {
    const next = { ...(await this.get()), ...change };
    await browser.storage.local.set({ settings: next });
    return next;
  },
};

// the address nook lives at, from Wren's own setting
async function wrenNook() {
  const { nook } = await browser.wren.getState();
  return nook;
}

function wrenHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function wrenEl(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k == "text") {
      el.textContent = v;
    } else if (k.startsWith("on")) {
      el.addEventListener(k.slice(2), v);
    } else if (v !== false && v != null) {
      el.setAttribute(k, v === true ? "" : v);
    }
  }
  el.append(...kids.flat().filter(k => k != null));
  return el;
}

function wrenSaveFile(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// today's date as 2026-10-24, and a page address without its #fragment, used as a key
function wrenDay(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function wrenKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch (e) {
    return url;
  }
}
