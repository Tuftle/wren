/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Lets the Wren add-ons website (and only that website) hand a mod to the browser. The browser
// still asks the person before anything is added.

(() => {
  const tell = installed => window.postMessage({ tuftle: "wren-state", wren: true, installed }, window.location.origin);

  browser.runtime.sendMessage({ type: "mods", action: "state" }).then(r => tell(r.installed)).catch(() => {});
  browser.runtime.onMessage.addListener(message => {
    if (message.type == "modsState") {
      tell(message.installed);
    }
  });

  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.tuftle != "wren-install") {
      return;
    }
    browser.runtime.sendMessage({ type: "mods", action: "fromSite", mod: event.data.mod }).catch(() => {
      window.postMessage({ tuftle: "wren-error" }, window.location.origin);
    });
  });

  // so the page knows it is open in wren
  document.documentElement.dataset.wren = "1";
})();
