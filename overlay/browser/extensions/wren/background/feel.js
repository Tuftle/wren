/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// How the window feels: a soft tint from the site you are on, the light of the time of day, a mood,
// and bedtime mode. All of it is a few colours handed to Wren's window style sheet; nothing is sent anywhere.

const MOODS = {
  default: { label: "wren", accent: null, tint: null, sound: null, scene: null },
  library: { label: "library", accent: ["#7b5a3a", "#e0b87a", "#946b44", "#d3a566"], tint: "rgba(224,184,122,0.10)", sound: "fire", scene: "fire" },
  train: { label: "late train", accent: ["#4f6a8f", "#9cb4d6", "#617faa", "#8aa3c7"], tint: "rgba(110,140,200,0.10)", sound: "rain", scene: "rain" },
  seaside: { label: "seaside", accent: ["#2f7a80", "#7cc6c9", "#3a9199", "#6bb5b8"], tint: "rgba(90,190,190,0.10)", sound: "waves", scene: "waves" },
};

let bedtimeActive = false;
let bedtimeStartedSound = false;

// --- colour helpers ---------------------------------------------------------------------------------
function toRgb(css) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillStyle = css;
  x.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
  return a ? [r, g, b] : null;
}

function hostColour(host) {
  let h = 0;
  for (const ch of host) {
    h = (h * 31 + ch.charCodeAt(0)) % 360;
  }
  return toRgb(`hsl(${h} 38% 52%)`);
}

function timeOverlay(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 8) {
    return "rgba(255, 214, 150, 0.05)";
  }
  if (hour >= 17 && hour < 20) {
    return "rgba(255, 170, 90, 0.06)";
  }
  if (hour >= 20 || hour < 5) {
    return "rgba(40, 25, 10, 0.12)";
  }
  return "transparent";
}

// --- putting it on the window --------------------------------------------------------------------------
let siteTint = "transparent";

async function applyFeel() {
  const s = await WrenSettings.get();
  const mood = MOODS[s.mood] || MOODS.default;
  const vars = {
    "--wren-time": s.timeTint ? timeOverlay() : "transparent",
    "--wren-site": s.siteTint ? siteTint : "transparent",
    "--wren-mood": mood.tint || "transparent",
  };
  if (mood.accent) {
    const [lightA, darkA, lightH, darkH] = mood.accent;
    vars["--color-accent-primary"] = `light-dark(${lightA}, ${darkA})`;
    vars["--color-accent-primary-hover"] = `light-dark(${lightH}, ${darkH})`;
    vars["--color-accent-primary-active"] = `light-dark(${lightA}, ${darkA})`;
  } else {
    vars["--color-accent-primary"] = null;
    vars["--color-accent-primary-hover"] = null;
    vars["--color-accent-primary-active"] = null;
  }
  try {
    await browser.wren.setChromeVars(vars);
  } catch (e) {
    // the experiment API is not there yet
  }
}

async function updateSiteTint() {
  const s = await WrenSettings.get();
  if (!s.siteTint) {
    siteTint = "transparent";
    return applyFeel();
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) {
    siteTint = "transparent";
    return applyFeel();
  }
  let rgb = null;
  try {
    const colour = await browser.tabs.sendMessage(tab.id, { type: "themeColor" });
    rgb = colour ? toRgb(colour) : null;
  } catch (e) {
    // the page can not be asked
  }
  rgb = rgb || hostColour(wrenHost(tab.url));
  siteTint = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.14)`;
  return applyFeel();
}

browser.tabs.onActivated.addListener(() => updateSiteTint());
browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status == "complete" && tab.active) {
    updateSiteTint();
  }
});
browser.windows.onFocusChanged.addListener(() => updateSiteTint());

// --- bedtime mode --------------------------------------------------------------------------------------------
function inWindow(from, to, h = new Date().getHours()) {
  return from > to ? h >= from || h < to : h >= from && h < to;
}

async function checkBedtime() {
  const s = await WrenSettings.get();
  const should = s.bedtime && inWindow(s.bedFrom, s.bedTo);
  if (should && !bedtimeActive) {
    bedtimeActive = true;
    await browser.storage.local.set({ bedtimeNow: true });
    await browser.wren.setQuietMode(true);
    if (s.bedSound && !WrenSounds.state().playing) {
      WrenSounds.setVolume(0.25);
      WrenSounds.play("rain");
      bedtimeStartedSound = true;
    }
  } else if (!should && bedtimeActive) {
    bedtimeActive = false;
    await browser.storage.local.set({ bedtimeNow: false });
    if (typeof focusOn == "undefined" || !focusOn) {
      await browser.wren.setQuietMode(false);
    }
    if (bedtimeStartedSound) {
      WrenSounds.stop();
      bedtimeStartedSound = false;
    }
  }
}

// --- the clock: every few minutes -----------------------------------------------------------------------------
browser.alarms.create("feel", { delayInMinutes: 1, periodInMinutes: 5 });
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == "feel") {
    applyFeel();
    checkBedtime();
  }
});

browser.storage.onChanged.addListener(changes => {
  if (changes.settings) {
    applyFeel();
    checkBedtime();
  }
});

browser.runtime.onMessage.addListener(message => {
  if (message.type == "mood") {
    return WrenSettings.set({ mood: message.name }).then(async () => {
      const mood = MOODS[message.name];
      if (mood && mood.sound && message.sound) {
        WrenSounds.play(mood.sound);
      } else if (message.sound === false) {
        WrenSounds.stop();
      }
      return { moods: Object.keys(MOODS) };
    });
  }
  if (message.type == "moods") {
    return Promise.resolve(Object.fromEntries(Object.entries(MOODS).map(([k, m]) => [k, { label: m.label, scene: m.scene, sound: m.sound }])));
  }
  return undefined;
});

// the browser's own "answers in the address bar", switched on once
browser.wren.enableAnswers().catch(() => {});
applyFeel();
updateSiteTint();
checkBedtime();
