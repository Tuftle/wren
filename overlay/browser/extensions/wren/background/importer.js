/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Adds the extensions the person ticked on the import page. It runs here, in the background, and not in the page:
// an add-on that opens its own page in the tab you are looking at would otherwise end the page's script and with it
// the rest of the list.
const WrenImporter = (() => {
  let state = { running: false, total: 0, done: 0, current: "", added: [], missed: [], finished: 0 };
  let origin = null;       // the tab the import was started from
  let busyUntil = 0;       // an add-on that has just been added may open its own page; this is how long that counts

  // Some add-ons open a page in the tab you are looking at the moment they are added. That would take the import
  // page's place, so the page they opened goes to a new tab and this tab goes back to where it was.
  function keepOrigin(tabId, changeInfo) {
    if (!origin || tabId !== origin.id || !changeInfo.url || changeInfo.url.startsWith(origin.base) || Date.now() > busyUntil) {
      return;
    }
    browser.tabs.create({ url: changeInfo.url, active: false }).catch(() => {});
    browser.tabs.goBack(tabId).catch(() => browser.tabs.update(tabId, { url: origin.url }));
  }
  browser.tabs.onUpdated.addListener(keepOrigin, { properties: ["url"] });

  async function addOne(id, name) {
    const api = await fetch("https://addons.mozilla.org/api/v5/addons/addon/" + encodeURIComponent(id) + "/");
    if (!api.ok) {
      throw new Error("not on addons.mozilla.org");
    }
    const info = await api.json();
    const result = await browser.wren.installExtension(info.current_version.file.url, { silent: true });
    if (result.installed) {
      state.added.push(name);
    } else {
      state.missed.push(`${name} (${result.why || "not added"})`);
    }
  }

  async function run(list, tab) {
    origin = tab ? { id: tab.id, url: tab.url, base: browser.runtime.getURL("pages/") } : null;
    state = { running: true, total: list.length, done: 0, current: "", added: [], missed: [], finished: 0 };
    for (const [id, name] of list) {
      state.current = name;
      busyUntil = Date.now() + 8000;
      try {
        await addOne(id, name);
        busyUntil = Date.now() + 8000;
      } catch (e) {
        state.missed.push(`${name} (${e.message || e})`);
      }
      state.done++;
    }
    state.running = false;
    state.current = "";
    setTimeout(() => { origin = null; }, 10000);
    state.finished = Date.now();
    try {
      await browser.notifications.create("wren-import-done", {
        type: "basic", iconUrl: browser.runtime.getURL("pages/bird-badge.svg"), title: "extensions added",
        message: `added ${state.added.length} of ${state.total}` + (state.missed.length ? `. ${state.missed.length} could not be added.` : "."),
      });
    } catch (e) {
      // no notification: the import page shows the same line
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type == "ffInstall") {
      if (!state.running) {
        run(message.list, sender.tab);
      }
      return Promise.resolve(state);
    }
    if (message.type == "ffInstallState") {
      return Promise.resolve(state);
    }
    return undefined;
  });
})();
