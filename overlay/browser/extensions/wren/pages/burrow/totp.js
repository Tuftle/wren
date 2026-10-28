// One-time codes (RFC 6238). Accepts a bare base32 secret or an otpauth:// link.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function secretFrom(input) {
  input = String(input || "").trim();
  if (input.toLowerCase().startsWith("otpauth://")) {
    try { input = new URL(input).searchParams.get("secret") || ""; } catch { return ""; }
  }
  return input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}

export function decodeBase32(s) {
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("that is not a valid one-time secret");
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function code(input, nowMs = Date.now(), { digits = 6, period = 30 } = {}) {
  const secret = decodeBase32(secretFrom(input));
  if (!secret.length) throw new Error("that is not a valid one-time secret");
  const counter = Math.floor(nowMs / 1000 / period);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = mac[19] & 15;
  const n = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

export const secondsLeft = (nowMs = Date.now(), period = 30) => period - (Math.floor(nowMs / 1000) % period);
