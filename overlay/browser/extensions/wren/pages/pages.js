/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#tabs button").forEach(o => o.classList.toggle("on", o == b));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id == b.dataset.tab));
}));

const store = {
  async get(key, fallback) {
    const data = await browser.storage.local.get(key);
    return data[key] ?? fallback;
  },
  set: (key, value) => browser.storage.local.set({ [key]: value }),
};

// --- notes ---------------------------------------------------------------------------------------
(async () => {
  let docs = await store.get("pageDocs", []);
  const wanted = /^#note-(\d+)$/.exec(location.hash);
  let current = wanted && docs.some(d => d.id == wanted[1]) ? Number(wanted[1]) : docs[0]?.id ?? null;
  const title = document.getElementById("noteTitle");
  const body = document.getElementById("noteBody");
  const list = document.getElementById("noteList");
  const saved = document.getElementById("noteSaved");

  function draw() {
    list.textContent = "";
    docs.forEach(d => list.append(wrenEl("li", { class: d.id == current ? "on" : "", onclick: () => { current = d.id; draw(); } },
      wrenEl("a", { href: "#", text: d.title || "untitled", onclick: e => e.preventDefault() }))));
    const doc = docs.find(d => d.id == current);
    title.value = doc?.title || "";
    body.value = doc?.body || "";
    title.disabled = body.disabled = !doc;
  }
  function make() {
    const doc = { id: Date.now(), title: "", body: "" };
    docs.unshift(doc);
    current = doc.id;
    draw();
    title.focus();
  }
  let timer;
  function changed() {
    const doc = docs.find(d => d.id == current);
    if (!doc) {
      return;
    }
    doc.title = title.value;
    doc.body = body.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await store.set("pageDocs", docs);
      saved.textContent = "saved";
      setTimeout(() => { saved.textContent = ""; }, 1000);
      list.querySelector("li.on a").textContent = doc.title || "untitled";
    }, 350);
  }
  title.addEventListener("input", changed);
  body.addEventListener("input", changed);
  document.getElementById("newNote").addEventListener("click", make);
  document.getElementById("deleteNote").addEventListener("click", async () => {
    docs = docs.filter(d => d.id != current);
    current = docs[0]?.id ?? null;
    await store.set("pageDocs", docs);
    draw();
  });
  document.getElementById("exportNote").addEventListener("click", () => {
    const doc = docs.find(d => d.id == current);
    if (doc) {
      wrenSaveFile((doc.title || "note").replace(/[^\w\- ]+/g, "") + ".txt", doc.body, "text/plain");
    }
  });
  document.getElementById("importNote").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (file) {
      make();
      title.value = file.name.replace(/\.\w+$/, "");
      body.value = await file.text();
      changed();
    }
  });
  if (!docs.length) {
    make();
  } else {
    draw();
  }
})();

