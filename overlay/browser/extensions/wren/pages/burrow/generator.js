// Random passwords and passphrases. Uses rejection sampling so every choice is equally likely.

import { WORDS } from "./words.js";

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*-_=+?",
};

function pick(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

export function generate({ length = 20, lower = true, upper = true, digits = true, symbols = true } = {}) {
  const on = Object.entries({ lower, upper, digits, symbols })
    .filter(([, v]) => v)
    .map(([k]) => SETS[k]);
  if (!on.length) throw new Error("pick at least one kind of character");
  length = Math.max(length, on.length);
  const all = on.join("");
  const out = on.map((s) => s[pick(s.length)]); // one of each chosen kind
  while (out.length < length) out.push(all[pick(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

// Words joined by dashes, e.g. "otter-lantern-moss-quill-heron-brook-sage". Each word is 8 bits.
export function passphrase({ words = 7, capitalize = false, number = false } = {}) {
  words = Math.min(Math.max(words, 4), 12);
  const out = Array.from({ length: words }, () => WORDS[pick(WORDS.length)]);
  const text = out.map((w) => (capitalize ? w[0].toUpperCase() + w.slice(1) : w));
  if (number) text.push(String(pick(100)));
  return text.join("-");
}

export const passphraseBits = (words = 7, number = false) => words * 8 + (number ? Math.log2(100) : 0);

// Rough strength in bits, from the pool size. Good enough for a hint.
export function bits(password) {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 20;
  if (!pool) return 0;
  const unique = new Set(password).size;
  return Math.round(Math.log2(pool) * Math.min(password.length, unique * 2));
}

export function strength(password) {
  const b = bits(password);
  if (b < 40) return { label: "weak", level: 1 };
  if (b < 64) return { label: "fine", level: 2 };
  return { label: "strong", level: 3 };
}
