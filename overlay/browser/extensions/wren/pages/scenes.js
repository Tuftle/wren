/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Ambient mode: when the start page has been left alone for a few minutes, it becomes a calm, slow scene.
// Any key or mouse movement brings the page back. Drawn on the spot; nothing is downloaded.

const WrenScenes = (() => {
  let canvas, ctx, raf, scene, w, h, t0;
  let parts = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    w = canvas.width = innerWidth;
    h = canvas.height = innerHeight;
  }

  const draw = {
    fire() {
      ctx.fillStyle = "#120c08";
      ctx.fillRect(0, 0, w, h);
      const t = (performance.now() - t0) / 1000;
      const glow = 0.85 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 7.3) * 0.05;
      const g = ctx.createRadialGradient(w / 2, h * 0.82, 10, w / 2, h * 0.82, h * 0.7 * glow);
      g.addColorStop(0, "rgba(255,170,70,.55)");
      g.addColorStop(0.4, "rgba(200,80,20,.25)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      while (parts.length < 90) {
        parts.push({ x: w / 2 + rand(-w * 0.07, w * 0.07), y: h * 0.84, vx: rand(-0.4, 0.4), vy: rand(-2.2, -0.7), r: rand(6, 22), life: 1, ember: Math.random() < 0.3 });
      }
      parts = parts.filter(p => p.life > 0);
      for (const p of parts) {
        p.x += p.vx + Math.sin(p.y / 40 + p.r) * 0.35;
        p.y += p.vy;
        p.life -= p.ember ? 0.004 : 0.012;
        const size = p.ember ? 2.2 : p.r * p.life;
        const a = Math.max(0, p.life);
        ctx.fillStyle = p.ember ? `rgba(255,200,120,${a})` : `rgba(255,${Math.round(90 + 110 * a)},30,${0.16 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, 7);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#050302";
      ctx.beginPath();
      ctx.roundRect(w / 2 - w * 0.12, h * 0.86, w * 0.24, h * 0.05, 20);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(w / 2 - w * 0.09, h * 0.83, w * 0.18, h * 0.045, 20);
      ctx.fill();
    },

    rain() {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1b2230");
      g.addColorStop(1, "#0d1118");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      while (parts.length < 220) {
        parts.push({ x: rand(0, w + 200), y: rand(-h, 0), len: rand(14, 40), v: rand(10, 18), drop: false });
      }
      ctx.strokeStyle = "rgba(170,195,230,.35)";
      ctx.lineWidth = 1.2;
      for (const p of parts) {
        if (p.drop) {
          p.y += p.slide;
          p.slide *= 0.995;
          p.life -= 0.003;
          ctx.fillStyle = `rgba(200,220,255,${0.16 * p.life})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r * 0.7, p.r, 0, 0, 7);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * 0.25, p.y + p.len);
        ctx.stroke();
        p.y += p.v;
        p.x -= p.v * 0.25;
        if (p.y > h) {
          p.y = rand(-80, 0);
          p.x = rand(0, w + 200);
        }
      }
      parts = parts.filter(p => !p.drop || p.life > 0);
      if (Math.random() < 0.08) {
        parts.push({ x: rand(0, w), y: rand(0, h * 0.5), r: rand(3, 9), slide: rand(0.2, 0.9), life: 1, drop: true });
      }
    },

    waves() {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#f2b27a");
      g.addColorStop(0.55, "#e98d6a");
      g.addColorStop(1, "#6a4a64");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = "rgba(255,235,190,.9)";
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.42, h * 0.07, 0, 7);
      ctx.fill();
      const colours = ["rgba(60,110,130,.85)", "rgba(40,85,110,.9)", "rgba(25,60,90,.95)", "rgba(15,40,70,1)"];
      colours.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) {
          const y = h * (0.55 + i * 0.1) + Math.sin(x / (120 + i * 40) + t * (0.5 + i * 0.15)) * (10 + i * 6);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fill();
      });
    },

    snow() {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1f2a3a");
      g.addColorStop(1, "#46566b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      while (parts.length < 160) {
        parts.push({ x: rand(0, w), y: rand(-h, 0), r: rand(1.2, 4), v: rand(0.5, 1.6), sway: rand(0, 6) });
      }
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (const p of parts) {
        p.y += p.v;
        const x = p.x + Math.sin(t + p.sway) * 18;
        ctx.beginPath();
        ctx.arc(x, p.y, p.r, 0, 7);
        ctx.fill();
        if (p.y > h) {
          p.y = -10;
          p.x = rand(0, w);
        }
      }
      ctx.fillStyle = "#dfe7ef";
      ctx.fillRect(0, h * 0.93, w, h);
    },
  };

  function frame() {
    draw[scene]();
    raf = requestAnimationFrame(frame);
  }

  function clock() {
    const el = document.getElementById("ambientClock");
    if (el) {
      const d = new Date();
      el.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  return {
    start(name) {
      scene = draw[name] ? name : "fire";
      const layer = document.getElementById("ambient");
      canvas = document.getElementById("ambientCanvas");
      ctx = canvas.getContext("2d");
      resize();
      parts = [];
      t0 = performance.now();
      layer.hidden = false;
      requestAnimationFrame(() => layer.classList.add("on"));
      clock();
      this.timer = setInterval(clock, 10000);
      frame();
    },
    stop() {
      cancelAnimationFrame(raf);
      clearInterval(this.timer);
      const layer = document.getElementById("ambient");
      layer.classList.remove("on");
      setTimeout(() => { layer.hidden = true; }, 600);
    },
    resize,
    get running() {
      return !document.getElementById("ambient").hidden;
    },
  };
})();

// pick a scene: the mood's, else the season and the hour
function sceneFor(moods, mood) {
  if (moods[mood]?.scene) {
    return moods[mood].scene;
  }
  const month = new Date().getMonth();
  const hour = new Date().getHours();
  if (month == 11 || month < 2) {
    return "snow";
  }
  return hour >= 17 || hour < 7 ? "fire" : "waves";
}

(async () => {
  const settings = await WrenSettings.get();
  if (!settings.ambient) {
    return;
  }
  const moods = await browser.runtime.sendMessage({ type: "moods" });
  let idle = null;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!document.getElementById("welcome")) {
        WrenScenes.start(sceneFor(moods, settings.mood));
      } else {
        arm();
      }
    }, settings.ambientMinutes * 60000);
  };
  const wake = () => {
    if (WrenScenes.running) {
      WrenScenes.stop();
    }
    arm();
  };
  ["mousemove", "mousedown", "keydown", "touchstart", "wheel"].forEach(type => document.addEventListener(type, wake, { passive: true }));
  addEventListener("resize", () => WrenScenes.running && WrenScenes.resize());
  window.__ambientNow = name => WrenScenes.start(name || sceneFor(moods, settings.mood));
  if (location.hash.startsWith("#ambient")) {
    setTimeout(() => WrenScenes.start(location.hash.split("-")[1] || sceneFor(moods, settings.mood)), 1200);
  }
  arm();
})();
