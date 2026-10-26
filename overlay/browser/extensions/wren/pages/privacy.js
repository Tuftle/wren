/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const LABELS = {
  trackers: "trackers",
  cookies: "tracking cookies",
  cryptominers: "cryptominers",
  fingerprinters: "fingerprinters",
  social: "social trackers",
};

// --- what was kept out ---------------------------------------------------------------------------
(async () => {
  try {
    const { total, byType } = await browser.wren.getPrivacyStats(7);
    document.getElementById("total").textContent =
      total ? `${total.toLocaleString()} things blocked` : "nothing blocked yet";
    document.getElementById("statsNote").textContent = "last 7 days";
    const max = Math.max(1, ...Object.values(byType));
    const bars = document.getElementById("bars");
    for (const [type, count] of Object.entries(byType)) {
      bars.append(wrenEl("div", { class: "bar" },
        wrenEl("span", { text: LABELS[type] }),
        wrenEl("i", { style: `width:${Math.max(2, (count / max) * 100)}%` }),
        wrenEl("span", { class: "soft", text: String(count) })));
    }
  } catch (e) {
    document.getElementById("total").textContent = "no data yet";
  }
})();

// --- quiet mode ------------------------------------------------------------------------------------
const quiet = document.getElementById("quiet");
browser.wren.getQuietMode().then(on => { quiet.checked = on; });
quiet.addEventListener("change", () => browser.wren.setQuietMode(quiet.checked));

// --- permissions ---------------------------------------------------------------------------------
const NAMES = { geo: "location", "desktop-notification": "notifications", "persistent-storage": "keep data", screen: "screen sharing" };
async function drawPerms() {
  const list = document.getElementById("perms");
  list.textContent = "";
  const perms = await browser.wren.listPermissions();
  document.getElementById("permsEmpty").hidden = perms.length > 0;
  for (const p of perms) {
    list.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: wrenHost(p.origin) || p.origin }),
      wrenEl("span", { class: "pill", text: NAMES[p.type.split("^")[0]] || p.type.split("^")[0] }),
      wrenEl("button", { class: "x", text: "revoke", onclick: async () => { await browser.wren.revokePermission(p.origin, p.type); drawPerms(); } })));
  }
}
document.getElementById("revokeAll").addEventListener("click", async () => {
  await browser.wren.revokeAllPermissions();
  drawPerms();
});
drawPerms();

// --- passwords ----------------------------------------------------------------------------------------
document.getElementById("checkPw").addEventListener("click", async () => {
  const out = document.getElementById("pwOut");
  out.textContent = "";
  const { total, reused, weak } = await browser.wren.analyzePasswords();
  if (!total) {
    out.append(wrenEl("p", { text: "no saved passwords to check." }));
    return;
  }
  out.append(wrenEl("p", { text: `${total} saved. ${reused.length} reused on more than one site, ${weak.length} short or very common.` }));
  for (const group of reused) {
    out.append(wrenEl("p", { class: "soft", text: "same password on: " + group.map(wrenHost).join(", ") }));
  }
  if (weak.length) {
    out.append(wrenEl("p", { class: "soft", text: "weak on: " + weak.map(wrenHost).join(", ") }));
  }
});

// --- downloads ----------------------------------------------------------------------------------------
(async () => {
  const list = document.getElementById("downloads");
  const items = await browser.downloads.search({ orderBy: ["-startTime"], limit: 8, state: "complete" });
  if (!items.length) {
    list.append(wrenEl("li", { class: "soft", text: "no downloads yet." }));
  }
  for (const item of items) {
    const name = item.filename.split(/[\\/]/).pop();
    const note = wrenEl("span", { class: "soft" });
    list.append(wrenEl("li", {},
      wrenEl("a", { href: "#", text: name, title: item.filename, onclick: e => { e.preventDefault(); browser.downloads.show(item.id); } }),
      note,
      wrenEl("button", { class: "btn small", text: "scan", onclick: async () => {
        note.textContent = "scanning…";
        const r = await browser.wren.scanFile(item.filename);
        note.textContent = !r.ok ? "can't scan: " + r.reason : r.clean ? "clean" : "windows found something (code " + r.code + ")";
      } })));
  }
})();

document.getElementById("panic").addEventListener("click", () => browser.wren.panic());
