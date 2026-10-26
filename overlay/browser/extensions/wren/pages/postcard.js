/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const canvas = document.getElementById("card");
const ctx = canvas.getContext("2d");
let doc = { title: "", url: "", quote: "" };
let dark = matchMedia("(prefers-color-scheme: dark)").matches;

function wrap(text, maxWidth, maxLines) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length == maxLines) {
        break;
      }
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
  }
  if (lines.length == maxLines && words.join(" ").length > lines.join(" ").length + 3) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

function bird(x, y, s, body, wing, eye) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(62, 74, 28, 21, 0, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(42, 57, 14, 0, 7);
  ctx.fill();
  ctx.fill(new Path2D("M84 72C97 68 102 50 99 32c-1-4-7-3-7 1 0 14-6 22-17 27z"));
  ctx.fill(new Path2D("M30 54L16 52l13 8z"));
  ctx.strokeStyle = body;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M54 92v7M68 92v7"));
  ctx.fillStyle = wing;
  ctx.fill(new Path2D("M52 70c8-6 22-5 30 4-8 10-26 10-34 1 1-2 2-3 4-5z"));
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(38, 54, 2.6, 0, 7);
  ctx.fill();
  ctx.restore();
}

function render() {
  const c = dark
    ? { bg1: "#2a231c", bg2: "#17120e", text: "#e6dccd", soft: "#9a8b7a", accent: "#d9a073", line: "#3a3128", body: "#d9a073", wing: "#f4efe6", eye: "#211c17" }
    : { bg1: "#fbf8f2", bg2: "#efe6d6", text: "#3b2f25", soft: "#8a7b6b", accent: "#8a4b2a", line: "#d9cfbf", body: "#8a4b2a", wing: "#e0a870", eye: "#f4efe6" };
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.bg1);
  g.addColorStop(1, c.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // a soft glow and a thin frame
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.1, 10, W * 0.9, H * 0.1, 520);
  glow.addColorStop(0, dark ? "rgba(217,160,115,.16)" : "rgba(224,168,112,.30)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  bird(62, 46, 1.0, c.body, c.wing, c.eye);

  ctx.fillStyle = c.accent;
  ctx.font = "700 150px Georgia, serif";
  ctx.fillText("“", 190, 170);

  ctx.fillStyle = c.text;
  ctx.font = "italic 400 46px Georgia, serif";
  const lines = wrap(document.getElementById("quote").value || doc.quote, W - 330, 6);
  lines.forEach((line, i) => ctx.fillText(line, 190, 250 + i * 62));

  ctx.fillStyle = c.soft;
  ctx.font = "400 28px Georgia, serif";
  const title = wrap(doc.title || "", W - 330, 1)[0] || "";
  ctx.fillText(title, 190, H - 118);
  ctx.font = "400 24px Georgia, serif";
  ctx.fillText(((doc.url ? new URL(doc.url).hostname.replace(/^www\./, "") : "") + "  ·  " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })).toLowerCase(), 190, H - 76);
  ctx.textAlign = "right";
  ctx.fillStyle = c.accent;
  ctx.fillText("made with wren", W - 70, H - 76);
  ctx.textAlign = "left";
}

(async () => {
  ({ postcardDoc: doc = doc } = await browser.storage.local.get("postcardDoc"));
  document.getElementById("quote").value = doc.quote || "";
  render();
})();

document.getElementById("quote").addEventListener("input", render);
document.getElementById("theme").addEventListener("click", () => { dark = !dark; render(); });
document.getElementById("save").addEventListener("click", () => {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "wren-postcard.png" });
    document.body.append(a);
    a.click();
    a.remove();
    document.getElementById("state").textContent = "saved to your downloads";
  });
});
document.getElementById("copy").addEventListener("click", () => {
  canvas.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      document.getElementById("state").textContent = "copied";
    } catch (e) {
      document.getElementById("state").textContent = "couldn't copy: use save instead";
    }
  });
});
