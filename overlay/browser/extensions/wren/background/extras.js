/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The bird on the toolbar reacts to real things, every page gets a little "weather", saved pages open
// offline, and Wren keeps a private trail of how you moved between pages today. All of it stays here.

// --- the toolbar bird: calm, worried, happy, hiding ------------------------------------------------------
const BIRD_BODY =
  '<ellipse cx="62" cy="74" rx="28" ry="21"/><circle cx="42" cy="57" r="14"/>' +
  '<path d="M84 72C97 68 102 50 99 32c-1-4-7-3-7 1 0 14-6 22-17 27z"/><path d="M30 54L16 52l13 8z"/>' +
  '<path d="M54 92v7M68 92v7" stroke="context-fill" stroke-width="4" stroke-linecap="round"/>';

const BIRD_STATES = {
  calm: "",
  worried: '<path d="M104 24v22" stroke="context-fill" stroke-width="7" stroke-linecap="round"/><circle cx="104" cy="58" r="4"/>',
  happy: '<path d="M96 20c-8-5-12-9-12-14 0-4 3-6 6-6 2 0 4 1 6 3 2-2 4-3 6-3 3 0 6 2 6 6 0 5-4 9-12 14z" transform="translate(-6 8)"/>',
  hiding: '<rect x="8" y="88" width="104" height="26" rx="12"/>',
};

function birdIcon(state) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="context-fill" fill-opacity="context-fill-opacity">' +
    (state == "hiding" ? "" : BIRD_BODY) + (BIRD_STATES[state] || "") + "</svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const tabMood = new Map();

function setBird(state, tabId) {
  const details = { path: birdIcon(state) };
  if (tabId) {
    details.tabId = tabId;
  }
  browser.browserAction.setIcon(details).catch(() => {});
}

// slow pages make it worry
const loading = new Map();
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status == "loading") {
    clearTimeout(loading.get(tabId));
    loading.set(tabId, setTimeout(() => setBird("worried", tabId), 4000));
  } else if (change.status == "complete") {
    clearTimeout(loading.get(tabId));
    setBird("calm", tabId);
  }
});

// a finished download makes it happy for a moment
browser.downloads.onChanged.addListener(change => {
  if (change.state && change.state.current == "complete") {
    setBird("happy");
    setTimeout(() => setBird("calm"), 6000);
  }
});

// a blocked tracker makes it duck
const blocked = new Map();
browser.webRequest.onErrorOccurred.addListener(details => {
  if (/TRACKING|CLASSIFIED/i.test(details.error || "") && details.tabId > 0) {
    blocked.set(details.tabId, (blocked.get(details.tabId) || 0) + 1);
    setBird("hiding", details.tabId);
    setTimeout(() => setBird("calm", details.tabId), 1800);
  }
}, { urls: ["<all_urls>"] });
browser.tabs.onRemoved.addListener(tabId => { blocked.delete(tabId); pageInfo.delete(tabId); });

// --- page weather and speed -------------------------------------------------------------------------------
const pageInfo = new Map();

function weatherOf(info, blockedCount) {
  const score = info.bytes / 1048576 + info.nodes / 3000 + info.scripts / 40 + blockedCount / 20;
  return score < 1.5 ? "light" : score < 4 ? "busy" : "heavy";
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type == "pageStats" && sender.tab) {
    const tabId = sender.tab.id;
    const stats = { ...message.stats, blocked: blocked.get(tabId) || 0 };
    stats.weather = weatherOf(stats, stats.blocked);
    pageInfo.set(tabId, stats);
    WrenSettings.get().then(s => {
      if (s.mail) {
        return;
      }
      const sign = { light: "☀", busy: "⛅", heavy: "⛈" }[stats.weather];
      browser.browserAction.setBadgeText({ tabId, text: sign });
      browser.browserAction.setBadgeBackgroundColor({ tabId, color: { light: "#7d8f5c", busy: "#c89b6a", heavy: "#a43f2c" }[stats.weather] });
    });
    return undefined;
  }
  if (message.type == "pageInfo") {
    const stats = pageInfo.get(message.tabId);
    if (stats) {
      stats.blocked = blocked.get(message.tabId) || 0;
    }
    return Promise.resolve(stats || null);
  }
  return undefined;
});

