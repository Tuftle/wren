/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// More for the start page: the mood, a dot on watched pages that changed, a daily good thing,
// and what you usually open around now. Each is switched off until you switch it on, except the mood and dots.

(async () => {
  const settings = await WrenSettings.get();
  document.body.dataset.mood = settings.mood || "default";

  // --- accessibility choices apply here too ---
  if (settings.access.calm) {
    document.documentElement.classList.add("calm");
  }

  // --- watched pages: a dot when something changed ---
  const { watchers = [] } = await browser.storage.local.get("watchers");
  const watching = document.getElementById("watching");
  if (watchers.length) {
    watching.hidden = false;
    for (const w of watchers.slice(0, 6)) {
      const a = document.createElement("a");
      a.href = w.url;
      a.className = "watch" + (w.changed ? " changed" : "");
      a.textContent = (w.title || wrenHost(w.url)).slice(0, 28);
      a.title = w.changed ? "this page has changed" : "watching";
      a.addEventListener("click", async () => {
        w.changed = false;
        await browser.storage.local.set({ watchers });
      });
      watching.append(a);
    }
  }

  // --- what you usually open around now ---
  if (settings.routine) {
    try {
      const picks = await browser.runtime.sendMessage({ type: "routine" });
      if (picks && picks.length) {
        const box = document.getElementById("routine");
        box.hidden = false;
        document.getElementById("routineList").textContent = "";
        for (const p of picks) {
          const a = document.createElement("a");
          a.href = p.url;
          a.textContent = p.host;
          document.getElementById("routineList").append(a);
        }
        document.getElementById("routineOpen").addEventListener("click", () => {
          picks.forEach(p => browser.tabs.create({ url: p.url, active: false }));
          box.hidden = true;
        });
      }
    } catch (e) {
      // no history to learn from yet
    }
  }

  // --- a daily good thing: one fetch a day from Wikipedia, only if you turned it on ---
  if (settings.dailyGood) {
    const day = wrenDay();
    let { dailyGood } = await browser.storage.local.get("dailyGood");
    if (!dailyGood || dailyGood.day != day) {
      try {
        const [y, m, d] = day.split("-");
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`, { credentials: "omit" });
        const feed = await response.json();
        const tfa = feed.tfa;
        dailyGood = {
          day,
          title: tfa?.titles?.normalized || tfa?.title || "",
          text: (tfa?.extract || "").slice(0, 260),
          url: tfa?.content_urls?.desktop?.page || "",
        };
        await browser.storage.local.set({ dailyGood });
      } catch (e) {
        dailyGood = null;
      }
    }
    if (dailyGood && dailyGood.title) {
      const box = document.getElementById("daily");
      box.hidden = false;
      document.getElementById("dailyTitle").textContent = dailyGood.title;
      document.getElementById("dailyText").textContent = dailyGood.text;
      document.getElementById("dailyLink").href = dailyGood.url;
    }
  }
})();
