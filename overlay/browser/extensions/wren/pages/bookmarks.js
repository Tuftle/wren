/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let deadList = [];
let extras = [];

function flatten(node, out = []) {
  if (node.url && /^https?:/.test(node.url)) {
    out.push(node);
  }
  (node.children || []).forEach(c => flatten(c, out));
  return out;
}

async function alive(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    let response = await fetch(url, { method: "HEAD", credentials: "omit", signal: controller.signal, redirect: "follow" });
    if (response.status == 405 || response.status == 403) {
      response = await fetch(url, { method: "GET", credentials: "omit", signal: controller.signal });
    }
    return response.status < 400 || response.status == 401 || response.status == 403 || response.status == 429;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function show(list, root, box) {
  root.textContent = "";
  box.hidden = !list.length;
  for (const b of list) {
    root.append(wrenEl("li", {},
      wrenEl("a", { href: b.url, text: b.title || b.url, title: b.url, onclick: e => { e.preventDefault(); browser.tabs.create({ url: b.url }); } }),
      wrenEl("button", { class: "x", text: "remove", onclick: async () => { await browser.bookmarks.remove(b.id); list.splice(list.indexOf(b), 1); show(list, root, box); } })));
  }
}

document.getElementById("start").addEventListener("click", async () => {
  const progress = document.getElementById("progress");
  const [tree] = await browser.bookmarks.getTree();
  const all = flatten(tree);

  // the same address twice
  const seen = new Map();
  extras = [];
  for (const b of all) {
    const key = wrenKey(b.url).replace(/\/$/, "");
    if (seen.has(key)) {
      extras.push(b);
    } else {
      seen.set(key, b);
    }
  }
  show(extras, document.getElementById("dups"), document.getElementById("dupBox"));

  // the ones that do not open, five at a time
  deadList = [];
  let done = 0;
  const queue = [...seen.values()];
  const worker = async () => {
    while (queue.length) {
      const b = queue.pop();
      if (!(await alive(b.url))) {
        deadList.push(b);
        show(deadList, document.getElementById("dead"), document.getElementById("deadBox"));
      }
      progress.textContent = `checked ${++done} of ${seen.size}`;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  progress.textContent = `done: ${deadList.length} that do not open, ${extras.length} saved twice.`;
});

document.getElementById("removeDead").addEventListener("click", async () => {
  for (const b of deadList.splice(0)) {
    await browser.bookmarks.remove(b.id).catch(() => {});
  }
  show(deadList, document.getElementById("dead"), document.getElementById("deadBox"));
});
document.getElementById("removeDup").addEventListener("click", async () => {
  for (const b of extras.splice(0)) {
    await browser.bookmarks.remove(b.id).catch(() => {});
  }
  show(extras, document.getElementById("dups"), document.getElementById("dupBox"));
});
