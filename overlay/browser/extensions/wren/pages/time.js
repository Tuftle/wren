/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const fmt = s => (s >= 3600 ? Math.floor(s / 3600) + " h " : "") + Math.round((s % 3600) / 60) + " min";

function drawBars(root, totals) {
  root.textContent = "";
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...rows.map(r => r[1]));
  if (!rows.length) {
    root.append(wrenEl("p", { class: "soft", text: "nothing yet." }));
  }
  for (const [host, seconds] of rows) {
    root.append(wrenEl("div", { class: "bar" }, wrenEl("span", { text: host }),
      wrenEl("i", { style: `width:${Math.max(2, (seconds / max) * 100)}%` }), wrenEl("span", { class: "soft", text: fmt(seconds) })));
  }
}

(async () => {
  const settings = await WrenSettings.get();
  document.getElementById("off").hidden = settings.timeReport;
  const { timeLog = {} } = await browser.storage.local.get("timeLog");
  const today = timeLog[wrenDay()] || {};
  const week = {};
  for (let i = 0; i < 7; i++) {
    const day = timeLog[wrenDay(new Date(Date.now() - i * 86400000))] || {};
    for (const [h, s] of Object.entries(day)) {
      week[h] = (week[h] || 0) + s;
    }
  }
  drawBars(document.getElementById("today"), today);
  drawBars(document.getElementById("week"), week);
  document.getElementById("todayTotal").textContent = fmt(Object.values(today).reduce((a, b) => a + b, 0));
  document.getElementById("weekTotal").textContent = fmt(Object.values(week).reduce((a, b) => a + b, 0));
})();

document.getElementById("on").addEventListener("click", async () => { await WrenSettings.set({ timeReport: true }); location.reload(); });
document.getElementById("clear").addEventListener("click", async () => { await browser.storage.local.remove("timeLog"); location.reload(); });
