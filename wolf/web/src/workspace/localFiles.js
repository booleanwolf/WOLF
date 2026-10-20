// Files kept on this device, in the browser's IndexedDB. The server only knows their name and size
// until the user syncs them. Records: { key, entityId, name, blob, addedAt }.
import { useEffect, useState } from 'react';
import { VIEWABLE } from './meta.js';

const DB = 'wolf-files';
const STORE = 'files';
let opening = null;

function db() {
  opening ||= new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser cannot keep files on the device'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('entity', 'entityId');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Could not open this device’s file storage. Private windows may block it.'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error?.name === 'QuotaExceededError'
      ? new Error('This device is out of space for files')
      : new Error('Could not save the file on this device'));
  });
}

export const putLocal = (rec) => run('readwrite', (s) => s.put(rec));
export const getLocal = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);
export const deleteLocal = (key) => run('readwrite', (s) => s.delete(key)).catch(() => {});
const localOf = (entityId) => run('readonly', (s) => s.index('entity').getAll(entityId)).catch(() => []);

export const newKey = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/**
 * Adds blob URLs to the files this device holds: { ...file, localUrl }.
 * Also forgets local copies of files that were deleted elsewhere.
 */
export function useLocalFiles(entityId, files) {
  const [urls, setUrls] = useState({});
  const sig = files.map((f) => `${f.id}:${f.localKey}`).join();

  useEffect(() => {
    let alive = true;
    const made = [];
    localOf(entityId).then((recs) => {
      if (!alive) return;
      const byKey = new Map(files.filter((f) => f.localKey).map((f) => [f.localKey, f]));
      const next = {};
      for (const r of recs) {
        const f = byKey.get(r.key);
        if (!f) {
          // Only clean up once the list is loaded, and never a file added a moment ago that the list may not show yet.
          if (files.length && Date.now() - r.addedAt > 60_000) deleteLocal(r.key);
          continue;
        }
        // Blob URLs run with Wolf's origin, so only formats the browser shows safely keep their type.
        // Anything else (HTML, SVG, slides...) becomes a plain download.
        const url = URL.createObjectURL(new Blob([r.blob], { type: VIEWABLE.has(f.mime) ? f.mime : 'application/octet-stream' }));
        made.push(url);
        next[r.key] = url;
      }
      setUrls(next);
    });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [entityId, sig]);

  return files.map((f) => (f.localKey && urls[f.localKey] ? { ...f, localUrl: urls[f.localKey] } : f));
}
