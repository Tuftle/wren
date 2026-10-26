/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const $ = id => document.getElementById(id);

async function save(patch) {
  const settings = await WrenSettings.get();
  const access = { ...settings.access, ...patch };
  await WrenSettings.set({ access });
  if ("calm" in patch) {
    browser.wren.setCalmMotion(!!patch.calm).catch(() => {});
  }
  $("saved").textContent = "saved";
  setTimeout(() => { $("saved").textContent = " "; }, 1200);
  show(access);
}

function show(a) {
  $("sizeV").textContent = a.size + "%";
  $("spaceV").textContent = (a.spacing / 100).toFixed(2) + " em";
  // the sample paragraph on this page follows the choices too
  document.body.style.fontFamily = a.font || "";
  document.documentElement.style.fontSize = a.size + "%";
}

WrenSettings.get().then(({ access: a }) => {
  $("font").value = a.font;
  $("size").value = a.size;
  $("spacing").value = a.spacing;
  $("calm").checked = a.calm;
  $("contrast").checked = a.contrast;
  show(a);
});
$("font").addEventListener("change", () => save({ font: $("font").value }));
$("size").addEventListener("input", () => save({ size: Number($("size").value) }));
$("spacing").addEventListener("input", () => save({ spacing: Number($("spacing").value) }));
$("calm").addEventListener("change", () => save({ calm: $("calm").checked }));
$("contrast").addEventListener("change", () => save({ contrast: $("contrast").checked }));
