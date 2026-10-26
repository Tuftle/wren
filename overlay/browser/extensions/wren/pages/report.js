/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// "this site looks weird": tells tuftle which site looks wrong so it can be fixed. It sends a site name, and the server
// adds the time. Nothing is sent until the send button is pressed.

const REPORT_URL = "https://tuftle.vercel.app/api/weird";
const stateEl = document.getElementById("state");
const sendBtn = document.getElementById("send");
let host = "";
// a random code for this report, so tuftle can say later that it was looked at without knowing who sent it
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), n => ALPHABET[n % ALPHABET.length]).join("");

async function start() {
  const tab = await browser.runtime.sendMessage({ type: "frontTab" });
  try {
    const url = new URL(tab?.url || "");
    host = /^https?:$/.test(url.protocol) ? url.hostname : "";
  } catch (e) {
    host = "";
  }
  const what = document.getElementById("what");
  if (!host || host == "localhost" || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) {
    host = "";
    what.textContent = "this only works on a web page. open the site that looks wrong, then try again.";
    return;
  }
  what.textContent = "this would send: " + host + " and the time.";
  sendBtn.disabled = false;
  sendBtn.style.opacity = "";
}

sendBtn.addEventListener("click", async () => {
  sendBtn.disabled = true;
  sendBtn.style.opacity = ".5";
  stateEl.textContent = "sending…";
  try {
    const res = await fetch(REPORT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host, id: code }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (res.status == 429) {
      stateEl.textContent = "you have sent a few already. try again later.";
      return;
    }
    stateEl.textContent = res.ok ? "sent. thank you." : "it did not go through. nothing was sent.";
    if (res.ok) {
      const { weirdReports = [] } = await browser.storage.local.get("weirdReports");
      weirdReports.push({ id: code, host, at: Date.now() });
      await browser.storage.local.set({ weirdReports });
      setTimeout(() => window.close(), 1200);
    }
  } catch (e) {
    stateEl.textContent = "it did not go through. nothing was sent.";
  }
});
document.getElementById("cancel").addEventListener("click", () => window.close());
document.addEventListener("keydown", e => { if (e.key == "Escape") window.close(); });

start();
