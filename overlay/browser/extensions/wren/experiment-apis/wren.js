/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, ExtensionCommon, Services, ChromeUtils, Cc, Ci, IOUtils */

// What the add-on is allowed to ask of the browser itself: the few things the web-extension
// APIs do not cover. Everything here stays on this computer.

const QUIET_PERMISSIONS = ["camera", "microphone", "geo", "desktop-notification"];
const REPORTED_PERMISSIONS = [
  "camera", "microphone", "geo", "desktop-notification", "screen", "persistent-storage", "midi",
  "storage-access", "xr", "autoplay-media",
];
const TRACKING_TYPES = { 1: "trackers", 2: "cookies", 3: "cryptominers", 4: "fingerprinters", 5: "social" };
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "111111", "123123", "letmein", "welcome",
  "iloveyou", "admin", "password1", "000000", "dragon", "monkey", "football", "123456789",
]);



// the browser window you are working in, not one of Wren's little popups
function mainWindow() {
  const recent = Services.wm.getMostRecentWindow("navigator:browser");
  try {
    if (recent && recent.toolbar && recent.toolbar.visible) {
      return recent;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.toolbar && win.toolbar.visible) {
        return win;
      }
    }
  } catch (e) {
    // fall through to the most recent window
  }
  return recent;
}

// --- the look of the window: a few CSS variables that Wren's own style sheet reads -------------------
const chromeVars = {};
let windowListenerAdded = false;

function applyVars(win) {
  const root = win.document?.documentElement;
  if (!root) {
    return;
  }
  for (const [name, value] of Object.entries(chromeVars)) {
    if (value === null || value === "") {
      root.style.removeProperty(name);
    } else {
      root.style.setProperty(name, value);
    }
  }
}

function watchWindows() {
  if (windowListenerAdded) {
    return;
  }
  windowListenerAdded = true;
  Services.wm.addListener({
    onOpenWindow(xulWindow) {
      const win = xulWindow.docShell.domWindow;
      win.addEventListener("load", () => {
        if (win.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
          applyVars(win);
          applyModsTo(win);
        }
      }, { once: true });
    },
    onCloseWindow() {},
  });
}

// --- answers in the address bar, from nook -------------------------------------------------------------
let answersRegistered = false;

