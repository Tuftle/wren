/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The very first thing a new person sees: an egg that arrives, wobbles, cracks with light inside, and
// hatches a wren, to a soft tune. It plays once, can be skipped with any key or click, and is skipped
// when the system asks for calm motion. start.html#hatch plays it again.

(async () => {
  const { welcomed } = await browser.storage.local.get("welcomed");
  const settings = await WrenSettings.get();
  const layer = document.getElementById("hatch");
  const replay = location.hash == "#hatch";
  if (!layer || (!replay && (welcomed || settings.hatched))) {
    return;
  }
  const welcome = document.getElementById("welcome");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || settings.access.calm;
  if (calm && !replay) {
    return;
  }

  // the welcome card waits behind the egg
  if (welcome) {
    welcome.style.visibility = "hidden";
  }
  layer.hidden = false;
  let done = false;
  const timers = [];

  const finish = async () => {
    if (done) {
      return;
    }
    done = true;
    timers.forEach(clearTimeout);
    layer.classList.add("leaving");
    if (welcome) {
      welcome.style.visibility = "";
    } else {
      WrenMusic.stop(2.5);
    }
    setTimeout(() => { layer.hidden = true; }, 1000);
    if (!replay) {
      await WrenSettings.set({ hatched: true });
    }
  };

  WrenMusic.start();

  const at = (ms, fn) => timers.push(setTimeout(() => !done && fn(), ms));
  const add = (...names) => layer.classList.add(...names);
  at(250, () => add("arrive"));
  at(1100, () => { add("wobble"); WrenMusic.cue("tap"); });
  at(2300, () => WrenMusic.cue("tap"));
  at(2900, () => { add("crack1"); WrenMusic.cue("crack"); });
  at(3900, () => { add("crack2"); WrenMusic.cue("crack"); });
  at(4900, () => { add("hatch"); layer.classList.remove("wobble"); WrenMusic.cue("hatch"); });
  at(6000, () => add("hop"));
  at(6400, () => { add("hello"); WrenMusic.cue("hello"); });
  at(7600, () => add("gone"));
  at(9400, finish);
  ["click", "keydown"].forEach(type => layer.addEventListener(type, finish, { once: true }));
  addEventListener("keydown", finish, { once: true });
})();
