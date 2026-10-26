/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Runs as a page starts to load, for the two things that have to happen before it shows:
// a site's own dark mode (so there is no white flash), and gathering notifications into the digest.

(async () => {
  const { settings = {} } = await browser.storage.local.get("settings");
  const host = location.hostname.replace(/^www\./, "");
  const site = (settings.siteSettings || {})[host] || {};

  // --- per-site dark mode: invert the page, and turn pictures and video back ---------------------
  if (site.dark) {
    const style = document.createElement("style");
    style.id = "wren-dark";
    style.textContent =
      "html{filter:invert(1) hue-rotate(180deg) !important;background:#fff}" +
      "img,video,picture,canvas,svg image,[style*='background-image']{filter:invert(1) hue-rotate(180deg) !important}";
    (document.head || document.documentElement).append(style);
  }

  // --- comfort: typeface, size, spacing, calm motion, contrast (chosen on the comfort page) ---
  const a = settings.access || {};
  if (a.font || a.size > 100 || a.spacing || a.calm || a.contrast) {
    const css = [];
    const text = ":where(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,label,article,section,main,div,span,a)";
    if (a.font) {
      css.push(`${text}:not([class*=icon]):not([class*=fa-]):not([class*=material]):not(code):not(pre){font-family:${a.font} !important}`);
    }
    if (a.size > 100) {
      css.push(`html{font-size:${a.size}% !important}`);
    }
    if (a.spacing) {
      css.push(`${text}{letter-spacing:${(a.spacing / 100).toFixed(2)}em !important;word-spacing:${(a.spacing / 50).toFixed(2)}em !important;line-height:1.65 !important}`);
    }
    if (a.calm) {
      css.push("*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important}");
    }
    if (a.contrast) {
      css.push("html{filter:contrast(1.22)}");
    }
    const style = document.createElement("style");
    style.id = "wren-comfort";
    style.textContent = css.join("\n");
    (document.head || document.documentElement).append(style);
  }

  // --- notification digest: pages that ask to show a notification have it collected instead -------
  if (settings.digest && window.wrappedJSObject?.Notification) {
    const real = window.wrappedJSObject.Notification;
    const fake = exportFunction(function (title, options) {
      browser.runtime.sendMessage({
        type: "digestNote",
        title: String(title).slice(0, 200),
        body: String((options && options.body) || "").slice(0, 400),
        host,
      });
      return cloneInto({ close() {} }, window, { cloneFunctions: true });
    }, window);
    Object.defineProperty(fake, "permission", { get: exportFunction(() => real.permission, window) });
    fake.requestPermission = exportFunction((...args) => real.requestPermission(...args), window);
    window.wrappedJSObject.Notification = fake;
  }
})();
