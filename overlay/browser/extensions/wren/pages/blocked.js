/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

document.getElementById("host").textContent = new URLSearchParams(location.search).get("host") || "this site";
document.getElementById("end").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "focus", on: false });
  history.length > 1 ? history.back() : window.close();
});
