/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const hour = new Date().getHours();
document.getElementById("greeting").textContent =
  hour < 5 ? "still up?" : hour < 12 ? "good morning" : hour < 18 ? "good afternoon" : "good evening";

document.getElementById("search").addEventListener("submit", event => {
  event.preventDefault();
  const query = document.getElementById("q").value.trim();
  if (query) {
    browser.search.search({ query, disposition: "CURRENT_TAB" });
  }
});

function tile(site) {
  const host = new URL(site.url).hostname.replace(/^www\./, "");
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = site.url;
  const ico = document.createElement("span");
  ico.className = "ico";
  if (site.favicon) {
    const img = document.createElement("img");
    img.src = site.favicon;
    img.alt = "";
    img.onerror = () => { img.remove(); ico.textContent = (host[0] || "\u00b7").toLowerCase(); };
    ico.append(img);
    ico.classList.add("has-icon");
  } else {
    ico.textContent = (host[0] || "\u00b7").toLowerCase();
  }
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = site.title || host;
  a.append(ico, name);
  li.append(a);
  return li;
}

WrenSettings.get().then(settings => {
  if (settings.topSites === false) {
    document.getElementById("tiles").hidden = true;
    return;
  }
  return browser.topSites.get({ limit: 8, includeFavicon: true }).then(sites => {
    document.getElementById("tiles").append(...sites.map(tile));
  });
}).catch(() => {});

browser.wren.getState().then(({ nook }) => {
  const tools = document.getElementById("tools");
  for (const [label, path] of [["weather", "/weather"], ["maps", "/maps"], ["convert", "/convert"], ["books", "/books"]]) {
    const a = document.createElement("a");
    a.href = nook + path;
    a.textContent = label;
    tools.append(a);
  }
});

// --- the bird: wears the season, naps when you are away, and the optional cards -----------------------
(async () => {
  const settings = await WrenSettings.get();
  const bird = document.querySelector("#page .flame");

  if (settings.seasonal) {
    const month = new Date().getMonth();
    const season = month == 11 || month < 2 ? "winter" : month < 5 ? "spring" : month < 8 ? "summer" : "autumn";
    bird.querySelector(".season." + season).hidden = false;
  }

  if (settings.pet) {
    let timer;
    const sleep = on => {
      bird.querySelector(".eye").hidden = on;
      bird.querySelector(".eye-shut").hidden = !on;
      bird.querySelector(".zzz").hidden = !on;
    };
    const wake = () => {
      sleep(false);
      clearTimeout(timer);
      timer = setTimeout(() => sleep(true), 45000);
    };
    ["mousemove", "keydown", "click"].forEach(type => document.addEventListener(type, wake));
    wake();
  }

  if (settings.widgets) {
    document.getElementById("cards").hidden = false;
    const { scratch = "", collections = {} } = await browser.storage.local.get(["scratch", "collections"]);
    document.getElementById("noteOfDay").textContent = scratch.trim().split("\n")[0].slice(0, 120) || "nothing written yet. the sidebar has a scratchpad.";
    const list = document.getElementById("readNext");
    for (const item of (collections.inbox || []).slice(0, 3)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.textContent = item.title || item.url;
      li.append(a);
      list.append(li);
    }
    if (!list.children.length) {
      list.textContent = "nothing saved. right-click a page.";
    }
    const { nook } = await browser.wren.getState();
    document.getElementById("weatherLink").href = nook + "/weather";
  }
})();
