/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const statusEl = document.getElementById("status");
const notesEl = document.getElementById("notes");
const goBtn = document.getElementById("go");
let pending = null;

async function check() {
  statusEl.textContent = "checking…";
  goBtn.hidden = true;
  notesEl.hidden = true;
  const r = await browser.runtime.sendMessage({ type: "updateCheck" });
  if (r.error) {
    statusEl.textContent = r.error + ". try again in a bit.";
  } else if (r.update) {
    pending = r.update;
    statusEl.textContent = "a newer wren is ready" + (r.update.version ? " (" + r.update.version + ")" : "") + ".";
    notesEl.textContent = r.update.notes;
    notesEl.hidden = !r.update.notes;
    goBtn.hidden = false;
  } else {
    statusEl.textContent = "you have the newest wren (" + r.version + ", build " + r.buildID + ").";
  }
}

goBtn.addEventListener("click", async () => {
  goBtn.disabled = true;
  statusEl.textContent = "downloading… wren will close, update, and open again.";
  try {
    await browser.wren.installUpdate(pending.url, pending.sha256);
  } catch (e) {
    statusEl.textContent = "the update did not go through: " + (e.message || e) + ". nothing was changed.";
    goBtn.disabled = false;
  }
});
document.getElementById("again").addEventListener("click", check);
check();
