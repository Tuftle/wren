// Turns other managers' exports into burrow entries. Nothing here touches the network.

export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows) {
  const q = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map((v) => q(String(v ?? ""))).join(",")).join("\r\n") + "\r\n";
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || ""; }
}

function entry(site, user, pass, notes = "", totp = "", url = "") {
  return {
    id: globalThis.crypto.randomUUID(),
    site, user, pass, notes, totp, url,
    changed: Date.now(),
  };
}

// Chrome, Edge, Brave and Firefox password exports.
export function fromBrowserCsv(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const col = (...names) => head.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const iName = col("name"), iUrl = col("url"), iUser = col("username"), iPass = col("password"), iNote = col("note", "notes");
  if (iPass < 0 || (iUrl < 0 && iName < 0)) throw new Error("this does not look like a browser password export");
  return rows
    .filter((r) => r[iPass])
    .map((r) => entry(
      (iName >= 0 && r[iName]) || hostOf(r[iUrl]),
      r[iUser] ?? "",
      r[iPass],
      iNote >= 0 ? r[iNote] ?? "" : "",
      "",
      iUrl >= 0 ? r[iUrl] ?? "" : ""
    ));
}

// Bitwarden "json" export (unencrypted). Only logins are taken.
export function fromBitwarden(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("that file is not valid json"); }
  if (json.encrypted) throw new Error("this export is encrypted, export it as plain json first");
  if (!Array.isArray(json.items)) throw new Error("this does not look like a bitwarden export");
  return json.items
    .filter((i) => i.type === 1 && i.login?.password)
    .map((i) => entry(
      i.name || hostOf(i.login.uris?.[0]?.uri),
      i.login.username ?? "",
      i.login.password,
      i.notes ?? "",
      i.login.totp ?? "",
      i.login.uris?.[0]?.uri ?? ""
    ));
}

export function detectAndParse(text) {
  const t = text.trimStart();
  return t.startsWith("{") ? fromBitwarden(text) : fromBrowserCsv(text);
}

// Drops entries already in the vault (same site, user and password).
export function newOnly(existing, incoming) {
  const key = (e) => `${e.site}\u0000${e.user}\u0000${e.pass}`;
  const have = new Set(existing.map(key));
  return incoming.filter((e) => !have.has(key(e)) && have.add(key(e)));
}

export function exportCsv(entries) {
  return toCsv([
    ["name", "url", "username", "password", "note", "totp"],
    ...entries.map((e) => [e.site, e.url, e.user, e.pass, e.notes, e.totp]),
  ]);
}
