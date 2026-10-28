/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Burrow inside Wren. The vault page (pages/burrow) does the unlocking and tells this script which logins are
// open. They live here in memory only, are dropped when the vault locks (or after ten quiet minutes), and a web
// page only ever gets the login for its own site, and only after a click that really came from the person.

(() => {
  const QUIET_MS = 10 * 60 * 1000;
  const OFFER_MS = 30 * 1000;
  const OWN = browser.runtime.getURL("pages/burrow/");

  let locked = true;
  let entries = [];
  let quietTimer = null;
  let pending = null; // a login to be saved, handed to the vault page when it opens
  const offers = new Map(); // tab id -> { user, pass, host, at }

  let matcher = null;
  const lib = async () => (matcher ||= await import(browser.runtime.getURL("pages/burrow/match.js")));

  function lock() {
    locked = true;
    entries = [];
    offers.clear();
    clearTimeout(quietTimer);
    browser.runtime.sendMessage({ type: "vault:lockNow" }).catch(() => {}); // an open vault page locks too
  }

  function touch() {
    clearTimeout(quietTimer);
    if (!locked) {
      quietTimer = setTimeout(lock, QUIET_MS);
    }
  }

  const fromOwnPage = sender => Boolean(sender.url && sender.url.startsWith(OWN) && !sender.tab?.url?.startsWith("http"));
  const tabUrl = sender => (sender.tab && sender.tab.url) || "";

  async function matchesFor(url) {
    const { matches } = await lib();
    return entries.filter(e => matches(e, url));
  }

  async function open() {
    const tabs = await browser.tabs.query({ url: OWN + "*" });
    if (tabs.length) {
      await browser.tabs.update(tabs[0].id, { active: true });
      await browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await browser.tabs.create({ url: OWN + "index.html" });
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (!message || typeof message.type != "string" || !message.type.startsWith("vault:")) {
      return undefined;
    }
    switch (message.type) {
      // ---- from the vault page ----
      case "vault:state":
        if (!fromOwnPage(sender)) {
          return undefined;
        }
        locked = Boolean(message.locked);
        entries = locked ? [] : (message.entries || []).map(e => ({ id: e.id, site: e.site, url: e.url, user: e.user, pass: e.pass }));
        if (locked) {
          offers.clear();
        }
        touch();
        return Promise.resolve(true);
      case "vault:takePending": {
        if (!fromOwnPage(sender)) {
          return undefined;
        }
        const p = pending;
        pending = null;
        return Promise.resolve(p);
      }

      // ---- from a web page's content script ----
      case "vault:matches":
        if (locked) {
          return Promise.resolve({ locked: true, list: [] });
        }
        touch();
        return matchesFor(tabUrl(sender)).then(list => ({ locked: false, list: list.map(e => ({ id: e.id, user: e.user, site: e.site })) }));
      case "vault:fill":
        if (locked) {
          return Promise.resolve(null);
        }
        touch();
        // the page is checked again here, so a page cannot ask for another site's login by id
        return matchesFor(tabUrl(sender)).then(list => {
          const e = list.find(x => x.id == message.id);
          return e ? { user: e.user, pass: e.pass } : null;
        });
      case "vault:submitted": {
        // a login form was sent. Remember it for a moment so the next page can ask "save this?"
        if (locked || !sender.tab || !message.pass) {
          return undefined;
        }
        const url = tabUrl(sender);
        return matchesFor(url).then(list => {
          if (list.some(e => e.user == message.user && e.pass == message.pass)) {
            return false; // already saved
          }
          offers.set(sender.tab.id, { user: String(message.user || ""), pass: String(message.pass), url, at: Date.now() });
          return true;
        });
      }
      case "vault:offer": {
        const o = sender.tab && offers.get(sender.tab.id);
        if (!o || locked || Date.now() - o.at > OFFER_MS) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ user: o.user });
      }
      case "vault:startSave": {
        const o = sender.tab && offers.get(sender.tab.id);
        if (!o || locked || Date.now() - o.at > OFFER_MS) {
          return Promise.resolve(false);
        }
        offers.delete(sender.tab.id);
        let host = "";
        try {
          host = new URL(o.url).hostname.replace(/^www\./, "");
        } catch (e) {
          // keep it empty
        }
        pending = { site: host, url: o.url, user: o.user, pass: o.pass };
        smallWindow("burrow/index.html", 480, 680);
        return Promise.resolve(true);
      }
      case "vault:open":
        return open().then(() => true);
      case "vault:lock":
        lock();
        return Promise.resolve(true);
      case "vault:status":
        return Promise.resolve({ locked, count: entries.length });
      default:
        return undefined;
    }
  });

  browser.tabs.onRemoved.addListener(id => offers.delete(id));

  browser.commands.onCommand.addListener(async command => {
    if (command == "vault") {
      open();
    } else if (command == "vault-fill") {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        return;
      }
      if (locked) {
        open();
      } else {
        browser.tabs.sendMessage(tab.id, { type: "vault:fillNow" }).catch(() => {});
      }
    }
  });
})();