// --- sheet --------------------------------------------------------------------------------------------
(async () => {
  const COLS = 12;
  let rows = await store.get("pageSheet", Array.from({ length: 30 }, () => Array(COLS).fill("")));
  const grid = document.getElementById("grid");
  const letter = i => String.fromCharCode(65 + i);

  function cell(ref, seen = new Set()) {
    const m = /^([A-L])(\d+)$/.exec(ref);
    if (!m) {
      return 0;
    }
    return value(rows[Number(m[2]) - 1]?.[m[1].charCodeAt(0) - 65] ?? "", ref, seen);
  }
  function range(a, b, seen) {
    const [, c1, r1] = /^([A-L])(\d+)$/.exec(a) || [];
    const [, c2, r2] = /^([A-L])(\d+)$/.exec(b) || [];
    const out = [];
    if (!c1 || !c2) {
      return out;
    }
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1.charCodeAt(0), c2.charCodeAt(0)); c <= Math.max(c1.charCodeAt(0), c2.charCodeAt(0)); c++) {
        out.push(cell(String.fromCharCode(c) + r, seen));
      }
    }
    return out;
  }
  function value(raw, ref, seen = new Set()) {
    if (typeof raw != "string" || raw[0] != "=") {
      const n = Number(raw);
      return raw !== "" && !Number.isNaN(n) ? n : raw === "" ? 0 : raw;
    }
    if (seen.has(ref)) {
      return NaN;
    }
    const next = new Set(seen).add(ref);
    let expr = raw.slice(1).toUpperCase();
    expr = expr.replace(/(SUM|AVERAGE|MIN|MAX)\(([A-L]\d+):([A-L]\d+)\)/g, (_, fn, a, b) => {
      const v = range(a, b, next).map(Number).filter(n => !Number.isNaN(n));
      if (!v.length) {
        return "0";
      }
      return String({ SUM: v.reduce((x, y) => x + y, 0), AVERAGE: v.reduce((x, y) => x + y, 0) / v.length, MIN: Math.min(...v), MAX: Math.max(...v) }[fn]);
    });
    expr = expr.replace(/[A-L]\d+/g, r => String(Number(cell(r, next)) || 0));
    if (!/^[\d+\-*/().\s]*$/.test(expr)) {
      return NaN;
    }
    return calc(expr || "0");
  }
  // + - * / and brackets, worked out by hand because extension pages may not use eval
  function calc(text) {
    const tokens = text.match(/\d+\.?\d*|\.\d+|[()+\-*/]/g) || [];
    let i = 0;
    const atom = () => {
      const t = tokens[i++];
      if (t == "(") {
        const v = sum();
        i++;
        return v;
      }
      if (t == "-") {
        return -atom();
      }
      if (t == "+") {
        return atom();
      }
      return Number(t);
    };
    const product = () => {
      let v = atom();
      while (tokens[i] == "*" || tokens[i] == "/") {
        const op = tokens[i++];
        const r = atom();
        v = op == "*" ? v * r : v / r;
      }
      return v;
    };
    const sum = () => {
      let v = product();
      while (tokens[i] == "+" || tokens[i] == "-") {
        const op = tokens[i++];
        const r = product();
        v = op == "+" ? v + r : v - r;
      }
      return v;
    };
    const result = sum();
    return i >= tokens.length ? result : NaN;
  }
  function show(input, r, c) {
    const raw = rows[r][c];
    input.value = input === document.activeElement ? raw : raw[0] == "=" ? String(Math.round(value(raw, letter(c) + (r + 1)) * 1e6) / 1e6) : raw;
  }
  function build() {
    grid.textContent = "";
    const head = wrenEl("tr", {}, wrenEl("th", { class: "row" }));
    for (let c = 0; c < COLS; c++) {
      head.append(wrenEl("th", { text: letter(c) }));
    }
    grid.append(head);
    rows.forEach((row, r) => {
      const tr = wrenEl("tr", {}, wrenEl("th", { class: "row", text: String(r + 1) }));
      row.forEach((_, c) => {
        const input = wrenEl("input", { type: "text" });
        show(input, r, c);
        input.addEventListener("focus", () => { input.value = rows[r][c]; });
        input.addEventListener("input", () => { rows[r][c] = input.value; });
        input.addEventListener("blur", () => { store.set("pageSheet", rows); refresh(); });
        tr.append(wrenEl("td", {}, input));
      });
      grid.append(tr);
    });
  }
  function refresh() {
    grid.querySelectorAll("tr").forEach((tr, r) => {
      if (r) {
        tr.querySelectorAll("input").forEach((input, c) => { if (input !== document.activeElement) { show(input, r - 1, c); } });
      }
    });
  }
  document.getElementById("addRows").addEventListener("click", () => {
    rows.push(...Array.from({ length: 20 }, () => Array(COLS).fill("")));
    store.set("pageSheet", rows);
    build();
  });
  document.getElementById("exportCsv").addEventListener("click", () => {
    const csv = rows.map(row => row.map((raw, c) => {
      const v = raw[0] == "=" ? value(raw, "x") : raw;
      return /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
    }).join(",")).join("\n");
    wrenSaveFile("sheet.csv", csv, "text/csv");
  });
  document.getElementById("importCsv").addEventListener("change", async e => {
    const text = await e.target.files[0]?.text();
    if (text == null) {
      return;
    }
    const parsed = text.split(/\r?\n/).filter(Boolean).map(line => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).filter(Boolean)
      .map(s => s.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
    rows = Array.from({ length: Math.max(30, parsed.length) }, (_, r) => Array.from({ length: COLS }, (_, c) => parsed[r]?.[c] ?? ""));
    store.set("pageSheet", rows);
    build();
  });
  build();
})();

// --- draw ------------------------------------------------------------------------------------------------
(async () => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const undo = [];
  let erasing = false;
  let drawing = false;
  const saved = await store.get("pageDrawing", null);
  if (saved) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = saved;
  }
  const point = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  canvas.addEventListener("pointerdown", e => {
    undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.length > 25) {
      undo.shift();
    }
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...point(e));
  });
  canvas.addEventListener("pointermove", e => {
    if (!drawing) {
      return;
    }
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = Number(document.getElementById("size").value) * (e.pressure && e.pointerType == "pen" ? e.pressure * 1.6 : 1);
    ctx.strokeStyle = erasing ? "#fffdf8" : document.getElementById("ink").value;
    ctx.lineTo(...point(e));
    ctx.stroke();
  });
  const done = () => {
    if (drawing) {
      drawing = false;
      store.set("pageDrawing", canvas.toDataURL("image/png"));
    }
  };
  canvas.addEventListener("pointerup", done);
  canvas.addEventListener("pointercancel", done);
  document.getElementById("eraser").addEventListener("click", e => {
    erasing = !erasing;
    e.target.textContent = erasing ? "pen" : "eraser";
  });
  document.getElementById("undo").addEventListener("click", () => {
    const last = undo.pop();
    if (last) {
      ctx.putImageData(last, 0, 0);
      store.set("pageDrawing", canvas.toDataURL("image/png"));
    }
  });
  document.getElementById("clear").addEventListener("click", () => {
    undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    store.set("pageDrawing", canvas.toDataURL("image/png"));
  });
  document.getElementById("exportPng").addEventListener("click", () => {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: "drawing.png" });
      document.body.append(a);
      a.click();
      a.remove();
    });
  });
})();