function registerAnswers(base) {
  if (answersRegistered) {
    return { ok: true, already: true };
  }
  try {
    return registerAnswersNow(base);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function registerAnswersNow(base) {
  const { UrlbarProvider } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs");
  const { UrlbarResult } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarResult.mjs");
  const { UrlbarShared } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarShared.mjs");
  const { UrlbarPrefs } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs");
  const { ProvidersManager } = ChromeUtils.importESModule("moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs");

  class WrenAnswers extends UrlbarProvider {
    get name() {
      return "WrenAnswers";
    }

    get type() {
      return UrlbarShared.PROVIDER_TYPE.PROFILE;
    }

    async isActive(queryContext) {
      const q = (queryContext.trimmedSearchString || "").trim();
      return Boolean(
        q.length >= 3 &&
        /\s|^[a-z]+$/i.test(q) &&
        !/^[a-z]+:\/\//i.test(q) &&
        !queryContext.restrictInSearchMode?.() &&
        UrlbarPrefs.get("suggest.searches") &&
        (!queryContext.isPrivate || Services.prefs.getBoolPref("browser.search.suggest.enabled.private", false))
      );
    }

    async startQuery(queryContext, addCallback) {
      const query = queryContext.trimmedSearchString.trim();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(base + "/answer?q=" + encodeURIComponent(query), {
          credentials: "omit",
          signal: controller.signal,
        });
        clearTimeout(timer);
        const answer = await response.json();
        if (!answer || !answer.title) {
          return;
        }
        const result = new UrlbarResult({
          type: UrlbarShared.RESULT_TYPE.URL,
          source: UrlbarShared.RESULT_SOURCE.OTHER_NETWORK,
          suggestedIndex: 1,
          payload: {
            url: answer.url,
            title: answer.detail ? answer.title + "  \u00b7  " + answer.detail : answer.title,
          },
        });
        addCallback(this, result);
      } catch (e) {
        // no answer this time
      }
    }
  }
  ProvidersManager.getInstanceForSap("urlbar").registerProvider(new WrenAnswers());
  answersRegistered = true;
  return { ok: true, already: false };
}

// --- mods: style sheets for the browser window, and a few allowed settings, written by anyone ---------
// A mod is plain CSS (and a short list of settings) that the person chose to add. The CSS is cleaned
// first: no @import and no web addresses in url(), so a mod can restyle the window but not phone home.
const MOD_PREFS = /^(browser\.(uidensity|compactmode\.show|tabs\.(hoverPreview\.enabled|closeWindowWithLastTab)|toolbars\.bookmarks\.visibility|download\.autohideButton)|sidebar\.(verticalTabs|position_start|revamp)|wren\.mod\.[a-z0-9._-]+)$/;
const activeMods = new Map(); // id -> { uri, prefs: { name: previous value } }

function cleanModCss(css) {
  return String(css)
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?!data:|chrome:\/\/browser\/|chrome:\/\/global\/|#)[^)]*\)/gi, "none");
}

function modSheetType(win) {
  return win.windowUtils.AUTHOR_SHEET;
}

function addModSheet(win, uri) {
  try {
    win.windowUtils.loadSheetUsingURIString(uri, modSheetType(win));
  } catch (e) {
    // already loaded in this window
  }
}

function removeModSheet(win, uri) {
  try {
    win.windowUtils.removeSheetUsingURIString(uri, modSheetType(win));
  } catch (e) {
    // was not loaded
  }
}

function applyModsTo(win) {
  for (const { uri } of activeMods.values()) {
    addModSheet(win, uri);
  }
}

function setPref(name, value) {
  const prefs = Services.prefs;
  if (typeof value == "boolean") {
    prefs.setBoolPref(name, value);
  } else if (typeof value == "number") {
    prefs.setIntPref(name, Math.round(value));
  } else {
    prefs.setStringPref(name, String(value));
  }
}

function readPref(name) {
  const prefs = Services.prefs;
  switch (prefs.getPrefType(name)) {
    case prefs.PREF_BOOL: return prefs.getBoolPref(name);
    case prefs.PREF_INT: return prefs.getIntPref(name);
    case prefs.PREF_STRING: return prefs.getStringPref(name);
    default: return undefined;
  }
}

function setMods(mods) {
  const keep = new Set(mods.map(m => m.id));
  const refused = [];
  for (const [id, entry] of activeMods) {
    if (!keep.has(id)) {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        removeModSheet(win, entry.uri);
      }
      for (const [name, before] of Object.entries(entry.prefs)) {
        if (before === undefined) {
          Services.prefs.clearUserPref(name);
        } else {
          setPref(name, before);
        }
      }
      activeMods.delete(id);
    }
  }
  for (const mod of mods) {
    const uri = "data:text/css;charset=utf-8," + encodeURIComponent(cleanModCss(mod.css || ""));
    const existing = activeMods.get(mod.id);
    if (existing && existing.uri == uri) {
      continue;
    }
    if (existing) {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        removeModSheet(win, existing.uri);
      }
    }
    const prefs = existing ? existing.prefs : {};
    for (const [name, value] of Object.entries(mod.prefs || {})) {
      if (!MOD_PREFS.test(name) || !["boolean", "number", "string"].includes(typeof value)) {
        refused.push(mod.id + ": " + name);
        continue;
      }
      if (!(name in prefs)) {
        prefs[name] = readPref(name);
      }
      setPref(name, value);
    }
    activeMods.set(mod.id, { uri, prefs });
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      addModSheet(win, uri);
    }
  }
  watchWindows();
  return { applied: [...activeMods.keys()], refused };
}

