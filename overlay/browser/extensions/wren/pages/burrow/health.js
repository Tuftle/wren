// Checks on the vault's own passwords. The breach check is opt-in: it sends only
// the first five characters of each password's SHA-1 to haveibeenpwned's range api.

import { strength } from "./generator.js";

export function report(entries) {
  const byPass = new Map();
  for (const e of entries) {
    if (!e.pass) continue;
    if (!byPass.has(e.pass)) byPass.set(e.pass, []);
    byPass.get(e.pass).push(e);
  }
  const weak = entries.filter((e) => e.pass && (e.pass.length < 8 || strength(e.pass).level === 1));
  const reused = [...byPass.values()].filter((g) => g.length > 1);
  return { weak, reused };
}

async function sha1Hex(text) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Returns [{ entry, count }] for passwords found in known breaches.
export async function breached(entries, fetchImpl = fetch) {
  const hashes = new Map(); // password -> hash
  const prefixes = new Map(); // prefix -> Set(suffix)
  for (const e of entries) {
    if (!e.pass || hashes.has(e.pass)) continue;
    const h = await sha1Hex(e.pass);
    hashes.set(e.pass, h);
    const p = h.slice(0, 5);
    if (!prefixes.has(p)) prefixes.set(p, new Map());
  }
  for (const p of prefixes.keys()) {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${p}`, { headers: { "Add-Padding": "true" } });
    if (!res.ok) throw new Error("the breach service did not answer");
    for (const line of (await res.text()).split(/\r?\n/)) {
      const [suffix, n] = line.split(":");
      if (suffix && +n > 0) prefixes.get(p).set(suffix.trim(), +n);
    }
  }
  const hits = [];
  for (const e of entries) {
    const h = hashes.get(e.pass);
    const n = h && prefixes.get(h.slice(0, 5)).get(h.slice(5));
    if (n) hits.push({ entry: e, count: n });
  }
  return hits;
}
