/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const mb = bytes => Math.round(bytes / 1048576).toLocaleString() + " MB";

async function look() {
  const rows = document.getElementById("rows");
  rows.textContent = "";
  const procs = (await browser.wren.getProcesses()).sort((a, b) => b.memory - a.memory);
  const total = procs.reduce((sum, p) => sum + p.memory, 0);
  document.getElementById("summary").textContent = `wren is using ${mb(total)} in all, across ${procs.length} processes.`;
  const tabs = await browser.tabs.query({});
  for (const p of procs.slice(0, 10)) {
    const what = p.titles[0] || (p.type == "extension" ? "add-ons" : p.type == "browser" ? "the browser itself" : p.type);
    const tab = tabs.find(t => p.titles.includes(t.title) || p.uris.includes(t.url));
    rows.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: what, title: p.uris[0] || "", onclick: e => { e.preventDefault(); tab && browser.tabs.update(tab.id, { active: true }); } }),
      wrenEl("span", { class: "pill", text: mb(p.memory) }),
      tab && !tab.active ? wrenEl("button", { class: "btn small", text: "close it", onclick: async () => { await browser.tabs.remove(tab.id); setTimeout(look, 600); } }) : null));
  }
}
document.getElementById("again").addEventListener("click", look);
look();