// --- bringing things over from a Firefox profile on this computer -----------------------------------------------
// Firefox's own import window only offers other browsers, and "pave over" imports of another Firefox profile at
// startup. This reads the files of a profile that Wren is not using (from a copy of the database, so the
// original is never touched) and adds bookmarks, history and cookies to the profile Wren is using.
const FF_ROOTS = {
  menu________: "bookmarksMenuFolder", toolbar_____: "toolbarFolder", unfiled_____: "unfiledBookmarksFolder", mobile______: "mobileFolder",
};

function firefoxProfilesDir() {
  const appData = Services.dirsvc.get("AppData", Ci.nsIFile).path;
  return PathUtils.join(appData, "Mozilla", "Firefox");
}

function iniNames(text) {
  // profiles.ini: [ProfileN] Name=..., Path=...  ->  { "Profiles/abcd.default": "default" }
  const names = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      current = /^\[Profile\d+\]$/.test(line) ? {} : null;
    } else if (current && line.includes("=")) {
      const [k, ...v] = line.split("=");
      current[k] = v.join("=");
      if (current.Name && current.Path) {
        names[current.Path.replace(/\\/g, "/")] = current.Name;
      }
    }
  }
  return names;
}

async function withCopy(dir, files, work) {
  const tmp = PathUtils.join(PathUtils.tempDir, "wren-import-" + Math.random().toString(36).slice(2));
  await IOUtils.makeDirectory(tmp);
  try {
    for (const name of files) {
      const from = PathUtils.join(dir, name);
      if (await IOUtils.exists(from)) {
        await IOUtils.copy(from, PathUtils.join(tmp, name));
      }
    }
    return await work(tmp);
  } finally {
    await IOUtils.remove(tmp, { recursive: true, ignoreAbsent: true });
  }
}

async function readRows(file, sql) {
  const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
  const conn = await Sqlite.openConnection({ path: file, readOnly: true });
  try {
    return await conn.execute(sql);
  } finally {
    await conn.close();
  }
}

async function importFirefoxBookmarks(dir) {
  return withCopy(dir, ["places.sqlite", "places.sqlite-wal"], async tmp => {
    const rows = await readRows(PathUtils.join(tmp, "places.sqlite"),
      "SELECT b.id, b.type, b.parent, b.position, b.title, b.guid, b.dateAdded, b.lastModified, p.url " +
      "FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position");
    const nodes = new Map();
    const byGuid = new Map();
    let count = 0;
    for (const r of rows) {
      const id = r.getResultByName("id"), type = r.getResultByName("type"), guid = r.getResultByName("guid");
      const url = r.getResultByName("url");
      const node = {
        parent: r.getResultByName("parent"), title: r.getResultByName("title") || "",
        dateAdded: r.getResultByName("dateAdded"), lastModified: r.getResultByName("lastModified"), kids: [],
      };
      if (type === 1) {
        if (!url || !/^(https?|ftp|file|about):/i.test(url)) {
          continue;
        }
        Object.assign(node, { typeCode: 1, type: "text/x-moz-place", uri: url });
      } else if (type === 2) {
        Object.assign(node, { typeCode: 2, type: "text/x-moz-place-container" });
      } else {
        Object.assign(node, { typeCode: 3, type: "text/x-moz-place-separator" });
      }
      nodes.set(id, node);
      byGuid.set(guid, node);
    }
    for (const node of nodes.values()) {
      const parent = nodes.get(node.parent);
      if (parent && parent.typeCode === 2) {
        parent.kids.push(node);
        if (node.typeCode === 1) {
          count++;
        }
      }
    }
    const clean = (node, index) => {
      const out = { index, title: node.title, dateAdded: node.dateAdded, lastModified: node.lastModified, typeCode: node.typeCode, type: node.type };
      if (node.uri) {
        out.uri = node.uri;
      }
      if (node.typeCode === 2) {
        out.children = node.kids.map(clean);
      }
      return out;
    };
    const children = [];
    for (const [guid, rootName] of Object.entries(FF_ROOTS)) {
      const folder = byGuid.get(guid);
      if (folder && folder.kids.length) {
        children.push({ ...clean(folder, children.length), guid, root: rootName });
      }
    }
    if (!children.length) {
      return 0;
    }
    const file = PathUtils.join(tmp, "bookmarks.json");
    await IOUtils.writeJSON(file, { guid: "root________", title: "", index: 0, root: "placesRoot", typeCode: 2, type: "text/x-moz-place-container", children });
    const { BookmarkJSONUtils } = ChromeUtils.importESModule("resource://gre/modules/BookmarkJSONUtils.sys.mjs");
    await BookmarkJSONUtils.importFromFile(file, { replace: false });
    return count;
  });
}

