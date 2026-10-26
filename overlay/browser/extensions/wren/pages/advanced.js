/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const DOORS = [
  ["config", "settings editor", "every preference the browser has. be careful in here."],
  ["debugging", "debugging", "inspect add-ons, workers and remote devices."],
  ["processes", "processes", "what each part of the browser is doing right now."],
  ["memory", "memory", "see and trim what the browser is holding on to."],
  ["networking", "networking", "connections, DNS and sockets."],
  ["support", "troubleshooting", "version, build and profile information."],
  ["serviceworkers", "service workers", "background workers that sites have registered."],
  ["webrtc", "web calls", "diagnostics for video and voice calls."],
  ["profiles", "profiles", "keep separate browser identities."],
  ["certificate", "certificates", "what the browser trusts."],
];

const grid = document.getElementById("grid");
for (const [page, title, hint] of DOORS) {
  grid.append(wrenEl("button", {
    onclick: async () => {
      try {
        await browser.wren.openAbout(page);
      } catch (e) {
        document.getElementById("note").textContent = "couldn't open it: " + (e.message || e);
      }
    },
  }, wrenEl("b", { text: title }), wrenEl("span", { text: "about:" + page + " — " + hint })));
}
