/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Looks for a newer wren: a small file on tuftle's site says which build is newest. Nothing about you is sent; it is a
// plain download of that file, a couple of times a day. When there is a newer build, wren says so once and the updates
// page (pages/update.html) can swap it in.

async function checkForUpdate() {
  const info = await browser.wren.updateInfo();
  let latest;
  try {
    const res = await fetch(info.url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
    if (!res.ok) {
      return { ...info, error: "could not reach the update file" };
    }
    latest = await res.json();
  } catch (e) {
    return { ...info, error: "could not reach the update file" };
  }
  if (!/^\d{14}$/.test(String(latest.buildID)) || !/^\d{14}$/.test(info.buildID)) {
    return { ...info, error: "the update file is not readable" };
  }
  if (BigInt(latest.buildID) <= BigInt(info.buildID) || !latest.url || !/^[0-9a-f]{64}$/.test(String(latest.sha256 || ""))) {
    await browser.storage.local.remove("update");
    return { ...info, upToDate: true };
  }
  const update = {
    buildID: String(latest.buildID),
    version: String(latest.version || ""),
    notes: String(latest.notes || "").slice(0, 600),
    url: String(latest.url),
    sha256: String(latest.sha256),
  };
  const { update: before } = await browser.storage.local.get("update");
  await browser.storage.local.set({ update });
  if (!before || before.buildID != update.buildID) {
    browser.notifications.create("wren-update", {
      type: "basic",
      iconUrl: browser.runtime.getURL("pages/bird.svg"),
      title: "a new wren is ready",
      message: (update.notes ? update.notes + " " : "") + "click to update when it suits you.",
    });
  }
  return { ...info, update };
}

browser.notifications.onClicked.addListener(id => {
  if (id == "wren-update") {
    browser.tabs.create({ url: browser.runtime.getURL("pages/update.html") });
    browser.notifications.clear(id);
  }
});

browser.alarms.create("update-check", { delayInMinutes: 2, periodInMinutes: 720 });
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == "update-check") {
    checkForUpdate();
  }
});

browser.runtime.onMessage.addListener(message => {
  if (message.type == "updateCheck") {
    return checkForUpdate();
  }
  return undefined;
});
