/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The first-run welcome: a card over the start page. It remembers where a person got to, so leaving
// (to import from another browser, say) and coming back never starts it over, and it is over for good
// once the last step has been shown.
(async function () {
  const { welcomed, welcomeStep } = await browser.storage.local.get(["welcomed", "welcomeStep"]);
  const WrenSettingsCache = await WrenSettings.get();
  if (welcomed) {
    return;
  }

  const overlay = document.getElementById("welcome");
  const card = overlay.querySelector(".card");
  const steps = [...overlay.querySelectorAll(".step")];
  const bars = document.getElementById("bars");
  const next = document.getElementById("next");
  const back = document.getElementById("back");
  steps.forEach(() => bars.append(document.createElement("i")));
  const last = steps.length - 1;
  let at = 0;
  let imported = false;

  const names = steps.map(s => s.dataset.name);
  const labels = { hello: "let's settle in", search: "continue", default: "not now", import: "skip", privacy: "continue", tips: "continue", done: "start browsing" };

  function show(n, going = "next") {
    at = Math.max(0, Math.min(last, n));
    card.classList.toggle("back", going == "back");
    steps.forEach((el, i) => el.classList.toggle("on", i == at));
    [...bars.children].forEach((el, i) => el.classList.toggle("on", i <= at));
    back.hidden = at == 0 || at == last;
    document.getElementById("skip").hidden = at == last;
    let label = labels[names[at]];
    // once a thing is done, the way forward is plain "continue"
    if ((names[at] == "default" && defaultDone) || (names[at] == "import" && imported)) {
      label = "continue";
    }
    next.textContent = label;
    browser.storage.local.set(at == last ? { welcomed: true, welcomeStep: 0 } : { welcomeStep: at });
  }

  async function finish() {
    WrenMusic.stop(3);
    await browser.storage.local.set({ welcomed: true, welcomeStep: 0 });
    overlay.classList.add("leaving");
    setTimeout(() => overlay.remove(), 600);
    document.getElementById("q").focus();
  }

  let defaultDone = false;
  next.addEventListener("click", () => (at == last ? finish() : show(at + 1)));
  back.addEventListener("click", () => show(at - 1, "back"));
  document.getElementById("skip").addEventListener("click", finish);
  document.addEventListener("keydown", e => {
    if (!document.getElementById("welcome")) {
      return;
    }
    if (e.key == "Escape") {
      finish();
    } else if (e.key == "Enter" && !(e.target instanceof HTMLButtonElement)) {
      next.click();
    }
  });

  const { isDefault, nook, privacy } = await browser.wren.getState();

  // --- pick a search engine, with the icons you know ---
  (async () => {
    const box = document.getElementById("engines");
    const note = document.getElementById("engineNote");
    let engines = [];
    try {
      engines = await browser.wren.listEngines();
    } catch (e) {
      // the list is not available: nook stays the choice
    }
    box.textContent = "";
    engines.sort((a, b) => (b.id == "nook") - (a.id == "nook") || a.name.localeCompare(b.name));
    for (const e of engines.slice(0, 8)) {
      e.icon = e.icon || WrenEngineIcons(e.name);
      const logo = wrenEl("span", { class: "logo" + (e.icon ? "" : " mono") }, e.icon ? wrenEl("img", { src: e.icon, alt: "" }) : e.name[0].toLowerCase());
      const tile = wrenEl("button", { class: "engine" + (e.isDefault ? " picked" : ""), role: "radio", "aria-checked": String(e.isDefault) },
        e.id == "nook" ? wrenEl("span", { class: "tag", text: "wren's own" }) : null, logo, wrenEl("b", { text: e.name.toLowerCase() }));
      tile.addEventListener("click", async () => {
        box.querySelectorAll(".engine").forEach(o => { o.classList.toggle("picked", o == tile); o.setAttribute("aria-checked", String(o == tile)); });
        await browser.wren.setDefaultEngine(e.id);
        note.textContent = e.id == "nook"
          ? "nook: no accounts, nothing logged, and answers appear as you type."
          : e.name.toLowerCase() + " will be used for searches. nook's instant answers stay available with the \u201cn\u201d keyword.";
      });
      box.append(tile);
    }
    if (!engines.length) {
      box.append(wrenEl("p", { class: "soft", text: "nook is set as your search." }));
    }
  })();
  if (isDefault) {
    defaultDone = true;
    document.getElementById("defaultNote").textContent = "already done. nothing to do here.";
    document.getElementById("makeDefault").hidden = true;
  }
  const picked = privacy == "strict" ? "strict" : "standard";
  overlay.querySelector('[data-privacy="' + picked + '"]').classList.add("picked");

  document.getElementById("makeDefault").addEventListener("click", async event => {
    const note = document.getElementById("defaultNote");
    try {
      await browser.wren.makeDefaultBrowser();
      defaultDone = true;
      note.textContent = "done. links will open in wren now.";
      event.target.hidden = true;
      next.textContent = "continue";
    } catch (e) {
      note.textContent = "windows wouldn't let me. you can set it in windows settings.";
    }
  });

  document.getElementById("doImport").addEventListener("click", event => {
    document.getElementById("importNote").textContent = "pick a browser in the window that just opened.";
    event.target.classList.add("ok");
    browser.wren.openImport();
  });

  // a Firefox profile on this computer: the list is read the first time the section is opened
  document.getElementById("ffBox").addEventListener("toggle", event => {
    if (event.target.open && !event.target.dataset.ready) {
      event.target.dataset.ready = "1";
      WrenFirefoxImport.mount(document.getElementById("ffImport"), {
        onDone() {
          imported = true;
          document.getElementById("doneTitle").textContent = "everything has moved in";
          document.getElementById("doneText").textContent = "your bookmarks and history are here. welcome home.";
        },
      });
    }
  });

  // when the import window reports it is done, say so and finish the welcome
  browser.wren.onImportDone.addListener(() => {
    imported = true;
    document.getElementById("doneTitle").textContent = "everything has moved in";
    document.getElementById("doneText").textContent = "your bookmarks and history are here. welcome home.";
    show(last);
  });

  overlay.querySelectorAll("[data-privacy]").forEach(b => b.addEventListener("click", () => {
    overlay.querySelectorAll("[data-privacy]").forEach(o => o.classList.toggle("picked", o == b));
    browser.wren.setPrivacy(b.dataset.privacy);
  }));

  // start.html#step-1 jumps straight to a step (used to check the screens)
  const jump = /#step-(\d+)/.exec(location.hash);
  show(jump ? Math.min(Number(jump[1]), last) : Math.min(welcomeStep || 0, last - 1));
  overlay.hidden = false;
  // music: the egg starts it; when the egg is skipped, the welcome does (unless calm motion is chosen)
  setTimeout(() => {
    if (!(WrenSettingsCache.access && WrenSettingsCache.access.calm)) {
      WrenMusic.start();
    }
  }, 600);
})();
