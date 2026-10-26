/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function stat(n, label) {
  return wrenEl("div", { class: "stat" }, wrenEl("div", { class: "n", text: String(n) }), wrenEl("div", { class: "l", text: label }));
}

function bars(root, rows, fmt = v => v) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  for (const [label, value] of rows) {
    root.append(wrenEl("div", { class: "bar" }, wrenEl("span", { text: label }),
      wrenEl("i", { style: `width:${Math.max(2, (value / max) * 100)}%` }), wrenEl("span", { class: "soft", text: fmt(value) })));
  }
}

(async () => {
  const year = new Date().getFullYear();
  document.getElementById("head").textContent = "your " + year;
  const start = new Date(year, 0, 1).getTime();
  const items = (await browser.history.search({ text: "", startTime: start, maxResults: 20000 })).filter(i => /^https?:/.test(i.url));
  const byHost = new Map();
  let visits = 0;
  for (const i of items) {
    const h = wrenHost(i.url);
    byHost.set(h, (byHost.get(h) || 0) + i.visitCount);
    visits += i.visitCount;
  }
  const hours = Array(24).fill(0);
  for (const item of [...items].sort((a, b) => b.visitCount - a.visitCount).slice(0, 60)) {
    for (const v of await browser.history.getVisits({ url: item.url })) {
      if (v.visitTime >= start) {
        hours[new Date(v.visitTime).getHours()]++;
      }
    }
  }
  const data = await browser.storage.local.get(["timeLog", "highlights", "collections", "pageDocs", "snapshots", "stats"]);
  const seconds = Object.values(data.timeLog || {}).reduce((n, day) => n + Object.values(day).reduce((a, b) => a + b, 0), 0);
  const boards = Object.values(data.collections || {}).reduce((n, list) => n + list.length, 0);
  const marks = Object.values(data.highlights || {}).reduce((n, list) => n + list.length, 0);
  const busiest = hours.indexOf(Math.max(...hours));

  const stats = document.getElementById("stats");
  stats.append(stat(visits.toLocaleString(), "pages opened"));
  stats.append(stat(byHost.size.toLocaleString(), "different sites"));
  if (seconds) {
    stats.append(stat(Math.round(seconds / 3600) + " h", "counted by the time report"));
  }
  stats.append(stat((data.stats?.focusSessions || 0).toString(), "focus sessions"));
  stats.append(stat(marks, "highlights"));
  stats.append(stat(boards, "pages on your boards"));
  stats.append(stat((data.pageDocs || []).length, "notes written"));
  stats.append(stat(Object.keys(data.snapshots || {}).length, "saved copies"));
  if (Math.max(...hours) > 0) {
    stats.append(stat((busiest % 12 || 12) + (busiest < 12 ? " am" : " pm"), "your busiest hour"));
  }

  bars(document.getElementById("top"), [...byHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8), v => v + " visits");
  bars(document.getElementById("hours"), hours.map((v, h) => [(h % 12 || 12) + (h < 12 ? " am" : " pm"), v]).filter(r => r[1] > 0));
})();
