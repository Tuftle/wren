/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const box = document.getElementById("text");

async function save() {
  const text = box.value.trim();
  if (!text) {
    return;
  }
  if (/^https?:\/\/\S+$/.test(text)) {
    const { collections = {} } = await browser.storage.local.get("collections");
    const inbox = collections.inbox || [];
    if (!inbox.some(i => i.url == text)) {
      inbox.unshift({ url: text, title: text, added: Date.now() });
    }
    collections.inbox = inbox;
    await browser.storage.local.set({ collections });
    document.getElementById("state").textContent = "saved to your inbox board";
  } else {
    const { scratch = "" } = await browser.storage.local.get("scratch");
    await browser.storage.local.set({ scratch: (scratch ? scratch.replace(/\s+$/, "") + "\n" : "") + "• " + text });
    document.getElementById("state").textContent = "added to your scratchpad";
  }
  setTimeout(() => window.close(), 700);
}

document.getElementById("save").addEventListener("click", save);
box.addEventListener("keydown", e => {
  if (e.key == "Enter" && (e.ctrlKey || e.metaKey)) {
    save();
  } else if (e.key == "Escape") {
    window.close();
  }
});
