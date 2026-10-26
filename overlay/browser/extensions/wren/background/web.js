/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// What Wren does to the web as it passes by: clean links, search shortcuts, the focus blocklist, per-site
// settings, the notification digest, the clipboard shelf, link previews, searching your own things from
// the address bar, and watching pages for changes. Nothing is sent to anyone but the pages you ask for.

let cfg = { ...WREN_DEFAULTS };
let nookBase = "https://nooksearch.vercel.app";
const refreshConfig = async () => {
  cfg = await WrenSettings.get();
};
refreshConfig();
wrenNook().then(base => { nookBase = base; });
browser.storage.onChanged.addListener(changes => {
  if (changes.settings) {
    refreshConfig();
  }
});

// --- link cleaner: tracking parameters are removed before the page is asked for ------------------------
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|mkt_tok|vero_id|oly_enc_id|oly_anon_id|wickedid|twclid|ttclid|li_fat_id)$/i;

function cleanUrl(url) {
  const u = new URL(url);
  let changed = false;
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) {
      u.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? u.href : null;
}

browser.webRequest.onBeforeRequest.addListener(details => {
  if (details.method != "GET") {
    return {};
  }
  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return {};
  }
  const host = url.hostname.replace(/^www\./, "");

  // search shortcuts: a search for "w cats" goes to Wikipedia instead of nook
  if (url.origin == new URL(nookBase).origin && url.pathname == "/search") {
    const q = url.searchParams.get("q") || "";
    const [key, ...rest] = q.trim().split(/\s+/);
    const target = cfg.searchShortcuts[(key || "").toLowerCase()];
    if (target && rest.length) {
      return { redirectUrl: target.replace("%s", encodeURIComponent(rest.join(" "))) };
    }
  }

  // focus blocklist: some sites wait until focus mode is over
  if (((typeof focusOn != "undefined" && focusOn) || (typeof bedtimeActive != "undefined" && bedtimeActive)) && cfg.blocklist.some(b => host == b || host.endsWith("." + b))) {
    return { redirectUrl: browser.runtime.getURL("pages/blocked.html") + "?host=" + encodeURIComponent(host) };
  }

  if (cfg.linkClean) {
    const cleaned = cleanUrl(details.url);
    if (cleaned) {
      return { redirectUrl: cleaned };
    }
  }
  return {};
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["blocking"]);

// --- per-site settings: scripts off (a page-level policy), and zoom -------------------------------------
browser.webRequest.onHeadersReceived.addListener(details => {
  const host = wrenHost(details.url);
  const site = cfg.siteSettings[host];
  if (site && site.noScripts) {
    return {
      responseHeaders: [
        ...details.responseHeaders,
        { name: "Content-Security-Policy", value: "script-src 'none'" },
      ],
    };
  }
  return {};
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["blocking", "responseHeaders"]);

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status == "loading" && tab.url) {
    const site = cfg.siteSettings[wrenHost(tab.url)];
    if (site && site.zoom) {
      browser.tabs.setZoom(tabId, site.zoom).catch(() => {});
    }
  }
});

async function setSite(host, patch) {
  const settings = await WrenSettings.get();
  const sites = { ...settings.siteSettings };
  sites[host] = { ...(sites[host] || {}), ...patch };
  if (!sites[host].dark && !sites[host].noScripts && !sites[host].zoom) {
    delete sites[host];
  }
  await WrenSettings.set({ siteSettings: sites });
  return sites[host] || {};
}

// --- notification digest -----------------------------------------------------------------------------
async function addDigest(note) {
  const { digestNotes = [] } = await browser.storage.local.get("digestNotes");
  digestNotes.unshift({ ...note, time: Date.now() });
  await browser.storage.local.set({ digestNotes: digestNotes.slice(0, 200) });
  browser.browserAction.setBadgeText({ text: String(Math.min(99, digestNotes.length)) });
  browser.browserAction.setBadgeBackgroundColor({ color: "#8a4b2a" });
}

// --- clipboard shelf (kept in memory only, gone when the browser closes) ---------------------------------
let clips = [];

// --- link peek: the first lines of a page ---------------------------------------------------------------
const peekCache = new Map();

async function peek(url) {
  if (peekCache.has(url)) {
    return peekCache.get(url);
  }
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!(response.headers.get("content-type") || "").includes("html")) {
      return { title: url, text: "this is a file, not a page." };
    }
    const doc = new DOMParser().parseFromString((await response.text()).slice(0, 400000), "text/html");
    const desc = doc.querySelector("meta[name=description], meta[property='og:description']")?.content || "";
    const paras = [...doc.querySelectorAll("article p, main p, p")].map(p => p.textContent.trim()).filter(t => t.length > 60);
    const text = (desc || paras.slice(0, 2).join(" ")).replace(/\s+/g, " ").slice(0, 340);
    const answer = { title: (doc.title || url).trim().slice(0, 120), text: text || "no preview available." };
    peekCache.set(url, answer);
    return answer;
  } catch (e) {
    return { title: url, text: "couldn't load a preview." };
  }
}

