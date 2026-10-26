/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Two small helpers on every page: how long it takes to read, and a check that a link goes where
// it says it goes. Nothing leaves the page: no list is fetched and nothing is reported.

(() => {
  // --- reading time, asked for by the toolbar popup ----------------------------------------------
  browser.runtime.onMessage.addListener(message => {
    if (message.type != "readingTime") {
      return undefined;
    }
    const root = document.querySelector("article, main, [role=main]") || document.body;
    const words = (root.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    return Promise.resolve({ words, minutes: Math.max(1, Math.round(words / 230)) });
  });

  // --- links that say one place and go to another ---------------------------------------------
  const looksLikeAddress = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

  function registrable(host) {
    const parts = host.replace(/^www\./, "").split(".");
    return parts.slice(-2).join(".");
  }

  function mismatch(anchor) {
    const shown = anchor.textContent.trim();
    if (!looksLikeAddress.test(shown)) {
      return null;
    }
    let target;
    let claimed;
    try {
      target = new URL(anchor.href);
      claimed = new URL(/^https?:/i.test(shown) ? shown : "https://" + shown);
    } catch (e) {
      return null;
    }
    if (registrable(target.hostname) == registrable(claimed.hostname)) {
      return null;
    }
    return { shown: claimed.hostname, real: target.hostname };
  }

  function warn(info, proceed) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(40,30,20,.45)";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .card{font:16px/1.5 Georgia,serif;background:#f4efe6;color:#3b2f25;border:1px solid #d9cfbf;border-radius:18px;
              padding:1.4rem 1.6rem;max-width:26rem;box-shadow:0 20px 60px rgba(0,0,0,.35)}
        h2{margin:0 0 .5rem;font-weight:400;font-size:1.3rem}
        b{font-family:ui-monospace,Consolas,monospace;background:#e9e1d2;padding:.05em .3em;border-radius:5px}
        .row{display:flex;gap:.6rem;margin-top:1rem;justify-content:flex-end}
        button{font:inherit;border-radius:999px;border:1px solid #d9cfbf;background:transparent;color:inherit;padding:.45em 1.1em;cursor:pointer}
        button.go{background:#8a4b2a;color:#f4efe6;border-color:#8a4b2a}
      </style>
      <div class="card"><h2>this link goes somewhere else</h2>
        <p>it says <b></b> but opens <b></b>.</p>
        <div class="row"><button class="stay">stay here</button><button class="go">open it anyway</button></div></div>`;
    const [a, b] = root.querySelectorAll("b");
    a.textContent = info.shown;
    b.textContent = info.real;
    root.querySelector(".stay").addEventListener("click", () => host.remove());
    root.querySelector(".go").addEventListener("click", () => {
      host.remove();
      proceed();
    });
    document.documentElement.append(host);
  }

  let enabled = true;
  browser.storage.local.get("settings").then(({ settings }) => {
    enabled = settings?.safeLinks !== false;
  });
  browser.storage.onChanged.addListener(changes => {
    if (changes.settings) {
      enabled = changes.settings.newValue?.safeLinks !== false;
    }
  });

  document.addEventListener("click", event => {
    if (!enabled || event.defaultPrevented || event.button != 0) {
      return;
    }
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || !/^https?:/i.test(anchor.href)) {
      return;
    }
    const info = mismatch(anchor);
    if (info) {
      event.preventDefault();
      event.stopImmediatePropagation();
      warn(info, () => {
        window.location.href = anchor.href;
      });
    }
  }, true);
})();