async function importFirefoxHistory(dir) {
  return withCopy(dir, ["places.sqlite", "places.sqlite-wal"], async tmp => {
    const rows = await readRows(PathUtils.join(tmp, "places.sqlite"),
      "SELECT p.url, p.title, v.visit_date, v.visit_type FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id " +
      "WHERE p.hidden = 0 AND substr(p.url, 1, 4) = 'http' ORDER BY v.visit_date DESC LIMIT 40000");
    const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
    const pages = new Map();
    for (const r of rows) {
      const url = r.getResultByName("url");
      let page = pages.get(url);
      if (!page) {
        page = { url, title: r.getResultByName("title") || undefined, visits: [] };
        pages.set(url, page);
      }
      page.visits.push({ date: new Date(r.getResultByName("visit_date") / 1000), transition: r.getResultByName("visit_type") || 1 });
    }
    const all = [...pages.values()];
    for (let i = 0; i < all.length; i += 400) {
      try {
        await PlacesUtils.history.insertMany(all.slice(i, i + 400));
      } catch (e) {
        // a page with an address Wren does not accept is skipped
      }
    }
    return all.length;
  });
}

async function importFirefoxCookies(dir) {
  return withCopy(dir, ["cookies.sqlite", "cookies.sqlite-wal"], async tmp => {
    const rows = await readRows(PathUtils.join(tmp, "cookies.sqlite"),
      "SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE originAttributes = '' LIMIT 40000");
    let count = 0;
    const now = Date.now();
    for (const r of rows) {
      let expiry = r.getResultByName("expiry");
      if (expiry < 1e11) {
        expiry *= 1000;                      // older profiles keep seconds; adding a cookie takes milliseconds
      }
      if (expiry < now) {
        continue;
      }
      try {
        Services.cookies.add(r.getResultByName("host"), r.getResultByName("path"), r.getResultByName("name"), r.getResultByName("value"),
          !!r.getResultByName("isSecure"), !!r.getResultByName("isHttpOnly"), false, Math.floor(expiry), {}, r.getResultByName("sameSite"),
          Ci.nsICookie.SCHEME_HTTPS);
        count++;
      } catch (e) {
        // a cookie Wren will not take
      }
    }
    return count;
  });
}

const searchService = () =>
  ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;

