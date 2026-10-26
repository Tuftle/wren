/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Rooms: Firefox's "containers", made friendly. Each room keeps its own cookies and logins.
const COLORS = { blue: "#4f7fbf", turquoise: "#2f9aa0", green: "#6a9a56", yellow: "#d8b440", orange: "#d98a3e", red: "#c4553a", pink: "#c8708f", purple: "#8a6f9a" };
const PRESETS = [
  ["work", "blue", "briefcase"], ["shopping", "pink", "cart"], ["banking", "green", "dollar"],
  ["social", "orange", "circle"], ["travel", "turquoise", "vacation"],
];
const select = document.getElementById("color");
Object.keys(COLORS).forEach(c => select.append(wrenEl("option", { value: c, text: c })));

async function draw() {
  const list = document.getElementById("list");
  list.textContent = "";
  let rooms = [];
  try {
    rooms = await browser.contextualIdentities.query({});
  } catch (e) {
    document.getElementById("note").textContent = "rooms need a restart of wren to switch on. close and reopen it once.";
  }
  document.getElementById("empty").hidden = rooms.length > 0;
  for (const r of rooms) {
    list.append(wrenEl("div", { class: "room", style: `--c:${COLORS[r.color] || "#888"}` },
      wrenEl("span", { class: "dot" }),
      wrenEl("b", { text: r.name }),
      wrenEl("button", { class: "btn small", text: "new tab here", onclick: () => browser.tabs.create({ cookieStoreId: r.cookieStoreId }) }),
      wrenEl("button", { class: "btn small alt", text: "move this page here", onclick: async () => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true, url: ["http://*/*", "https://*/*"] });
        if (tab) {
          await browser.tabs.create({ url: tab.url, cookieStoreId: r.cookieStoreId });
          await browser.tabs.remove(tab.id);
        }
      } }),
      wrenEl("button", { class: "x", text: "delete", onclick: async () => { await browser.contextualIdentities.remove(r.cookieStoreId); draw(); } })));
  }
}

const presets = document.getElementById("presets");
for (const [name, color, icon] of PRESETS) {
  presets.append(wrenEl("button", { class: "btn small alt", text: name, onclick: async () => { await browser.contextualIdentities.create({ name, color, icon }); draw(); } }));
}
document.getElementById("form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  if (name) {
    await browser.contextualIdentities.create({ name, color: select.value, icon: "circle" });
    document.getElementById("name").value = "";
    draw();
  }
});
draw();
