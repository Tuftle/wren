/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wren mods: a small file of CSS (and a few settings) that changes how the browser window looks.
// Anyone can write one; the person always sees what a mod does before adding it.
//
//   { "format": 1, "id": "my-mod", "name": "my mod", "version": "1.0.0", "author": "me",
//     "description": "what it does", "css": "#nav-bar { ... }", "prefs": { "browser.uidensity": 1 } }

const WrenMods = (() => {
  const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
  const SITES = /^https:\/\/(tuftle\.vercel\.app|[a-z0-9-]+\.tuftle\.vercel\.app)\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

  function clean(raw) {
    if (!raw || typeof raw != "object" || raw.format !== 1) {
      throw new Error("this is not a wren mod (format 1)");
    }
    if (!ID.test(raw.id || "")) {
      throw new Error("the id must be lowercase letters, numbers and dashes");
    }
    const text = (v, max) => String(v ?? "").slice(0, max);
    const css = text(raw.css, 200000);
    // style for web pages: where it applies (http and https addresses only, always naming a site), and the style
    const sites = [];
    for (const site of Array.isArray(raw.sites) ? raw.sites.slice(0, 10) : []) {
      const matches = (Array.isArray(site.matches) ? site.matches : []).slice(0, 10).map(m => String(m))
        .filter(m => /^(\*|https?):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/.*$/i.test(m));
      const siteCss = text(site.css, 100000).replace(/@import[^;]*;?/gi, "");
      if (matches.length && siteCss.trim()) {
        sites.push({ matches, css: siteCss });
      }
    }
    if (!css.trim() && !sites.length && !Object.keys(raw.prefs || {}).length) {
      throw new Error("this mod has no css and no settings");
    }
    const prefs = {};
    for (const [name, value] of Object.entries(raw.prefs || {})) {
      if (["boolean", "number", "string"].includes(typeof value)) {
        prefs[name] = value;
      }
    }
    return {
      id: raw.id,
      name: text(raw.name || raw.id, 60),
      version: text(raw.version || "1.0.0", 20),
      author: text(raw.author || "unknown", 60),
      description: text(raw.description, 300),
      css,
      sites,
      prefs,
    };
  }

  async function all() {
    const { mods = {} } = await browser.storage.local.get("mods");
    return mods;
  }

  // style for web pages is added to the pages with content scripts, and taken off again when the mod goes
  const registered = new Map();   // id -> { sig, handles }

  async function applySites(active) {
    const wanted = new Map(active.filter(m => m.sites && m.sites.length).map(m => [m.id, m]));
    for (const [id, entry] of registered) {
      if (!wanted.has(id) || JSON.stringify(wanted.get(id).sites) !== entry.sig) {
        entry.handles.forEach(h => h.unregister().catch(() => {}));
        registered.delete(id);
      }
    }
    for (const [id, mod] of wanted) {
      if (registered.has(id)) {
        continue;
      }
      try {
        const handles = await Promise.all(mod.sites.map(site => browser.contentScripts.register({
          matches: site.matches, css: [{ code: site.css }], runAt: "document_start", allFrames: false,
        })));
        registered.set(id, { sig: JSON.stringify(mod.sites), handles });
      } catch (e) {
        // a pattern the browser does not accept: that mod's pages stay as they were
      }
    }
  }

  async function apply() {
    const mods = await all();
    const active = Object.values(mods).filter(m => m.enabled);
    await applySites(active);
    try {
      const result = await browser.wren.setMods(active.map(({ id, css, prefs }) => ({ id, css, prefs })));
      return result;
    } catch (e) {
      return { applied: [], refused: [String(e)] };
    }
  }

  async function list() {
    const mods = await all();
    return Object.values(mods).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function install(raw) {
    const mod = clean(raw);
    const mods = await all();
    mods[mod.id] = { ...mod, enabled: true, added: Date.now() };
    await browser.storage.local.set({ mods });
    const result = await apply();
    await tellSites();
    return { mod: mods[mod.id], refused: result.refused || [] };
  }

  async function remove(id) {
    const mods = await all();
    delete mods[id];
    await browser.storage.local.set({ mods });
    await apply();
    await tellSites();
    return true;
  }

  async function toggle(id, enabled) {
    const mods = await all();
    if (mods[id]) {
      mods[id].enabled = !!enabled;
      await browser.storage.local.set({ mods });
      await apply();
    }
    return true;
  }

  async function stage(raw) {
    const mod = clean(raw);
    await browser.storage.local.set({ pendingMod: mod });
    await browser.tabs.create({ url: browser.runtime.getURL("pages/mods.html#add") });
    return true;
  }

  async function tellSites() {
    const installed = Object.keys(await all());
    for (const tab of await browser.tabs.query({ url: ["https://*.vercel.app/*", "http://localhost/*", "http://127.0.0.1/*"] })) {
      browser.tabs.sendMessage(tab.id, { type: "modsState", installed }).catch(() => {});
    }
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type != "mods") {
      return undefined;
    }
    switch (message.action) {
      case "list": return list();
      case "builtin": return Promise.resolve(WREN_BUILTIN_MODS);
      case "install": return install(message.mod);
      case "remove": return remove(message.id);
      case "toggle": return toggle(message.id, message.enabled);
      case "check": return Promise.resolve(clean(message.mod));
      case "fromSite":
        if (!sender.tab || !SITES.test(sender.url || "")) {
          return Promise.reject(new Error("not allowed"));
        }
        return stage(message.mod);
      case "state":
        return all().then(mods => ({ installed: Object.keys(mods) }));
      default: return undefined;
    }
  });

  // put the saved mods on every window when the browser starts
  apply();

  return { list, install, apply };
})();
