/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wren's page-level helpers, one section each: evening shade, highlights, draft saver, snippets,
// link hints, link peek, read aloud, clipboard shelf, tab names, volume, and a readable copy of the page.
// Each reads Wren's settings and does nothing unless it is switched on. Nothing leaves the browser.

(() => {
  if (window.__wrenExtras) {
    return;
  }
  window.__wrenExtras = true;

  let S = { ...WREN_DEFAULTS };
  const here = () => wrenKey(location.href);

  // a little card in a shadow root, so a page's own styles can not reach it
  function card(css, html) {
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>
      :host{all:initial}
      *{box-sizing:border-box}
      .c{font:15px/1.5 Georgia,serif;background:#f4efe6;color:#3b2f25;border:1px solid #d9cfbf;border-radius:14px;
         box-shadow:0 12px 36px rgba(40,25,10,.28);${css}}
      button{font:inherit;border-radius:999px;border:1px solid #d9cfbf;background:transparent;color:inherit;padding:.25em .9em;cursor:pointer}
      button.go{background:#8a4b2a;color:#f4efe6;border-color:#8a4b2a}
      @media (prefers-color-scheme:dark){.c{background:#2a231c;color:#e6dccd;border-color:#3a3128}
        button{border-color:#3a3128}button.go{background:#d9a073;color:#211c17;border-color:#d9a073}}
    </style><div class="c">${html}</div>`;
    document.documentElement.append(host);
    return { host, root };
  }

  // --- evening shade -------------------------------------------------------------------------------
  let bedNow = false;
  function shadeOn() {
    if (S.shade || bedNow) {
      return true;
    }
    if (!S.shadeAuto) {
      return false;
    }
    const h = new Date().getHours();
    return S.shadeFrom > S.shadeTo ? h >= S.shadeFrom || h < S.shadeTo : h >= S.shadeFrom && h < S.shadeTo;
  }
  function applyShade() {
    let el = document.getElementById("wren-shade");
    if (!shadeOn()) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "wren-shade";
      el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;mix-blend-mode:multiply;transition:background .4s";
      document.documentElement.append(el);
    }
    const l = S.shadeLevel / 100;
    el.style.background = `rgba(255,${Math.round(200 - 70 * l)},${Math.round(140 - 90 * l)},${(0.12 + 0.5 * l).toFixed(2)})`;
  }

  // --- highlights ---------------------------------------------------------------------------------
  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT"]);

  function mark(node, start, end, id) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const m = document.createElement("mark");
    m.className = "wren-hl";
    m.dataset.wren = id;
    m.style.cssText = "background:#f4d27a;color:inherit;border-radius:3px;padding:0 1px";
    m.title = "wren highlight (alt-click to remove)";
    range.surroundContents(m);
  }

  function showHighlight(h) {
    if (document.querySelector(`mark[data-wren="${h.id}"]`)) {
      return;
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => skipTags.has(n.parentElement?.tagName) || n.parentElement?.closest("mark.wren-hl")
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let i = node.data.indexOf(h.text);
      while (i >= 0) {
        if (!h.prefix || node.data.slice(Math.max(0, i - h.prefix.length), i) == h.prefix || i < h.prefix.length) {
          try {
            mark(node, i, i + h.text.length, h.id);
          } catch (e) {
            // the text crosses elements; it stays in the list, just not painted
          }
          return;
        }
        i = node.data.indexOf(h.text, i + 1);
      }
    }
  }

  async function paintHighlights() {
    if (!S.highlights) {
      return;
    }
    const { highlights = {} } = await browser.storage.local.get("highlights");
    (highlights[here()] || []).forEach(showHighlight);
  }

  async function addHighlight() {
    const sel = getSelection();
    const text = sel.toString().trim();
    if (!text || text.length < 3 || text.length > 500 || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const prefix = node.nodeType == 3 ? node.data.slice(Math.max(0, range.startOffset - 20), range.startOffset) : "";
    const item = { id: Date.now().toString(36), text, prefix, added: Date.now(), title: document.title };
    const { highlights = {} } = await browser.storage.local.get("highlights");
    (highlights[here()] ||= []).push(item);
    await browser.storage.local.set({ highlights });
    sel.removeAllRanges();
    showHighlight(item);
  }

  let pill = null;
  document.addEventListener("mouseup", e => {
    if (!S.highlights) {
      return;
    }
    setTimeout(() => {
      pill?.host.remove();
      pill = null;
      const sel = getSelection();
      const text = sel.toString().trim();
      if (text.length < 3 || !sel.rangeCount || e.target.closest?.("input,textarea,[contenteditable]")) {
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      pill = card(`padding:.2rem;`, `<button class="go">highlight</button>`);
      pill.host.style.top = Math.max(4, r.top - 40) + "px";
      pill.host.style.left = Math.max(4, Math.min(innerWidth - 110, r.left)) + "px";
      pill.root.querySelector("button").addEventListener("mousedown", ev => {
        ev.preventDefault();
        addHighlight();
        pill.host.remove();
        pill = null;
      });
    }, 10);
  });

  document.addEventListener("click", async e => {
    const m = e.target.closest?.("mark.wren-hl");
    if (m && e.altKey) {
      e.preventDefault();
      const { highlights = {} } = await browser.storage.local.get("highlights");
      highlights[here()] = (highlights[here()] || []).filter(h => h.id != m.dataset.wren);
      await browser.storage.local.set({ highlights });
      m.replaceWith(...m.childNodes);
    }
  }, true);

  // --- draft saver ---------------------------------------------------------------------------------
  const sensitive = /pass|pin\b|card|cvv|cvc|ssn|secret|otp|token/i;
  const draftFields = () => [...document.querySelectorAll("textarea, [contenteditable=''], [contenteditable='true']")]
    .filter(el => !sensitive.test((el.name || "") + (el.id || "") + (el.getAttribute("autocomplete") || "")));
  const draftKey = el => location.origin + location.pathname + "#" + draftFields().indexOf(el);
  const valueOf = el => ("value" in el ? el.value : el.innerText) || "";
  let draftTimer = null;

  document.addEventListener("input", e => {
    if (!S.drafts) {
      return;
    }
    const el = e.target;
    if (!draftFields().includes(el)) {
      return;
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      const text = valueOf(el);
      const { drafts = {} } = await browser.storage.local.get("drafts");
      const key = draftKey(el);
      if (text.trim().length >= 15) {
        drafts[key] = { text, time: Date.now() };
      } else {
        delete drafts[key];
      }
      for (const [k, v] of Object.entries(drafts)) {
        if (Date.now() - v.time > 7 * 86400000) {
          delete drafts[k];
        }
      }
      browser.storage.local.set({ drafts });
    }, 900);
  }, true);

  document.addEventListener("submit", async () => {
    const { drafts = {} } = await browser.storage.local.get("drafts");
    for (const el of draftFields()) {
      delete drafts[draftKey(el)];
    }
    browser.storage.local.set({ drafts });
  }, true);

  async function offerDrafts() {
    if (!S.drafts) {
      return;
    }
    const { drafts = {} } = await browser.storage.local.get("drafts");
    for (const el of draftFields()) {
      const d = drafts[draftKey(el)];
      if (d && !valueOf(el).trim()) {
        const bar = card("padding:.6rem .9rem;display:flex;gap:.7rem;align-items:center;",
          `<span>you had a draft here. restore it?</span><button class="go" id="y">restore</button><button id="n">no</button>`);
        bar.host.style.cssText += "bottom:1rem;left:50%;transform:translateX(-50%);";
        bar.root.getElementById("y").addEventListener("click", () => {
          if ("value" in el) {
            el.value = d.text;
          } else {
            el.innerText = d.text;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          bar.host.remove();
        });
        bar.root.getElementById("n").addEventListener("click", () => bar.host.remove());
        setTimeout(() => bar.host.remove(), 20000);
        return;
      }
    }
  }

  // --- snippets: type ;code and a space -----------------------------------------------------------
  document.addEventListener("input", e => {
    const el = e.target;
    if (!S.snippetsOn || !(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|email|url)$/.test(el.type)))) {
      return;
    }
    const pos = el.selectionStart;
    const m = /(^|\s);([a-z0-9]{1,20}) $/i.exec(el.value.slice(0, pos));
    const text = m && S.snippets[m[2].toLowerCase()];
    if (text) {
      el.setRangeText(text, pos - m[2].length - 2, pos, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, true);

  // --- keyboard link hints: press f, then the letters on a link ---------------------------------------
  const letters = "asdfghjklqwertyuiopzxcvbnm";
  let hints = null;

  function endHints() {
    hints?.layer.remove();
    hints = null;
  }

  function startHints(newTab) {
    const targets = [...document.querySelectorAll("a[href], button, input[type=submit], [role=button], summary")]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth &&
          getComputedStyle(el).visibility != "hidden";
      }).slice(0, letters.length * letters.length);
    if (!targets.length) {
      return;
    }
    const two = targets.length > letters.length;
    const layer = document.createElement("div");
    layer.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const items = targets.map((el, i) => {
      const label = two ? letters[Math.floor(i / letters.length)] + letters[i % letters.length] : letters[i];
      const r = el.getBoundingClientRect();
      const tag = document.createElement("span");
      tag.textContent = label;
      tag.style.cssText = `position:fixed;left:${Math.max(0, r.left)}px;top:${Math.max(0, r.top)}px;font:700 12px/1 ui-monospace,Consolas,monospace;` +
        "background:#f4d27a;color:#3b2f25;border:1px solid #8a4b2a;border-radius:4px;padding:2px 4px;text-transform:uppercase";
      layer.append(tag);
      return { el, label, tag };
    });
    document.documentElement.append(layer);
    hints = { layer, items, typed: "", newTab };
  }

  document.addEventListener("keydown", e => {
    if (hints) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key == "Escape") {
        endHints();
        return;
      }
      if (e.key.length != 1) {
        return;
      }
      hints.typed += e.key.toLowerCase();
      const rest = hints.items.filter(i => i.label.startsWith(hints.typed));
      hints.items.forEach(i => { i.tag.style.display = rest.includes(i) ? "" : "none"; });
      if (rest.length == 1 && rest[0].label == hints.typed) {
        const { el } = rest[0];
        const newTab = hints.newTab;
        endHints();
        if (newTab && el.href) {
          browser.runtime.sendMessage({ type: "openTab", url: el.href });
        } else {
          el.focus();
          el.click();
        }
      } else if (!rest.length) {
        endHints();
      }
      return;
    }
    if (!S.hints || e.ctrlKey || e.altKey || e.metaKey || e.key.toLowerCase() != "f") {
      return;
    }
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      return;
    }
    e.preventDefault();
    startHints(e.shiftKey);
  }, true);

  // --- link peek: press and hold a link ------------------------------------------------------------
  let holdTimer = null;
  let held = false;
  let peekCard = null;

  document.addEventListener("mousedown", e => {
    peekCard?.host.remove();
    peekCard = null;
    const a = e.target.closest?.("a[href^='http']");
    if (!S.peek || !a || e.button != 0) {
      return;
    }
    holdTimer = setTimeout(async () => {
      held = true;
      const r = a.getBoundingClientRect();
      peekCard = card("width:22rem;max-width:90vw;padding:.8rem 1rem;", `<i style="opacity:.6">peeking&hellip;</i>`);
      peekCard.host.style.left = Math.max(8, Math.min(innerWidth - 370, r.left)) + "px";
      peekCard.host.style.top = Math.min(innerHeight - 150, r.bottom + 8) + "px";
      const answer = await browser.runtime.sendMessage({ type: "peek", url: a.href });
      if (peekCard) {
        const box = peekCard.root.querySelector(".c");
        box.textContent = "";
        const h = document.createElement("b");
        h.textContent = answer?.title || a.href;
        const p = document.createElement("p");
        p.style.margin = ".4rem 0 0";
        p.textContent = answer?.text || "no preview available.";
        box.append(h, p);
      }
    }, 650);
  }, true);
  const cancelHold = () => clearTimeout(holdTimer);
  document.addEventListener("mouseup", cancelHold, true);
  document.addEventListener("mousemove", e => { if (e.movementX > 3 || e.movementY > 3) { cancelHold(); } }, true);
  document.addEventListener("click", e => {
    if (held) {
      held = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // --- the readable copy of this page ---------------------------------------------------------------
  function readable() {
    const roots = [...document.querySelectorAll("article, main, [role=main]")];
    let main = roots.sort((a, b) => b.innerText.length - a.innerText.length)[0];
    if (!main || main.innerText.length < 400) {
      main = [...document.querySelectorAll("div, section")]
        .map(el => ({ el, n: [...el.children].filter(c => c.tagName == "P").reduce((s, p) => s + p.innerText.length, 0) }))
        .sort((a, b) => b.n - a.n)[0]?.el || document.body;
    }
    const keep = new Set(["H1", "H2", "H3", "H4", "P", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "FIGURE", "FIGCAPTION", "IMG", "A", "EM", "STRONG", "B", "I", "BR", "TABLE", "TR", "TD", "TH", "THEAD", "TBODY"]);
    const drop = "script,style,nav,aside,footer,form,iframe,button,noscript,[role=banner],[role=navigation],[aria-hidden=true],.ad,.ads,.advert,.cookie,.cookies,.share,.social";
    const walk = node => {
      if (node.nodeType == 3) {
        return document.createTextNode(node.data);
      }
      if (node.nodeType != 1 || node.matches(drop)) {
        return null;
      }
      const kids = [...node.childNodes].map(walk).filter(Boolean);
      if (!keep.has(node.tagName)) {
        const frag = document.createDocumentFragment();
        kids.forEach(k => frag.append(k));
        return frag;
      }
      const out = document.createElement(node.tagName);
      if (node.tagName == "A" && /^https?:/.test(node.href)) {
        out.href = node.href;
      }
      if (node.tagName == "IMG" && /^https?:/.test(node.currentSrc || node.src)) {
        out.src = node.currentSrc || node.src;
        out.alt = node.alt || "";
      }
      kids.forEach(k => out.append(k));
      return out;
    };
    const holder = document.createElement("div");
    holder.append(walk(main) || "");
    return {
      title: document.title,
      url: location.href,
      text: (main.innerText || "").trim(),
      html: holder.innerHTML,
    };
  }

  // --- read aloud ------------------------------------------------------------------------------------
  let speaking = false;
  function listen(action, rate) {
    speechSynthesis.cancel();
    speaking = false;
    if (action != "start") {
      return;
    }
    const sentences = readable().text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || [];
    const chunks = [];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > 220) {
        chunks.push(cur);
        cur = s;
      } else {
        cur += s;
      }
    }
    chunks.push(cur);
    speaking = true;
    chunks.filter(Boolean).forEach(text => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate || 1;
      speechSynthesis.speak(u);
    });
  }

  // --- the tab's own name, and volume ---------------------------------------------------------------
  let customTitle = null;
  new MutationObserver(() => {
    if (customTitle && document.title != customTitle) {
      document.title = customTitle;
    }
  }).observe(document.querySelector("title") || document.documentElement, { childList: true, subtree: true, characterData: true });

  let volume = null;
  const applyVolume = () => {
    if (volume != null) {
      document.querySelectorAll("video, audio").forEach(m => { m.volume = volume; });
    }
  };
  setInterval(applyVolume, 2000);

  // --- clipboard shelf --------------------------------------------------------------------------------
  document.addEventListener("copy", () => {
    if (!S.clipboardShelf) {
      return;
    }
    const a = document.activeElement;
    const text = a && "selectionStart" in a && a.selectionStart != a.selectionEnd
      ? a.value.slice(a.selectionStart, a.selectionEnd) : getSelection().toString();
    if (text && text.trim()) {
      browser.runtime.sendMessage({ type: "clip", text: text.slice(0, 2000) });
    }
  }, true);

  // --- messages from the rest of Wren ----------------------------------------------------------------
  browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
      case "highlightSelection":
        addHighlight();
        return undefined;
      case "readable":
        return Promise.resolve(readable());
      case "listen":
        listen(message.action, message.rate);
        return Promise.resolve({ speaking });
      case "listenState":
        return Promise.resolve({ speaking: speechSynthesis.speaking });
      case "renameTab":
        customTitle = message.title || null;
        if (customTitle) {
          document.title = customTitle;
        }
        return Promise.resolve(true);
      case "volume":
        volume = message.value;
        applyVolume();
        return Promise.resolve(true);
      case "hints":
        startHints(false);
        return undefined;
      case "themeColor": {
        const meta = document.querySelector("meta[name=theme-color]");
        if (meta && meta.content) {
          return Promise.resolve(meta.content);
        }
        const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
        return Promise.resolve(bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) ? bg : "");
      }
      default:
        return undefined;
    }
  });

  // --- start ---------------------------------------------------------------------------------------
  async function load() {
    S = await WrenSettings.get();
    ({ bedtimeNow: bedNow = false } = await browser.storage.local.get("bedtimeNow"));
    applyShade();
  }
  browser.storage.onChanged.addListener(changes => {
    if (changes.settings || changes.bedtimeNow) {
      load();
    }
  });

  // how heavy this page is, for the little weather sign on the toolbar
  setTimeout(() => {
    const entries = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    browser.runtime.sendMessage({
      type: "pageStats",
      stats: {
        requests: entries.length,
        bytes: entries.reduce((n, e) => n + (e.transferSize || 0), 0) + (nav ? nav.transferSize || 0 : 0),
        nodes: document.getElementsByTagName("*").length,
        scripts: document.scripts.length,
        loadMs: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : 0,
      },
    }).catch(() => {});
  }, 3500);
  load().then(() => {
    paintHighlights();
    setTimeout(offerDrafts, 1200);
  });
  setInterval(applyShade, 60000);
})();
