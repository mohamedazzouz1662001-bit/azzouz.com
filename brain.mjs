/* brain.mjs — عقل بيتعلم: مفردات، ترابطات، وذكريات كترجع فالجواب */

const DB_NAME = 'azzouz-brain-v1';

function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no-idb'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('mem')) db.createObjectStore('mem', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('vocab')) db.createObjectStore('vocab', { keyPath: 'w' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

const STOP = new Set(['هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'على', 'إلى', 'الى', 'عن', 'من', 'في', 'مع', 'أن', 'ان', 'كان', 'كانت', 'بين', 'حيث', 'كما', 'قد', 'لا', 'ما', 'هو', 'هي', 'ثم', 'أو', 'او', 'كل', 'بعض', 'غير', 'حتى', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'were', 'was', 'are', 'you', 'your', 'http', 'https', 'www', 'com', 'html']);

export function normalize(w) {
  return String(w || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function wordsRaw(text) {
  const m = new Map();
  for (const raw of String(text || '').split(/[^\p{L}\p{N}]+/u)) {
    const w = normalize(raw);
    if (w.length > 3 && w.length < 24 && !STOP.has(w) && !/^\d+$/.test(w) && !m.has(w)) m.set(w, raw.trim().slice(0, 26));
  }
  return m;
}

export function words(text) {
  const out = new Set();
  for (const raw of String(text || '').split(/[^\p{L}\p{N}]+/u)) {
    const w = normalize(raw);
    if (w.length > 3 && w.length < 24 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return [...out];
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!؟?])\s+|\n+/)
    .map(s => s.replace(/\*/g, '').trim())
    .filter(s => s.length > 45 && s.length < 300)
    .slice(0, 4);
}

export async function learn({ question, answer, refs = [], terms = [] }) {
  try {
    const db = await openDB();
    const q = normalize(question) || String(question || '').trim();
    const rawMap = new Map();
    for (const src of [question, answer, ...terms]) for (const [w, d] of wordsRaw(src)) if (!rawMap.has(w)) rawMap.set(w, d);
    const ws = [...rawMap.keys()].slice(0, 60);
    const now = Date.now();

    await new Promise((res, rej) => {
      const s = tx(db, 'mem', 'readwrite');
      s.put({
        key: q,
        question,
        ts: now,
        facts: sentences(answer),
        words: ws,
        refs: (refs || []).slice(0, 20).map(r => ({ title: r.title, url: r.url }))
      });
      const v = tx(db, 'vocab', 'readwrite');
      ws.forEach((w, idx) => {
        const req = v.get(w);
        req.onsuccess = () => {
          const rec = req.result || { w, d: rawMap.get(w) || w, c: 0, first: now, last: now, pairs: {} };
          if (!rec.d) rec.d = rawMap.get(w) || w;
          rec.c = (rec.c || 0) + 1;
          rec.last = now;
          for (const other of ws.slice(0, 24)) {
            if (other === w) continue;
            rec.pairs[other] = (rec.pairs[other] || 0) + 1;
          }
          const keys = Object.keys(rec.pairs);
          if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete rec.pairs[k];
          v.put(rec);
        };
      });
      s.transaction.oncomplete = res;
      s.transaction.onerror = () => rej(s.transaction.error);
    });
    db.close();
    return true;
  } catch (e) { return false; }
}

export async function recall(question, limit = 3) {
  try {
    const db = await openDB();
    const qw = words(question);
    if (!qw.length) { db.close(); return { facts: [], score: 0 }; }
    const rows = await new Promise((res, rej) => {
      const req = tx(db, 'mem').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    const scored = rows.map(r => {
      const set = new Set(r.words || []);
      let hit = 0;
      for (const w of qw) if (set.has(w)) hit++;
      return { r, sc: hit / qw.length };
    }).filter(x => x.sc >= 0.5).sort((a, b) => b.sc - a.sc || b.r.ts - a.r.ts);

    const facts = [];
    for (const { r, sc } of scored) {
      const fact = (r.facts && r.facts[0]) || '';
      if (fact && !facts.some(f => f.text === fact)) facts.push({ text: fact, q: r.question, sc, ts: r.ts });
      if (facts.length >= limit) break;
    }
    return { facts, score: scored.length ? scored[0].sc : 0, matches: scored.length };
  } catch (e) { return { facts: [], score: 0, matches: 0 }; }
}

export async function brainStats() {
  try {
    const db = await openDB();
    const [mem, voc] = await Promise.all([
      new Promise((res, rej) => { const r = tx(db, 'mem').count(); r.onsuccess = () => res(r.result || 0); r.onerror = () => rej(r.error); }),
      new Promise((res, rej) => { const r = tx(db, 'vocab').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); })
    ]);
    db.close();
    const top = voc.sort((a, b) => b.c - a.c).slice(0, 24).map(v => ({ w: v.d || v.w, k: v.w, c: v.c }));
    const links = voc.reduce((n, v) => n + Object.keys(v.pairs || {}).length, 0);
    return { memories: mem, concepts: voc.length, top, links };
  } catch (e) { return { memories: 0, concepts: 0, top: [], links: 0 }; }
}

export async function related(term, limit = 8) {
  try {
    const db = await openDB();
    const rec = await new Promise((res, rej) => {
      const r = tx(db, 'vocab').get(normalize(term));
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    if (!rec) return [];
    return Object.entries(rec.pairs || {}).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w, c]) => ({ w, c }));
  } catch (e) { return []; }
}