// --- saved pages open when there is no connection ------------------------------------------------------------
browser.webNavigation.onErrorOccurred.addListener(async details => {
  self.__lastNavError = { url: details.url, error: details.error, frameId: details.frameId };
  if (details.frameId != 0 || !/^https?:/.test(details.url)) {
    return;
  }
  // Firefox reports these either by name or as a plain number: refused, timed out, reset, offline, unknown host
  const unreachable = [2152398861, 2152398862, 2152398864, 2152398867, 2152398868, 2152398878, 2152398920];
  const code = Number((/(\d{9,})/.exec(details.error || "") || [])[1]);
  if (!/OFFLINE|UNKNOWN_HOST|CONNECTION_REFUSED|NET_TIMEOUT|NET_INTERRUPT|NET_RESET/.test(details.error || "") && !unreachable.includes(code)) {
    return;
  }
  const { snapshots = {} } = await browser.storage.local.get("snapshots");
  if (snapshots[wrenKey(details.url)]) {
    browser.tabs.update(details.tabId, {
      url: browser.runtime.getURL("pages/snapshot.html") + "?u=" + encodeURIComponent(wrenKey(details.url)) + "&offline=1",
    });
  }
});

// --- the trail: where you came from, page to page, today --------------------------------------------------------
const lastUrl = new Map();

async function addEdge(from, to, tabId) {
  const day = wrenDay();
  const { trail = {} } = await browser.storage.local.get("trail");
  const today = (trail[day] ||= { nodes: {}, edges: [] });
  for (const url of [from, to]) {
    if (url && !today.nodes[url]) {
      today.nodes[url] = { host: wrenHost(url), title: "", time: Date.now() };
    }
  }
  if (from) {
    today.edges.push([from, to, Date.now()]);
  }
  if (today.edges.length > 500) {
    today.edges = today.edges.slice(-500);
  }
  for (const d of Object.keys(trail)) {
    if (Date.now() - new Date(d).getTime() > 7 * 86400000) {
      delete trail[d];
    }
  }
  await browser.storage.local.set({ trail });
}

browser.webNavigation.onCommitted.addListener(async details => {
  if (details.frameId != 0 || !/^https?:/.test(details.url)) {
    return;
  }
  if (details.transitionType == "reload") {
    return;
  }
  let from = lastUrl.get(details.tabId);
  if (!from) {
    try {
      const tab = await browser.tabs.get(details.tabId);
      if (tab.openerTabId) {
        from = lastUrl.get(tab.openerTabId);
      }
    } catch (e) {
      // gone already
    }
  }
  const to = wrenKey(details.url);
  lastUrl.set(details.tabId, to);
  if (from != to) {
    addEdge(from, to, details.tabId);
  }
});

browser.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.title && /^https?:/.test(tab.url || "")) {
    const { trail = {} } = await browser.storage.local.get("trail");
    const node = trail[wrenDay()]?.nodes?.[wrenKey(tab.url)];
    if (node && node.title != change.title) {
      node.title = change.title;
      await browser.storage.local.set({ trail });
    }
  }
});
browser.tabs.onRemoved.addListener(tabId => lastUrl.delete(tabId));

// --- routine: what you usually open around now (worked out from your own history) --------------------------------
async function routine() {
  const now = new Date();
  const weekend = [0, 6].includes(now.getDay());
  const hour = now.getHours();
  const items = await browser.history.search({ text: "", startTime: Date.now() - 30 * 86400000, maxResults: 3000 });
  const top = items.filter(i => /^https?:/.test(i.url)).sort((a, b) => b.visitCount - a.visitCount).slice(0, 60);
  const hosts = new Map();
  for (const item of top) {
    const visits = await browser.history.getVisits({ url: item.url });
    const days = new Set();
    for (const v of visits) {
      const d = new Date(v.visitTime);
      if (Date.now() - v.visitTime < 30 * 86400000 && [0, 6].includes(d.getDay()) == weekend && Math.abs(d.getHours() - hour) <= 1) {
        days.add(wrenDay(d));
      }
    }
    if (days.size >= 3) {
      const host = wrenHost(item.url);
      const old = hosts.get(host);
      if (!old || days.size > old.days) {
        hosts.set(host, { host, url: item.url, title: item.title, days: days.size });
      }
    }
  }
  return [...hosts.values()].sort((a, b) => b.days - a.days).slice(0, 3);
}

browser.runtime.onMessage.addListener(message => {
  if (message.type == "trail") {
    return browser.storage.local.get("trail").then(({ trail = {} }) => trail);
  }
  if (message.type == "routine") {
    return routine();
  }
  return undefined;
});
