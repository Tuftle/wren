/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The first-run music: a soft music-box tune made on the spot by Wren's background page. It plays while
// the egg hatches and the welcome is open, fades away when it is over, and has a switch you can reach.

const WrenMusic = (() => {
  let enabled = true;
  let playing = false;
  const button = () => document.getElementById("musicBtn");
  const send = message => browser.runtime.sendMessage(message).catch(() => null);

  function label() {
    const b = button();
    if (b) {
      b.textContent = enabled ? "♪ sound on" : "♪ sound off";
      b.setAttribute("aria-pressed", String(enabled));
    }
  }

  async function start() {
    enabled = (await WrenSettings.get()).music;
    const b = button();
    if (b) {
      b.hidden = false;
      b.onclick = async () => {
        enabled = !enabled;
        await WrenSettings.set({ music: enabled });
        if (enabled) {
          playing = true;
          send({ type: "music", action: "start" });
        } else {
          send({ type: "music", action: "stop", fade: 1 });
          playing = false;
        }
        label();
      };
    }
    label();
    if (enabled && !playing) {
      playing = true;
      await send({ type: "music", action: "start" });
    }
  }

  function stop(fade = 3) {
    playing = false;
    send({ type: "music", action: "stop", fade });
    const b = button();
    if (b) {
      b.hidden = true;
    }
  }

  function cue(name) {
    if (enabled && playing) {
      send({ type: "music", action: "cue", name });
    }
  }

  return { start, stop, cue };
})();
