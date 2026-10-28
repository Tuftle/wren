/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Burrow on web pages. Quiet by default: nothing shows unless the vault is open and has a login for this very
// site. The little chip lives in a closed shadow root, so the page cannot read or click it, and it only reacts
// to clicks that really came from the person. Nothing is filled until they click.

(() => {
  if (window.top !== window) {
    return; // forms inside frames are left alone
  }

  const send = message => browser.runtime.sendMessage(message).catch(() => null);

  let chip = null;

  function passwordField() {
    return [...document.querySelectorAll("input[type=password]")].find(i => {
      const r = i.getBoundingClientRect();
      return r.width > 40 && r.height > 12 && getComputedStyle(i).visibility != "hidden";
    });
  }

  // the text or email box just before the password box, usually the username
  function userField(pass) {
    const form = pass.form || document;
    const all = [...form.querySelectorAll("input")];
    const before = all.slice(0, all.indexOf(pass)).reverse();
    return before.find(i => ["text", "email", "tel", ""].includes((i.getAttribute("type") || "").toLowerCase()) && i.offsetWidth > 0);
  }

  function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fill(id) {
    const found = await send({ type: "vault:fill", id });
    const pass = passwordField();
    if (!found || !pass) {
      return false;
    }
    const user = userField(pass);
    if (user && found.user) {
      setValue(user, found.user);
    }
    setValue(pass, found.pass);
    return true;
  }

  // ---- the chip -------------------------------------------------------------------------------------------

  const STYLE = `
    :host { all: initial; }
    .chip { position: fixed; z-index: 2147483647; font: 14px/1.3 Georgia, "Palatino Linotype", serif; color: #3b2f25; background: #fbf8f2;
      border: 1px solid #ddd2c1; border-radius: 12px; box-shadow: 0 6px 22px rgba(59,47,37,.22); padding: 6px; min-width: 150px; }
    @media (prefers-color-scheme: dark) { .chip { color: #e6dccd; background: #2a231c; border-color: #3a3128; } }
    button { all: unset; display: block; width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
    button:hover, button:focus-visible { background: rgba(224,168,112,.3); }
    small { display: block; padding: 2px 10px 4px; color: #8a7b6b; font-size: 12px; }
  `;

  function drop() {
    if (chip) {
      chip.host.remove();
      chip = null;
    }
  }

  function showChip(rows, title, anchor) {
    drop();
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const box = document.createElement("div");
    box.className = "chip";
    const head = document.createElement("small");
    head.textContent = title;
    box.append(head);
    for (const [label, action] of rows) {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", async e => {
        if (!e.isTrusted) {
          return; // a script clicking for the person does not count
        }
        await action();
        drop();
      });
      box.append(b);
    }
    root.append(style, box);
    document.documentElement.append(host);
    const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth - 240, bottom: 16 };
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 230)) + "px";
    box.style.top = Math.min(r.bottom + 6, window.innerHeight - 90) + "px";
    chip = { host };
    setTimeout(() => chip && chip.host == host && drop(), 20000);
  }

  async function offerFill(auto) {
    const pass = passwordField();
    if (!pass) {
      return;
    }
    const { locked, list } = (await send({ type: "vault:matches" })) || { list: [] };
    if (locked || !list.length) {
      return;
    }
    const rows = list.map(e => [e.user || e.site || "login", () => fill(e.id)]);
    if (!auto && list.length == 1) {
      await fill(list[0].id); // asked for with the shortcut: just do it
      return;
    }
    showChip(rows, "fill from burrow", pass);
  }

  async function offerSave() {
    const o = await send({ type: "vault:offer" });
    if (!o) {
      return;
    }
    showChip([["save " + (o.user || "this login"), () => send({ type: "vault:startSave" })], ["not now", () => {}]], "burrow", null);
  }

  // ---- when to look ---------------------------------------------------------------------------------------

  let watching = false;
  function look() {
    if (passwordField()) {
      offerFill(true);
    } else if (!watching) {
      watching = true;
      // some sites add the form late; look again a few times, then stop
      let tries = 0;
      const timer = setInterval(() => {
        if (passwordField()) {
          clearInterval(timer);
          offerFill(true);
        } else if (++tries > 6) {
          clearInterval(timer);
        }
      }, 1500);
    }
  }

  document.addEventListener("submit", e => {
    const form = e.target;
    const pass = form && form.querySelector && form.querySelector("input[type=password]");
    if (!pass || !pass.value) {
      return;
    }
    const user = userField(pass);
    send({ type: "vault:submitted", user: user ? user.value : "", pass: pass.value });
    setTimeout(offerSave, 1500); // for pages that stay put after sending
  }, true);

  browser.runtime.onMessage.addListener(message => {
    if (message.type == "vault:fillNow") {
      offerFill(false);
    }
    return undefined;
  });

  look();
  offerSave(); // after a page change: was a login just sent?
})();
