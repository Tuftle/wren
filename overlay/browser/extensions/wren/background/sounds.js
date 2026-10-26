/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Cozy sounds, made on the spot from noise: nothing is downloaded and nothing is played from a server.
// They live in the background script so they keep playing when you switch tabs.

const WrenSounds = (() => {
  let ctx = null;
  let master = null;
  let nodes = [];
  let timer = null;
  let current = null;
  let volume = 0.5;
  let token = 0;
  let mine = 0;
  let fireCache = null;

  async function fireBuffer() {
    if (!fireCache) {
      const response = await fetch(browser.runtime.getURL("audio/fire.ogg"));
      fireCache = await context().decodeAudioData(await response.arrayBuffer());
    }
    return fireCache;
  }

  function context() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function noise(kind, seconds = 4) {
    const c = context();
    const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind == "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    nodes.push(src);
    return src;
  }

  function filter(type, frequency, q = 0.7) {
    const f = context().createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    nodes.push(f);
    return f;
  }

  function gain(value) {
    const g = context().createGain();
    g.gain.value = value;
    nodes.push(g);
    return g;
  }

  function chain(...parts) {
    for (let i = 0; i < parts.length - 1; i++) {
      parts[i].connect(parts[i + 1]);
    }
    parts[parts.length - 1].connect(master);
  }

  const makers = {
    rain() {
      chain(noise("white"), filter("highpass", 900), filter("lowpass", 9000), gain(0.28));
      chain(noise("brown"), filter("lowpass", 400), gain(0.5));
    },
    // the real thing: a recording of a wood fire (CC0, see audio/CREDITS.txt), looped with a long
    // crossfade so there is no seam
    async fire() {
      const buffer = await fireBuffer();
      if (token != mine) {
        return;
      }
      const c = context();
      const fade = 2.5;
      const segment = when => {
        if (token != mine) {
          return;
        }
        const src = c.createBufferSource();
        src.buffer = buffer;
        const g = c.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(1, when + fade);
        g.gain.setValueAtTime(1, when + buffer.duration - fade);
        g.gain.linearRampToValueAtTime(0, when + buffer.duration);
        src.connect(g);
        g.connect(master);
        src.start(when);
        nodes.push(src, g);
        const next = when + buffer.duration - fade;
        timer = setTimeout(() => segment(next), Math.max(0, (next - c.currentTime - 1) * 1000));
      };
      segment(c.currentTime + 0.05);
    },
    waves() {
      // slow swells: brown noise whose loudness rises and falls, with a hiss on the crest
      const swell = (rate, depth, base) => {
        const g = gain(base);
        const lfo = context().createOscillator();
        lfo.frequency.value = rate;
        const d = gain(depth);
        lfo.connect(d);
        d.connect(g.gain);
        lfo.start();
        nodes.push(lfo);
        return g;
      };
      chain(noise("brown"), filter("lowpass", 1100), swell(0.11, 0.55, 0.6));
      chain(noise("white"), filter("highpass", 1800), filter("lowpass", 7000), swell(0.11, 0.07, 0.07));
    },
    cafe() {
      chain(noise("brown"), filter("lowpass", 900), gain(0.7));
      const murmur = noise("white");
      const band = filter("bandpass", 700, 0.8);
      const level = gain(0.12);
      const lfo = context().createOscillator();
      lfo.frequency.value = 0.35;
      const depth = gain(0.08);
      lfo.connect(depth);
      depth.connect(level.gain);
      lfo.start();
      nodes.push(lfo);
      chain(murmur, band, level);
    },
  };

  function stop() {
    token++;
    clearTimeout(timer);
    for (const n of nodes) {
      try {
        n.stop?.();
      } catch (e) {
        // already stopped
      }
      try {
        n.disconnect();
      } catch (e) {
        // already disconnected
      }
    }
    nodes = [];
    current = null;
  }

  return {
    play(kind) {
      stop();
      if (!makers[kind]) {
        return;
      }
      context().resume();
      mine = token;
      makers[kind]();
      current = kind;
    },
    stop,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) {
        master.gain.value = volume;
      }
    },
    chime() {
      const c = context();
      c.resume();
      [660, 880, 1320].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t = c.currentTime + i * 0.18;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        o.connect(g);
        g.connect(c.destination);
        o.start(t);
        o.stop(t + 1.3);
      });
    },
    state: () => ({ playing: current, volume }),
  };
})();

