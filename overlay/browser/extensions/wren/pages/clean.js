/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

(async () => {
  const { cleanDoc } = await browser.storage.local.get("cleanDoc");
  if (!cleanDoc) {
    document.getElementById("title").textContent = "nothing to show";
    return;
  }
  document.title = cleanDoc.title;
  document.getElementById("title").textContent = cleanDoc.title;
  document.getElementById("src").textContent = cleanDoc.url;
  const doc = new DOMParser().parseFromString("<body>" + cleanDoc.html + "</body>", "text/html");
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

document.getElementById("print").addEventListener("click", () => window.print());
document.getElementById("pdf").addEventListener("click", async () => {
  try {
    await browser.tabs.saveAsPDF({ toFileName: (document.title || "page").replace(/[^\w\- ]+/g, "").slice(0, 60) + ".pdf", footerLeft: "", footerRight: "", headerLeft: "", headerRight: "" });
  } catch (e) {
    window.print();
  }
});
