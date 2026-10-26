/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// "bring things from a Firefox profile": picks one of the Firefox profiles on this computer and moves its bookmarks,
// history and cookies over (a copy of the files is read; the old profile is not changed). Used by the welcome
// and by the import page.
const WrenFirefoxImport = (() => {
  const ago = ms => {
    if (!ms) {
      return "never used";
    }
    const days = Math.round((Date.now() - ms) / 86400000);
    return days < 1 ? "used today" : days == 1 ? "used yesterday" : days < 60 ? `used ${days} days ago` : `used ${Math.round(days / 30)} months ago`;
  };

  const summary = s => `added ${s.added.length} of ${s.total}.` + (s.missed.length ? " not added: " + s.missed.join(", ") + "." : "");

  // the work happens in the background, so it carries on even if an add-on opens its own page in this tab
  async function installFrom(list, status) {
    let s = await browser.runtime.sendMessage({ type: "ffInstall", list });
    while (s.running) {
      status.textContent = `${s.done + 1} of ${s.total}: ${s.current}… you can keep using wren meanwhile.`;
      await new Promise(r => setTimeout(r, 1000));
      s = await browser.runtime.sendMessage({ type: "ffInstallState" });
    }
    status.textContent = summary(s);
  }

  // coming back to the page while a list is running, or just after one finished
  async function resume(box) {
    const s = await browser.runtime.sendMessage({ type: "ffInstallState" }).catch(() => null);
    if (!s || (!s.running && !(s.finished && Date.now() - s.finished < 600000))) {
      return;
    }
    const status = wrenEl("p", { class: "soft", "aria-live": "polite" });
    box.append(status);
    while (s.running) {
      status.textContent = `adding extensions: ${s.done + 1} of ${s.total}…`;
      await new Promise(r => setTimeout(r, 1000));
      Object.assign(s, await browser.runtime.sendMessage({ type: "ffInstallState" }));
    }
    status.textContent = summary(s);
  }

  async function showExtensions(box, path) {
    let list = [];
    try {
      list = await browser.wren.listFirefoxExtensions(path);
    } catch (e) {
      // no list: nothing to offer
    }
    if (!list.length) {
      return;
    }
    const wrap = wrenEl("div", { class: "ff-ext" }, wrenEl("p", { class: "soft", text: "that profile also had these extensions. the ones you tick are added together, from addons.mozilla.org, with the permissions they already have in firefox." }));
    const boxes = list.map(a => {
      const input = wrenEl("input", { type: "checkbox" });
      input.checked = true;
      wrap.append(wrenEl("label", { class: "ff-check" }, input, " " + a.name));
      return [input, a];
    });
    const status = wrenEl("p", { class: "soft" });
    const go = wrenEl("button", { class: "btn alt", text: "add the ticked ones" });
    go.addEventListener("click", () => {
      go.disabled = true;
      installFrom(boxes.filter(([i]) => i.checked).map(([, a]) => [a.id, a.name]), status).then(() => { go.disabled = false; });
    });
    wrap.append(go, status);
    box.append(wrap);
  }

  async function mount(box, { onDone } = {}) {
    box.textContent = "";
    let profiles = [];
    try {
      profiles = await browser.wren.listFirefoxProfiles();
    } catch (e) {
      // handled below
    }
    if (!profiles.length) {
      box.append(wrenEl("p", { class: "soft", text: "no firefox profiles found on this computer." }));
      return;
    }
    const select = wrenEl("select", { "aria-label": "firefox profile" },
      profiles.map(p => wrenEl("option", { value: p.path, text: `${p.name} · ${ago(p.lastUsed)}` })));
    const picks = {};
    const checks = [["bookmarks", "bookmarks", true], ["history", "history", true], ["cookies", "cookies, so you stay signed in", true]].map(([key, label, on]) => {
      const input = wrenEl("input", { type: "checkbox" });
      input.checked = on;
      picks[key] = input;
      return wrenEl("label", { class: "ff-check" }, input, " " + label);
    });
    const status = wrenEl("p", { class: "soft", "aria-live": "polite" });
    const go = wrenEl("button", { class: "btn alt", text: "import from this profile" });
    go.addEventListener("click", async () => {
      go.disabled = true;
      status.textContent = "importing… this can take a minute.";
      const what = Object.fromEntries(Object.entries(picks).map(([k, i]) => [k, i.checked]));
      try {
        const done = await browser.wren.importFromFirefox(select.value, what);
        const parts = Object.entries(done).map(([k, n]) => (n < 0 ? `${k}: couldn't` : `${n} ${k}`));
        status.textContent = parts.length ? "moved over: " + parts.join(", ") + "." : "nothing was ticked.";
        if (parts.length && onDone) {
          onDone(done);
        }
        await showExtensions(box, select.value);
      } catch (e) {
        status.textContent = "that didn't work: " + (e.message || e);
      }
      go.disabled = false;
    });
    resume(box);
    box.append(wrenEl("div", { class: "ff-row" }, select), wrenEl("div", { class: "ff-checks" }, checks), go, status,
      wrenEl("p", { class: "soft", text: "passwords: export them from firefox to a file and bring them in with the window above." }));
  }

  return { mount };
})();
