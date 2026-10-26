/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Your open tabs as papers on a desk: drag them where you like. Where you put them is remembered.

const desk = document.getElementById("desk");
const hue = host => { let h = 0; for (const c of host) { h = (h * 31 + c.charCodeAt(0)) % 360; } return h; };
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago";
};

let positions = {};
let tabs = [];

function place(i) {
  const per = Math.max(1, Math.floor((desk.clientWidth - 20) / 200));
  return { x: 14 + (i % per) * 200, y: 14 + Math.floor(i / per) * 132 };
}

async function draw() {
  const q = document.getElementById("find").value.trim().toLowerCase();
  desk.textContent = "";
  const active = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  let shown = 0;
  tabs.forEach((t, i) => {
    if (q && !((t.title || "") + " " + t.url).toLowerCase().includes(q)) {
      return;
    }
    shown++;
    const key = wrenKey(t.url);
    const pos = positions[key] || place(i);
    const host = wrenHost(t.url) || "wren";
    const paper = wrenEl("div", { class: "paper" + (active && t.id == active.id ? " here" : ""), style: `left:${pos.x}px;top:${pos.y}px;--band:hsl(${hue(host)} 38% 52%)` },
      wrenEl("button", { class: "x", text: "×", title: "close this tab", onclick: async e => { e.stopPropagation(); await browser.tabs.remove(t.id); tabs = tabs.filter(o => o.id != t.id); draw(); } }),
      wrenEl("b", { text: t.title || t.url }),
      wrenEl("span", { text: host + (t.discarded ? "  ·  asleep" : "") }),
      wrenEl("span", { text: "read " + ago(t.lastAccessed || Date.now()) }));
    let drag = null;
    paper.addEventListener("pointerdown", e => {
      drag = { dx: e.clientX - paper.offsetLeft, dy: e.clientY - paper.offsetTop, moved: false };
      paper.setPointerCapture(e.pointerId);
    });
    paper.addEventListener("pointermove", e => {
      if (!drag) {
        return;
      }
      drag.moved = true;
      paper.style.left = Math.max(0, e.clientX - drag.dx) + "px";
      paper.style.top = Math.max(0, e.clientY - drag.dy) + "px";
    });
    paper.addEventListener("pointerup", async () => {
      if (drag && drag.moved) {
        positions[key] = { x: paper.offsetLeft, y: paper.offsetTop };
        await browser.storage.local.set({ tablePositions: positions });
      } else if (drag) {
        await browser.tabs.update(t.id, { active: true });
        await browser.windows.update(t.windowId, { focused: true });
      }
      drag = null;
    });
    desk.append(paper);
  });
  document.getElementById("n").textContent = shown + " tabs";
}

document.getElementById("find").addEventListener("input", draw);
document.getElementById("tidy").addEventListener("click", async () => {
  positions = {};
  await browser.storage.local.remove("tablePositions");
  draw();
});

(async () => {
  ({ tablePositions: positions = {} } = await browser.storage.local.get("tablePositions"));
  tabs = (await browser.tabs.query({})).filter(t => !t.url.startsWith("moz-extension://" + location.host + "/pages/table.html"));
  draw();
})();
