/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// "this site looks weird" reports that are waiting for an answer. Each has a random code that wren made up; when a report
// is fixed, tuftle writes a note under that code. Wren asks about the codes it is waiting for, and nothing else, a few
// times a day, and shows the note as a notification.

const WEIRD_ASK = "https://tuftle.vercel.app/api/resolved";
const WEIRD_KEEP_DAYS = 60;

async function checkWeirdReports() {
  const { weirdReports = [] } = await browser.storage.local.get("weirdReports");
  const fresh = weirdReports.filter(r => Date.now() - r.at < WEIRD_KEEP_DAYS * 864e5);
  if (!fresh.length) {
    if (weirdReports.length) {
      await browser.storage.local.set({ weirdReports: [] });
    }
    return;
  }
  let answer;
  try {
    const res = await fetch(WEIRD_ASK + "?ids=" + fresh.slice(0, 20).map(r => r.id).join(","), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (!res.ok) {
      return;
    }
    answer = (await res.json()).resolved || {};
  } catch (e) {
    return; // offline, or the site is down: ask again next time
  }
  for (const report of fresh) {
    const done = answer[report.id];
    if (!done) {
      continue;
    }
    const note = String(done.message || "").slice(0, 300);
    browser.notifications.create("weird-" + report.id, {
      type: "basic",
      iconUrl: browser.runtime.getURL("pages/bird-badge.svg"),
      title: report.host + " has been looked at",
      message: (note ? note + " " : "") + "try the site again. click to open it.",
    });
    await browser.storage.local.set({ weirdHosts: { ...((await browser.storage.local.get("weirdHosts")).weirdHosts || {}), ["weird-" + report.id]: report.host } });
  }
  const left = fresh.filter(r => !answer[r.id]);
  await browser.storage.local.set({ weirdReports: left });
}

browser.notifications.onClicked.addListener(async id => {
  if (!id.startsWith("weird-")) {
    return;
  }
  const { weirdHosts = {} } = await browser.storage.local.get("weirdHosts");
  if (weirdHosts[id]) {
    browser.tabs.create({ url: "https://" + weirdHosts[id] + "/" });
    delete weirdHosts[id];
    await browser.storage.local.set({ weirdHosts });
  }
  browser.notifications.clear(id);
});

browser.alarms.create("weird-check", { delayInMinutes: 0.5, periodInMinutes: 360 });
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == "weird-check") {
    checkWeirdReports();
  }
});
