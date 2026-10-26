/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("graph");
const tip = document.getElementById("tip");
const el = (tag, attrs = {}, parent = svg) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    n.setAttribute(k, v);
  }
  parent.append(n);
  return n;
};
const hue = host => { let h = 0; for (const c of host) { h = (h * 31 + c.charCodeAt(0)) % 360; } return h; };

function draw(day) {
  svg.textContent = "";
  const nodes = Object.entries(day.nodes).sort((a, b) => a[1].time - b[1].time);
  document.getElementById("count").textContent = `${nodes.length} pages, ${day.edges.length} steps`;
  if (!nodes.length) {
    svg.setAttribute("height", 80);
    el("text", { x: 20, y: 44, class: "lane" }).textContent = "nothing on the trail for this day yet.";
    return;
  }
  const lanes = [];
  for (const [, n] of nodes) {
    if (!lanes.includes(n.host)) {
      lanes.push(n.host);
    }
  }
  const pos = new Map();
  nodes.forEach(([url, n], i) => pos.set(url, { x: 150 + i * 56, y: 40 + lanes.indexOf(n.host) * 54 }));
  const width = 150 + nodes.length * 56 + 60;
  const height = 40 + lanes.length * 54 + 20;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  lanes.forEach((host, i) => el("text", { x: 12, y: 44 + i * 54, class: "lane" }).textContent = host.slice(0, 20));
  for (const [from, to] of day.edges) {
    const a = pos.get(from);
    const b = pos.get(to);
    if (a && b) {
      el("path", { class: "edge", d: `M${a.x} ${a.y}C${a.x + 30} ${a.y} ${b.x - 30} ${b.y} ${b.x} ${b.y}` });
    }
  }
  for (const [url, n] of nodes) {
    const p = pos.get(url);
    const g = el("g", { class: "node" });
    const c = el("circle", { cx: p.x, cy: p.y, r: 14, fill: `hsl(${hue(n.host)} 38% 52%)` }, g);
    el("text", { x: p.x, y: p.y + 4 }, g).textContent = (n.host[0] || "").toLowerCase();
    c.addEventListener("click", () => browser.tabs.create({ url }));
    c.addEventListener("mousemove", e => {
      tip.hidden = false;
      tip.textContent = (n.title || n.host) + "  ·  " + new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      tip.style.left = e.clientX + 14 + "px";
      tip.style.top = e.clientY + 14 + "px";
    });
    c.addEventListener("mouseleave", () => { tip.hidden = true; });
  }
}

(async () => {
  const trail = await browser.runtime.sendMessage({ type: "trail" });
  const select = document.getElementById("day");
  const days = Object.keys(trail).sort().reverse();
  if (!days.includes(wrenDay())) {
    days.unshift(wrenDay());
  }
  for (const d of days) {
    select.append(wrenEl("option", { value: d, text: d == wrenDay() ? "today" : d }));
  }
  const show = () => draw(trail[select.value] || { nodes: {}, edges: [] });
  select.addEventListener("change", show);
  show();
})();
