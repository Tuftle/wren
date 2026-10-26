/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// On the very first start of a new profile the window can open before the add-on that provides the start page is
// ready, and show an empty page. When Wren is up, a lone tab that is empty is pointed at the start page.
(() => {
  const start = browser.runtime.getURL("pages/start.html");
  const check = async () => {
    const tabs = await browser.tabs.query({});
    if (tabs.length !== 1) {
      return;
    }
    const [tab] = tabs;
    const empty = !tab.url || ["about:blank", "about:home", "about:newtab"].includes(tab.url) ||
      (tab.url.startsWith(start) && (!tab.title || tab.title == "New Tab"));
    if (empty && !tab.pinned) {
      await browser.tabs.update(tab.id, { url: start });
    }
  };
  for (const ms of [1500, 5000, 12000]) {
    setTimeout(() => check().catch(() => {}), ms);
  }
})();