// --- watching pages for changes -------------------------------------------------------------------------
function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

async function pageFingerprint(url) {
  const response = await fetch(url, { credentials: "omit" });
  const doc = new DOMParser().parseFromString((await response.text()).slice(0, 600000), "text/html");
  doc.querySelectorAll("script, style, noscript, nav, footer, header, aside").forEach(n => n.remove());
  return hashText((doc.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30000));
}

async function checkWatchers() {
  const { watchers = [] } = await browser.storage.local.get("watchers");
  let changed = 0;
  for (const w of watchers) {
    try {
      const hash = await pageFingerprint(w.url);
      w.checked = Date.now();
      if (w.hash && w.hash != hash) {
        w.changed = true;
        changed++;
        browser.notifications.create("watch-" + w.url, {
          type: "basic",
          iconUrl: browser.runtime.getURL("pages/bird.svg"),
          title: "a page you watch has changed",
          message: w.title || w.url,
        });
      }
      w.hash = hash;
    } catch (e) {
      // offline or blocked: try again next time
    }
  }
  await browser.storage.local.set({ watchers });
  return changed;
}
browser.alarms.create("watch", { delayInMinutes: 10, periodInMinutes: 30 });
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == "watch") {
    checkWatchers();
  }
});

// --- search your own things from the address bar: type @ then a space then what you are after -----------
browser.omnibox.setDefaultSuggestion({ description: "search your notes, boards, saved pages and highlights" });

async function searchOwn(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    return [];
  }
  const data = await browser.storage.local.get(["pageDocs", "collections", "snapshots", "highlights", "scratch", "todos"]);
  const out = [];
  for (const d of data.pageDocs || []) {
    if ((d.title + " " + d.body).toLowerCase().includes(q)) {
      out.push({ content: browser.runtime.getURL("pages/pages.html") + "#note-" + d.id, description: "note: " + (d.title || "untitled") });
    }
  }
  for (const [name, items] of Object.entries(data.collections || {})) {
    for (const i of items) {
      if (((i.title || "") + " " + i.url).toLowerCase().includes(q)) {
        out.push({ content: i.url, description: `board ${name}: ${i.title || i.url}` });
      }
    }
  }
  for (const [url, s] of Object.entries(data.snapshots || {})) {
    if (s.text.toLowerCase().includes(q)) {
      out.push({ content: browser.runtime.getURL("pages/snapshot.html") + "?u=" + encodeURIComponent(url), description: "saved copy: " + (s.title || url) });
    }
  }
  for (const [url, list] of Object.entries(data.highlights || {})) {
    for (const h of list) {
      if (h.text.toLowerCase().includes(q)) {
        out.push({ content: url, description: "highlight: " + h.text.slice(0, 80) });
      }
    }
  }
  if ((data.scratch || "").toLowerCase().includes(q)) {
    out.push({ content: browser.runtime.getURL("pages/sidebar.html"), description: "your scratchpad mentions this" });
  }
  for (const t of data.todos || []) {
    if (t.text.toLowerCase().includes(q)) {
      out.push({ content: browser.runtime.getURL("pages/sidebar.html"), description: "to do: " + t.text });
    }
  }
  return out.slice(0, 8);
}

browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
  suggest(await searchOwn(text));
});
browser.omnibox.onInputEntered.addListener((text, disposition) => {
  if (/^(https?:|moz-extension:)/.test(text)) {
    if (disposition == "currentTab") {
      browser.tabs.update({ url: text });
    } else {
      browser.tabs.create({ url: text, active: disposition == "newForegroundTab" });
    }
  }
});

// --- messages ------------------------------------------------------------------------------------------
browser.runtime.onMessage.addListener(message => {
  switch (message.type) {
    case "digestNote":
      return addDigest(message);
    case "clip":
      clips = [message.text, ...clips.filter(c => c != message.text)].slice(0, 20);
      return Promise.resolve(true);
    case "clips":
      return Promise.resolve(clips);
    case "clipsClear":
      clips = [];
      return Promise.resolve(true);
    case "peek":
      return peek(message.url);
    case "site":
      return setSite(message.host, message.patch);
    case "watch":
      if (message.action == "add") {
        return browser.storage.local.get("watchers").then(async ({ watchers = [] }) => {
          if (!watchers.some(w => w.url == message.url)) {
            let hash = "";
            try {
              hash = await pageFingerprint(message.url);
            } catch (e) {
              // checked later
            }
            watchers.push({ url: message.url, title: message.title, hash, added: Date.now() });
            await browser.storage.local.set({ watchers });
          }
          return watchers;
        });
      }
      if (message.action == "check") {
        return checkWatchers();
      }
      return undefined;
    default:
      return undefined;
  }
});
