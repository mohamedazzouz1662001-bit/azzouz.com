/* archive.mjs — أرشيف دائم فـIndexedDB: كيخزن كل مرجع (بالمقتطف) لكل سؤال */

const DB_NAME = 'azzouz-archive-v1';
const STORE = 'answers';

function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no-idb'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const norm = q => String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function archiveAnswer(question, refs, meta = {}) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        key: norm(question),
        question,
        ts: Date.now(),
        count: (refs || []).length,
        refs: refs || [],
        meta
      });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch (e) { return false; }
}

export async function getArchived(question) {
  try {
    const db = await openDB();
    const out = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(norm(question));
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return out;
  } catch (e) { return null; }
}

export async function archiveCount() {
  try {
    const db = await openDB();
    const n = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => res(req.result || 0);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return n;
  } catch (e) { return 0; }
}

export async function recentArchived(limit = 20) {
  try {
    const db = await openDB();
    const rows = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
  } catch (e) { return []; }
}