this.wren = class extends ExtensionAPI {
  getAPI(context) {
    const { EventManager } = ExtensionCommon;
    const shell = () =>
      ChromeUtils.importESModule("moz-src:///browser/components/shell/ShellService.sys.mjs").ShellService;
    const windows = () => Services.wm.getEnumerator("navigator:browser");

    const installExtensionNow = async (url, silent) => {
          if (!/^https:\/\/addons\.mozilla\.org\//.test(url)) {
            throw new Error("only addons.mozilla.org");
          }
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const win = mainWindow();
          const install = await AddonManager.getInstallForURL(url, { telemetryInfo: { source: "wren-shelf" } });
          // Firefox's own prompt asks for permission, in the browser window, before anything is installed.
          // The answer waits until the add-on is really in (or the person said no, or it failed), so that a
          // list of add-ons goes through one at a time: Firefox shows one prompt at a time and drops the rest.
          const { setTimeout: later, clearTimeout: cancel } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
          return new Promise(resolve => {
            let timer;
            const finish = result => {
              cancel(timer);
              install.removeListener(listener);
              resolve({ name: install.name || "", ...result });
            };
            const listener = {
              onInstallEnded: () => finish({ installed: true }),
              onInstallCancelled: () => finish({ installed: false, why: "not added" }),
              onInstallFailed: () => finish({ installed: false, why: "the install failed" }),
              onDownloadCancelled: () => finish({ installed: false, why: "not added" }),
              onDownloadFailed: () => finish({ installed: false, why: "the download failed" }),
            };
            install.addListener(listener);
            timer = later(() => finish({ installed: false, why: "no answer" }), 120000);
            try {
              if (silent) {
                // the person chose exactly these add-ons on the import page, so no second prompt for each one
                install.install();
                return;
              }
              AddonManager.installAddonFromWebpage(
                "application/x-xpinstall",
                win.gBrowser.selectedBrowser,
                Services.scriptSecurityManager.getSystemPrincipal(),
                install
              );
            } catch (e) {
              finish({ installed: false, why: String(e) });
            }
          });
        };

    return {
      wren: {
        onImportDone: new EventManager({
          context,
          name: "wren.onImportDone",
          register: fire => {
            const observer = { observe: () => fire.async() };
            Services.obs.addObserver(observer, "Migration:Ended");
            return () => Services.obs.removeObserver(observer, "Migration:Ended");
          },
        }).api(),

        async getState() {
          let isDefault = false;
          try {
            isDefault = shell().isDefaultBrowser();
          } catch (e) {
            // not every platform can tell
          }
          return {
            isDefault,
            nook: Services.prefs
              .getStringPref("wren.search.baseUrl", "https://nooksearch.vercel.app")
              .replace(/\/+$/, ""),
            privacy: Services.prefs.getStringPref("browser.contentblocking.category", "standard"),
          };
        },

        async makeDefaultBrowser() {
          await shell().setAsDefault();
        },

        async openImport() {
          const { MigrationUtils } = ChromeUtils.importESModule("resource:///modules/MigrationUtils.sys.mjs");
          let win = Services.wm.getMostRecentWindow("navigator:browser");
          // opens in a window of its own (see browser.migrate.content-modal.about-welcome-behavior),
          // so the welcome stays where it is
          MigrationUtils.showMigrationWizard(win, {
            entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.NEWTAB,
          });
        },

        async setPrivacy(level) {
          Services.prefs.setStringPref("browser.contentblocking.category", level);
        },

        // --- what was blocked ---------------------------------------------------------------------
        async getPrivacyStats(days) {
          const db = Cc["@mozilla.org/tracking-db-service;1"].getService(Ci.nsITrackingDBService);
          const to = Date.now();
          const from = to - days * 86400000;
          const rows = await db.getEventsByDateRange(from, to);
          const byType = { trackers: 0, cookies: 0, cryptominers: 0, fingerprinters: 0, social: 0 };
          const perDay = {};
          let total = 0;
          for (const row of rows) {
            const count = row.getResultByName("count");
            const type = TRACKING_TYPES[row.getResultByName("type")] || "trackers";
            const day = String(row.getResultByName("timestamp")).slice(0, 10);
            byType[type] += count;
            perDay[day] = (perDay[day] || 0) + count;
            total += count;
          }
          return { total, byType, perDay };
        },

        // --- permissions --------------------------------------------------------------------------
        async listPermissions() {
          const out = [];
          for (const perm of Services.perms.all) {
            if (perm.capability != Services.perms.ALLOW_ACTION) {
              continue;
            }
            if (!REPORTED_PERMISSIONS.some(t => perm.type == t || perm.type.startsWith(t + "^"))) {
              continue;
            }
            out.push({ origin: perm.principal.origin, type: perm.type });
          }
          return out;
        },

        async revokePermission(origin, type) {
          const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
          Services.perms.removeFromPrincipal(principal, type);
        },

        async revokeAllPermissions() {
          let n = 0;
          for (const perm of [...Services.perms.all]) {
            if (perm.capability == Services.perms.ALLOW_ACTION &&
                REPORTED_PERMISSIONS.some(t => perm.type == t || perm.type.startsWith(t + "^"))) {
              Services.perms.removeFromPrincipal(perm.principal, perm.type);
              n++;
            }
          }
          return n;
        },

        // quiet mode: no camera, microphone, location or notification questions at all
        async setQuietMode(on) {
          const saved = "wren.quiet.saved";
          if (on && !Services.prefs.prefHasUserValue(saved)) {
            const before = {};
            for (const t of QUIET_PERMISSIONS) {
              before[t] = Services.prefs.getIntPref("permissions.default." + t, 0);
            }
            Services.prefs.setStringPref(saved, JSON.stringify(before));
          }
          if (on) {
            for (const t of QUIET_PERMISSIONS) {
              Services.prefs.setIntPref("permissions.default." + t, 2);
            }
          } else if (Services.prefs.prefHasUserValue(saved)) {
            const before = JSON.parse(Services.prefs.getStringPref(saved));
            for (const t of QUIET_PERMISSIONS) {
              Services.prefs.setIntPref("permissions.default." + t, before[t] ?? 0);
            }
            Services.prefs.clearUserPref(saved);
          }
        },

        async getQuietMode() {
          return Services.prefs.prefHasUserValue("wren.quiet.saved");
        },

        // --- saved passwords: only looked at here, never sent anywhere -----------------------------
        async analyzePasswords() {
          const logins = await Services.logins.getAllLogins();
          const groups = new Map();
          const weak = [];
          for (const login of logins) {
            const list = groups.get(login.password) || [];
            list.push(login.origin);
            groups.set(login.password, list);
            if (login.password.length < 8 || COMMON_PASSWORDS.has(login.password.toLowerCase())) {
              weak.push(login.origin);
            }
          }
          const reused = [...groups.values()].filter(sites => new Set(sites).size > 1).map(sites => [...new Set(sites)]);
          return { total: logins.length, reused, weak: [...new Set(weak)] };
        },

        // --- the panic button: forget everything and quit -----------------------------------------
        async panic() {
          const { Sanitizer } = ChromeUtils.importESModule("resource:///modules/Sanitizer.sys.mjs");
          try {
            await Sanitizer.sanitize(
              ["cache", "cookies", "history", "formdata", "downloads", "sessions", "siteSettings", "offlineApps"],
              { ignoreTimespan: true }
            );
          } finally {
            Services.startup.quit(Services.startup.eForceQuit);
          }
        },

        // --- focus: hide the bars (wren.css does the hiding) --------------------------------------
        async setFocus(on) {
          for (const win of windows()) {
            win.document.documentElement.toggleAttribute("wren-focus", on);
          }
        },

        // --- what is using memory -------------------------------------------------------------------
        async getProcesses() {
          const main = await ChromeUtils.requestProcInfo();
          const all = [main, ...main.children];
          return all.map(p => ({
            pid: p.pid,
            type: p.type,
            memory: p.memory,
            titles: (p.windows || []).map(w => w.documentTitle).filter(Boolean),
            uris: (p.windows || []).map(w => (w.documentURI ? w.documentURI.spec : "")).filter(Boolean),
          }));
        },


        // --- the window's look ------------------------------------------------------------------
        async setChromeVars(vars) {
          Object.assign(chromeVars, vars);
          watchWindows();
          for (const win of windows()) {
            applyVars(win);
          }
        },

        // --- an older profile opened in Wren: the Wren theme is switched on once -----------------------
        // (the layout choices are reset earlier, in BrowserGlue, before a window exists)
        async adoptProfile() {
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const theme = await AddonManager.getAddonByID("wren-theme@wren.local");
          if (theme && !theme.isActive && !Services.prefs.getBoolPref("wren.theme.checked", false)) {
            Services.prefs.setBoolPref("wren.theme.checked", true);
            await theme.enable();
            return { changed: ["theme"] };
          }
          return { changed: [] };
        },

        // --- Firefox profiles on this computer ------------------------------------------------------
        async listFirefoxProfiles() {
          const root = firefoxProfilesDir();
          const here = PathUtils.normalize(Services.dirsvc.get("ProfD", Ci.nsIFile).path).toLowerCase();
          let names = {};
          try {
            names = iniNames(await IOUtils.readUTF8(PathUtils.join(root, "profiles.ini")));
          } catch (e) {
            // no profiles.ini: the folder names are used
          }
          const out = [];
          const folder = PathUtils.join(root, "Profiles");
          if (!(await IOUtils.exists(folder))) {
            return out;
          }
          for (const dir of await IOUtils.getChildren(folder)) {
            if (PathUtils.normalize(dir).toLowerCase() === here || !(await IOUtils.exists(PathUtils.join(dir, "places.sqlite")))) {
              continue;
            }
            const leaf = PathUtils.filename(dir);
            let used = 0;
            try {
              used = (await IOUtils.stat(PathUtils.join(dir, "prefs.js"))).lastModified;
            } catch (e) {
              // never used
            }
            out.push({ path: dir, name: names["Profiles/" + leaf] || leaf.replace(/^[^.]*\./, "") || leaf, lastUsed: used });
          }
          return out.sort((a, b) => b.lastUsed - a.lastUsed);
        },

        async listFirefoxExtensions(path) {
          try {
            const data = await IOUtils.readJSON(PathUtils.join(path, "extensions.json"));
            return (data.addons || []).filter(a => a.type === "extension" && a.location === "app-profile" && a.active && !a.hidden)
              .map(a => ({ id: a.id, name: (a.defaultLocale && a.defaultLocale.name) || a.id }));
          } catch (e) {
            return [];
          }
        },

        async importFromFirefox(path, what) {
          const done = {};
          for (const [key, fn] of [["bookmarks", importFirefoxBookmarks], ["history", importFirefoxHistory], ["cookies", importFirefoxCookies]]) {
            if (what[key]) {
              try {
                done[key] = await fn(path);
              } catch (e) {
                done[key] = -1;
                done.errors = (done.errors || "") + key + ": " + e + " ";
              }
            }
          }
          return done;
        },

        // --- mods ---------------------------------------------------------------------------------
        async setMods(mods) {
          return setMods(mods);
        },

        // --- answers in the address bar -------------------------------------------------------------
        async enableAnswers() {
          const base = Services.prefs.getStringPref("wren.search.baseUrl", "https://nooksearch.vercel.app").replace(/\/+$/, "");
          return registerAnswers(base);
        },

        // --- about: pages the web-extension APIs may not open ---------------------------------------
        async openAbout(page) {
          const allowed = ["config", "debugging", "processes", "memory", "networking", "support", "profiles", "serviceworkers", "telemetry", "webrtc", "url-classifier", "cache", "certificate"];
          if (!allowed.includes(page)) {
            throw new Error("not available: " + page);
          }
          const win = mainWindow();
          win.openTrustedLinkIn("about:" + page, "tab");
        },

        // --- installing an add-on from a web address (the extension shelf) ----------------------------
        async installExtension(url, options) {
          try {
            return await installExtensionNow(url, !!(options && options.silent));
          } catch (e) {
            return { installed: false, why: String(e && e.message || e) };
          }
        },

        async listExtensions() {
          const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
          const addons = await AddonManager.getAddonsByTypes(["extension"]);
          return addons.filter(a => !a.isSystem && !a.isBuiltin && a.visible).map(a => ({ id: a.id, name: a.name, active: a.isActive }));
        },

        // --- the pages you came from in this tab -----------------------------------------------------
        async getBackList() {
          const win = mainWindow();
          const history = win.gBrowser.selectedBrowser.browsingContext.sessionHistory;
          const out = [];
          for (let i = history.count - 1; i >= 0; i--) {
            const entry = history.getEntryAtIndex(i);
            out.push({ index: i, current: i == history.index, title: entry.title, url: entry.URI.spec });
          }
          return out;
        },

        async gotoHistory(index) {
          const win = mainWindow();
          win.gBrowser.selectedBrowser.gotoIndex(index);
        },

        // --- translate this page (Firefox translates on this computer) ---------------------------------
        async openTranslations() {
          const win = mainWindow();
          if (!win.FullPageTranslationsPanel) {
            return false;
          }
          win.FullPageTranslationsPanel.open(new win.MouseEvent("click", { button: 0 }));
          return true;
        },


        // --- calm motion for the whole browser, and for pages that respect it ----------------------------
        async setCalmMotion(on) {
          Services.prefs.setIntPref("ui.prefersReducedMotion", on ? 1 : 0);
          if (!on) {
            Services.prefs.clearUserPref("ui.prefersReducedMotion");
          }
        },


        // --- the search engines, with their icons, for the first-run chooser ----------------------------
        async listEngines() {
          const toData = async url => {
            if (!url) {
              return "";
            }
            if (url.startsWith("data:")) {
              return url;
            }
            const response = await fetch(url);
            const blob = await response.blob();
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let text = "";
            for (let i = 0; i < bytes.length; i += 8192) {
              text += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            return "data:" + (blob.type || "image/png") + ";base64," + btoa(text);
          };
          await searchService().init();
          const current = await searchService().getDefault();
          const out = [];
          for (const engine of await searchService().getVisibleEngines()) {
            if (!engine.isGeneralPurposeEngine) {
              continue;
            }
            let icon = "";
            try {
              icon = await toData(await engine.getIconURL(64));
            } catch (e) {
              // no icon: the chooser draws a letter
            }
            out.push({ id: engine.id || engine.telemetryId, name: engine.name, icon, isDefault: engine == current });
          }
          return out;
        },

        // --- updates: this wren's build, where to ask, and the swap to a newer one ------------------------------
        async updateInfo() {
          return {
            buildID: Services.appinfo.appBuildID,
            version: Services.appinfo.version,
            url: Services.prefs.getStringPref("wren.update.url", "https://tuftle.vercel.app/wren/latest.json"),
          };
        },

        // Downloads the new setup, checks it is the file that was announced, starts it and closes wren. The setup waits for
        // wren to be gone, puts the new files over the old ones, and opens wren again. Profiles are not touched.
        async installUpdate(url, sha256) {
          const allowed = /^https:\/\/(tuftle\.vercel\.app|github\.com\/Tuftle|objects\.githubusercontent\.com)\//.test(url) ||
            /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url);
          if (!allowed || !/^[0-9a-f]{64}$/.test(sha256)) {
            throw new Error("this update is not from a place wren trusts");
          }
          const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
          const dir = PathUtils.join(PathUtils.tempDir, "wren-update");
          await IOUtils.makeDirectory(dir, { ignoreExisting: true });
          const path = PathUtils.join(dir, "Wren-Setup.exe");
          await IOUtils.remove(path, { ignoreAbsent: true });
          await Downloads.fetch(url, path);
          if ((await IOUtils.computeHexDigest(path, "sha256")) !== sha256) {
            await IOUtils.remove(path, { ignoreAbsent: true });
            throw new Error("the download is not the file that was announced");
          }
          const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          file.initWithPath(path);
          const process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
          process.init(file);
          process.run(false, ["--install", "--update"], 2);
          Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
        },

        async setDefaultEngine(id) {
          await searchService().init();
          const engine = searchService().getEngineById(id) || (await searchService().getEngineByName(id));
          if (!engine) {
            throw new Error("no such engine");
          }
          const reason = searchService().CHANGE_REASON.USER;
          await searchService().setDefault(engine, reason);
          try {
            await searchService().setDefaultPrivate(engine, reason);
          } catch (e) {
            // private windows keep their own choice
          }
        },

        // --- ask Windows Security to scan a downloaded file ----------------------------------------
        async scanFile(path) {
          const defender = Services.dirsvc.get("ProgF", Ci.nsIFile);
          defender.append("Windows Defender");
          defender.append("MpCmdRun.exe");
          if (!defender.exists() || !(await IOUtils.exists(path))) {
            return { ok: false, reason: "scanner or file not found" };
          }
          const proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
          proc.init(defender);
          return new Promise(resolve => {
            proc.runAsync(["-Scan", "-ScanType", "3", "-File", path, "-DisableRemediation"], 6, {
              observe(subject, topic) {
                resolve({ ok: true, clean: proc.exitValue == 0, code: proc.exitValue, topic });
              },
            });
          });
        },
      },
    };
  }
};
