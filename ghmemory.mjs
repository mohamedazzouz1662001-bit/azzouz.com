/* ghmemory.mjs — ذاكرة كتتجدد من GitHub Actions بلا فلوس */

const KEY = 'azzouz-gh-memory-v1';

const norm = s => String(s || '').toLowerCase().replace(/[؟?،,.:؛;!]/g, ' ').replace(/\s+/g, ' ').trim();

export function loadGhMemory() {
  fetch('data/memory.json?t=' + Date.now())
    .then(r => r.json())
    .then(d => {
      if (d && Array.isArray(d.entries)) {
        try { localStorage.setItem(KEY, JSON.stringify(d.entries)); } catch (e) {}
      }
    })
    .catch(() => {});
}

export function ghLookup(question) {
  const q = norm(question);
  if (q.length < 3) return null;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return null; }
  let best = null, bestScore = 0;
  for (const e of list) {
    const t = norm(e.topic);
    if (!t) continue;
    let score = 0;
    if (t === q) score = 100;
    else if (q.includes(t)) score = 60 + t.length;
    else {
      const words = t.split(' ').filter(w => w.length > 3);
      const hit = words.filter(w => q.includes(w)).length;
      if (words.length && hit) score = (hit / words.length) * 50;
    }
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore >= 50 ? best : null;
}
