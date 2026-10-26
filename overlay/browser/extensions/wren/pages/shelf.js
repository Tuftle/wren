/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const hash = text => { let h = 0; for (const c of text) { h = (h * 31 + c.charCodeAt(0)) >>> 0; } return h; };

function collect(node, shelves, path = "") {
  const books = (node.children || []).filter(c => c.url && /^https?:/.test(c.url));
  const here = node.title ? (path ? path + " / " : "") + node.title : path;
  if (books.length) {
    shelves.push({ name: here || "bookmarks", books });
  }
  (node.children || []).filter(c => !c.url).forEach(c => collect(c, shelves, here));
}

(async () => {
  const [tree] = await browser.bookmarks.getTree();
  const shelves = [];
  collect(tree, shelves);
  const root = document.getElementById("shelves");
  if (!shelves.length) {
    root.append(wrenEl("p", { class: "soft", text: "no bookmarks yet. press the star on a page to put your first book on the shelf." }));
  }
  for (const shelf of shelves) {
    root.append(wrenEl("section", { class: "shelf" },
      wrenEl("h2", { text: shelf.name }),
      wrenEl("div", { class: "row" }, shelf.books.map(b => {
        const h = hash(wrenHost(b.url));
        const title = (b.title || wrenHost(b.url)).replace(/ — .*$/, "");
        const tall = 8.5 + (hash(b.url) % 40) / 10;
        return wrenEl("a", {
          class: "spine", href: b.url, title: b.title,
          style: `--c:hsl(${h % 360} ${18 + (h % 10)}% ${30 + (h % 12)}%);height:${tall}rem;min-width:${1.9 + (hash(b.url) % 8) / 10}rem`,
          onclick: e => { e.preventDefault(); browser.tabs.create({ url: b.url }); },
          text: title.slice(0, 40),
        });
      }))));
  }
})();
