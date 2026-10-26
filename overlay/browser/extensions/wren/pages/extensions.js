/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const SHELF = [
  ["uBlock Origin", "ublock-origin", "blocks ads and trackers, and is light on memory", "uBlock0@raymondhill.net"],
  ["Bitwarden", "bitwarden-password-manager", "a password manager you can use on every device", "{446900e4-71c2-419f-a6a7-df9c091e268b}"],
  ["Dark Reader", "darkreader", "dark mode for every site", "addon@darkreader.org"],
  ["Privacy Badger", "privacy-badger17", "learns to block trackers by watching what they do", "jid1-MnnxcxisBPnSXQ@jetpack"],
  ["SponsorBlock", "sponsorblock", "skips sponsor segments in videos", "sponsorBlocker@ajay.app"],
  ["Stylus", "styl-us", "change how any site looks with your own styles", "{7a7a4a92-a2a0-41d1-9fd7-1e92480d612d}"],
];

(async () => {
  let installed = [];
  try {
    installed = await browser.wren.listExtensions();
  } catch (e) {
    // fine: the list is only for the "installed" label
  }
  const list = document.getElementById("list");
  for (const [name, slug, why, id] of SHELF) {
    const have = installed.some(x => x.id == id);
    const button = wrenEl("button", { class: "btn small", text: have ? "installed" : "install", disabled: have });
    button.addEventListener("click", async () => {
      button.textContent = "installing…";
      button.disabled = true;
      try {
        const r = await browser.wren.installExtension(`https://addons.mozilla.org/firefox/downloads/latest/${slug}/latest.xpi`);
        if (r.installed) {
          button.textContent = "installed";
          document.getElementById("note").textContent = (r.name || name) + " is installed. you can find its button under the extensions icon.";
        } else {
          button.textContent = "install";
          button.disabled = false;
          document.getElementById("note").textContent = name + " was not added (" + (r.why || "no answer") + ").";
        }
      } catch (e) {
        button.textContent = "install";
        button.disabled = false;
        document.getElementById("note").textContent = "couldn't install " + name + ": " + (e.message || e);
      }
    });
    list.append(wrenEl("div", { class: "item" }, wrenEl("div", { class: "t" }, wrenEl("b", { text: name }), wrenEl("span", { class: "soft", text: why })), button));
  }
})();
