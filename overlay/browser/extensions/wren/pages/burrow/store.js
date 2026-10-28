// Keeps the encrypted vault blob. Only ciphertext ever lands here.
// In the desktop app it is a file on disk (through the shell); on the web it is IndexedDB.

const tauri = globalThis.__TAURI__?.core;

const DB = "burrow";
const KEY = "vault";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("kv", mode);
    const req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const isDesktop = Boolean(tauri);

export async function loadBlob() {
  if (tauri) {
    const text = await tauri.invoke("load_vault");
    return text ? JSON.parse(text) : null;
  }
  return run("readonly", (s) => s.get(KEY)).then((v) => v || null);
}

export async function saveBlob(blob) {
  if (tauri) return tauri.invoke("save_vault", { json: JSON.stringify(blob) });
  return run("readwrite", (s) => s.put(blob, KEY));
}

export const where = () => (tauri ? tauri.invoke("data_location") : Promise.resolve("this browser"));
