// Tiny IndexedDB key-value store. The whole kit (cards + pieces + art) is saved here, so it
// survives reloads and works offline on flaky classroom wifi. localStorage is too small for images.
const DB = 'kit-forge', STORE = 'kv';
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const get = key => tx('readonly', s => s.get(key)).catch(() => undefined);
export const set = (key, value) => tx('readwrite', s => s.put(value, key));
export const del = key => tx('readwrite', s => s.delete(key));
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