// --- the first-run music: a soft music-box tune, made on the spot ---------------------------------------
// Bells (a few sine partials with a quick decay) over a very quiet low pad, through a gentle room echo.
// It is generated, not recorded, so nothing is downloaded and there is nothing to license.
const WrenMusicEngine = (() => {
  let ctx = null;
  let bus = null;
  let timer = null;
  let running = false;
  let next = 0;
  let step = 0;
  let padNodes = [];
  let stopToken = 0;

  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0]; // C D E G A: no note is ever wrong
  const MELODY = [
    4, 5, 7, 5, 4, 2, 0, 2, 4, 5, 7, 9, 7, 5, 4, null,
    2, 4, 5, 4, 2, 0, 2, null, 0, 2, 4, 2, 0, null, null, null,
  ];
  const STEP = 0.5;

  function impulse(c, seconds) {
    const length = Math.floor(c.sampleRate * seconds);
    const buffer = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.4);
      }
    }
    return buffer;
  }

  function ensure() {
    if (ctx) {
      return ctx;
    }
    ctx = new AudioContext();
    bus = ctx.createGain();
    bus.gain.value = 0;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const room = ctx.createConvolver();
    room.buffer = impulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    bus.connect(dry);
    bus.connect(room);
    room.connect(wet);
    dry.connect(ctx.destination);
    wet.connect(ctx.destination);
    return ctx;
  }

  function bell(freq, when, vol = 0.4, dur = 2.4) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(bus);
    for (const [mult, amp] of [[1, 1], [2, 0.28], [4.1, 0.08], [6.2, 0.03]]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
  }

  function startPad() {
    for (const freq of [130.81, 196.0, 261.63]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.03;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const depth = ctx.createGain();
      depth.gain.value = 0.015;
      lfo.connect(depth);
      depth.connect(g.gain);
      o.connect(g);
      g.connect(bus);
      o.start();
      lfo.start();
      padNodes.push(o, lfo);
    }
  }

  function tick() {
    while (next < ctx.currentTime + 1.2) {
      const i = MELODY[step % MELODY.length];
      if (i !== null) {
        const freq = SCALE[i % 5] * (i >= 5 ? 2 : 1);
        bell(freq, next + Math.random() * 0.012, 0.28 + Math.random() * 0.14);
      }
      if (step % 8 == 0) {
        bell(130.81, next, 0.3, 3.2);
      }
      next += STEP;
      step++;
    }
  }

  async function start() {
    stopToken++;
    ensure();
    await ctx.resume().catch(() => {});
    if (!running) {
      running = true;
      next = ctx.currentTime + 0.3;
      step = 0;
      startPad();
      timer = setInterval(tick, 250);
      tick();
    }
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8);
  }

  function stop(fade = 3) {
    if (!ctx || !running) {
      return;
    }
    const token = ++stopToken;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    setTimeout(() => {
      if (token != stopToken) {
        return;
      }
      clearInterval(timer);
      padNodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
      padNodes = [];
      running = false;
    }, fade * 1000 + 400);
  }

  function noiseBurst(when, freq, vol, len = 0.03) {
    const n = Math.floor(ctx.sampleRate * len);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(when);
  }

  function cue(name) {
    if (!ctx || !running) {
      return;
    }
    const t = ctx.currentTime;
    if (name == "tap") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + 0.2);
      noiseBurst(t, 1800, 0.5, 0.02);
    } else if (name == "crack") {
      [0, 0.05, 0.11, 0.2].forEach(d => noiseBurst(t + d, 2200 + Math.random() * 2500, 0.6, 0.035));
    } else if (name == "hatch") {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, t + i * 0.12, 0.4, 2.6));
    } else if (name == "hello") {
      [523.25, 659.25, 783.99].forEach(f => bell(f, t, 0.22, 3.8));
    }
  }

  return {
    handle(message) {
      if (message.action == "start") {
        return start().then(() => ({ state: ctx.state }));
      }
      if (message.action == "stop") {
        stop(message.fade || 3);
      } else if (message.action == "cue") {
        cue(message.name);
      }
      return Promise.resolve({ state: ctx ? ctx.state : "none" });
    },
  };
})();
