// burrow vault crypto. Plain WebCrypto plus Argon2id (vendored hash-wasm).
//
// master password --argon2id--> 32 bytes --hkdf--> enc key, auth key
// random data key (32 bytes) encrypts the vault; the enc key and the
// recovery key each wrap a copy of it. Changing the password rewraps only
// the data key. Nothing here touches the network or storage.

const enc = new TextEncoder();
const dec = new TextDecoder();
const AAD = enc.encode("burrow1");
const subtle = () => globalThis.crypto.subtle;

export const DEFAULT_KDF = { alg: "argon2id", m: 65536, t: 3, p: 1 };

// ---- small helpers ----

export function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---- recovery key: 160 bits as base32 in groups of five ----

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

export function newRecoveryKey() {
  const bytes = rand(20);
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{1,5}/g).join("-");
}

export function parseRecoveryKey(text) {
  const clean = String(text).toLowerCase().replace(/[^a-z2-7]/g, "");
  if (clean.length !== 32) throw new Error("that recovery key looks incomplete");
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of clean) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ---- key derivation ----

async function argon(password, salt, kdf) {
  const { argon2id } = globalThis.hashwasm;
  return argon2id({
    password: enc.encode(password.normalize("NFKC")),
    salt,
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: "binary",
  });
}

async function hkdf(secret, info) {
  const base = await subtle().importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
    base,
    256
  );
  return new Uint8Array(bits);
}

async function aesKey(raw, usages) {
  return subtle().importKey("raw", raw, "AES-GCM", false, usages);
}

async function seal(rawKey, bytes) {
  const iv = rand(12);
  const key = await aesKey(rawKey, ["encrypt"]);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, bytes)
  );
  return { iv: b64(iv), ct: b64(ct) };
}

async function open(rawKey, box) {
  const key = await aesKey(rawKey, ["decrypt"]);
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv: unb64(box.iv), additionalData: AAD },
        key,
        unb64(box.ct)
      )
    );
  } catch {
    throw new Error("wrong password or damaged vault");
  }
}

async function passwordKeys(password, salt, kdf) {
  const master = await argon(password, salt, kdf);
  const encKey = await hkdf(master, "burrow enc");
  const authKey = await hkdf(master, "burrow auth");
  master.fill(0);
  return { encKey, authKey };
}

// ---- sessions ----

function makeSession(dataKey) {
  return {
    dataKey,
    lock() {
      this.dataKey.fill(0);
      this.dataKey = null;
    },
  };
}

function need(session) {
  if (!session || !session.dataKey) throw new Error("the vault is locked");
  return session.dataKey;
}

// ---- public api ----

// Makes a brand new vault. Returns the blob to store, the recovery key to
// show once, and an unlocked session.
export async function createVault(password, data = { entries: [] }, kdf = DEFAULT_KDF) {
  if (!password) throw new Error("choose a master password");
  const salt = rand(16);
  const dataKey = rand(32);
  const { encKey, authKey } = await passwordKeys(password, salt, kdf);

  const recoveryKey = newRecoveryKey();
  const recoveryWrapKey = await hkdf(parseRecoveryKey(recoveryKey), "burrow recovery");

  const blob = {
    v: 1,
    version: 1,
    kdf: { ...kdf, salt: b64(salt) },
    wrapPw: await seal(encKey, dataKey),
    wrapRecovery: await seal(recoveryWrapKey, dataKey),
    data: await seal(dataKey, enc.encode(JSON.stringify(data))),
  };
  encKey.fill(0);
  recoveryWrapKey.fill(0);
  return { blob, recoveryKey, session: makeSession(dataKey), authKey };
}

export async function unlock(blob, password) {
  const salt = unb64(blob.kdf.salt);
  const { encKey, authKey } = await passwordKeys(password, salt, blob.kdf);
  try {
    const dataKey = await open(encKey, blob.wrapPw);
    return { session: makeSession(dataKey), authKey };
  } finally {
    encKey.fill(0);
  }
}

export async function unlockWithRecovery(blob, recoveryKey) {
  const wrap = await hkdf(parseRecoveryKey(recoveryKey), "burrow recovery");
  try {
    const dataKey = await open(wrap, blob.wrapRecovery);
    return { session: makeSession(dataKey) };
  } catch {
    throw new Error("that recovery key does not open this vault");
  } finally {
    wrap.fill(0);
  }
}

export async function readData(blob, session) {
  const bytes = await open(need(session), blob.data);
  return JSON.parse(dec.decode(bytes));
}

// Returns a new blob holding `data`. The old blob is left alone.
export async function writeData(blob, session, data) {
  return {
    ...blob,
    version: blob.version + 1,
    data: await seal(need(session), enc.encode(JSON.stringify(data))),
  };
}

// Rewraps the data key under a new master password (and a new salt).
export async function changePassword(blob, session, newPassword, kdf = blob.kdf) {
  if (!newPassword) throw new Error("choose a master password");
  const dataKey = need(session);
  const salt = rand(16);
  const { encKey, authKey } = await passwordKeys(newPassword, salt, kdf);
  const next = {
    ...blob,
    version: blob.version + 1,
    kdf: { alg: kdf.alg, m: kdf.m, t: kdf.t, p: kdf.p, salt: b64(salt) },
    wrapPw: await seal(encKey, dataKey),
  };
  encKey.fill(0);
  return { blob: next, authKey };
}

// Makes a fresh recovery key for an unlocked vault.
export async function newRecovery(blob, session) {
  const dataKey = need(session);
  const recoveryKey = newRecoveryKey();
  const wrap = await hkdf(parseRecoveryKey(recoveryKey), "burrow recovery");
  const next = {
    ...blob,
    version: blob.version + 1,
    wrapRecovery: await seal(wrap, dataKey),
  };
  wrap.fill(0);
  return { blob: next, recoveryKey };
}
