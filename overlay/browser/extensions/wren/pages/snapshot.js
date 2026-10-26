/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// A page saved by wren, shown as plain readable text. The copy was built from a short list of safe tags.
(async () => {
  const url = new URLSearchParams(location.search).get("u");
  const { snapshots = {} } = await browser.storage.local.get("snapshots");
  const s = snapshots[url];
  if (!s) {
    document.getElementById("title").textContent = "no saved copy of this page";
    return;
  }
  document.title = s.title;
  document.getElementById("title").textContent = s.title;
  document.getElementById("orig").href = url;
  document.getElementById("when").textContent = "saved " + new Date(s.saved).toLocaleString();
  const doc = new DOMParser().parseFromString("<body>" + s.html + "</body>", "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, form").forEach(n => n.remove());
  doc.querySelectorAll("*").forEach(el => {
    for (const attr of [...el.attributes]) {
      if (!["href", "src", "alt"].includes(attr.name) || /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  document.getElementById("body").append(...doc.body.childNodes);
})();
