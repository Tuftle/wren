/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

async function change(patch) {
  await WrenSettings.set(patch);
  browser.runtime.sendMessage({ type: "settingsChanged" });
  const note = document.getElementById("saved");
  note.textContent = "saved";
  setTimeout(() => { note.textContent = " "; }, 1200);
}

WrenSettings.get().then(settings => {
  document.querySelectorAll("input[data-key]").forEach(box => {
    box.checked = !!settings[box.dataset.key];
    box.addEventListener("change", () => change({ [box.dataset.key]: box.checked }));
  });
  const keep = document.getElementById("keep");
  keep.value = settings.sweeperKeep.join("\n");
  keep.addEventListener("change", () =>
    change({ sweeperKeep: keep.value.split(/\s+/).map(s => s.trim().toLowerCase()).filter(Boolean) }));
  const days = document.getElementById("days");
  days.value = settings.historyDays;
  days.addEventListener("change", () => change({ historyDays: Math.max(0, Number(days.value) || 0) }));
  const feed = document.getElementById("feed");
  feed.value = settings.mailFeed;
  feed.addEventListener("change", () => change({ mailFeed: feed.value.trim() }));
  for (const [id, key, min, max] of [["sleepMinutes", "sleepMinutes", 5, 1440], ["shadeFrom", "shadeFrom", 0, 23], ["shadeTo", "shadeTo", 0, 23], ["shadeLevel", "shadeLevel", 0, 100]]) {
    const el = document.getElementById(id);
    el.value = settings[key];
    el.addEventListener("change", () => change({ [key]: Math.min(max, Math.max(min, Number(el.value) || min)) }));
  }
  for (const id of ["bedFrom", "bedTo"]) {
    const el = document.getElementById(id);
    el.value = settings[id];
    el.addEventListener("change", () => change({ [id]: Math.min(23, Math.max(0, Number(el.value) || 0)) }));
  }
  const mood = document.getElementById("mood");
  mood.value = settings.mood;
  mood.addEventListener("change", () => browser.runtime.sendMessage({ type: "mood", name: mood.value, sound: false }).then(() => change({})));
  const minutes = document.getElementById("minutes");
  minutes.value = settings.focusMinutes;
  minutes.addEventListener("change", () => change({ focusMinutes: Math.max(1, Number(minutes.value) || 25) }));
});
