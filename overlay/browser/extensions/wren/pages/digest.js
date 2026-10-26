/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// A calm page you open on purpose: today's weather and watches from nook, and what you saved.
(async () => {
  const hour = new Date().getHours();
  document.getElementById("hello").textContent =
    hour < 12 ? "good morning" : hour < 18 ? "good afternoon" : "good evening";
  document.getElementById("date").textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const base = await wrenNook();
  document.getElementById("weather").src = base + "/weather";
  document.getElementById("today").src = base + "/today";
  document.getElementById("wl").href = base + "/weather";
  document.getElementById("tl").href = base + "/today";

  const { collections = {}, todos = [] } = await browser.storage.local.get(["collections", "todos"]);
  const inbox = collections.inbox || [];
  const list = document.getElementById("inbox");
  inbox.slice(0, 6).forEach(i => list.append(wrenEl("li", {}, wrenEl("a", { href: i.url, text: i.title || i.url }))));
  document.getElementById("inboxNote").textContent = inbox.length ? "" : "nothing saved yet. right-click a page to save it here.";
  const open = todos.filter(t => !t.done);
  const tl = document.getElementById("todos");
  open.slice(0, 8).forEach(t => tl.append(wrenEl("li", {}, wrenEl("span", { text: t.text }))));
  document.getElementById("todoNote").textContent = open.length ? "" : "nothing left to do.";
})();
