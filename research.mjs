/* research.mjs — طبقة البحث الشامل لـ Azzouz AI
   Usage:
     import { advancedResearch, learn, relatedLearning, formatAnswer } from './research.mjs';
     const res = await advancedResearch({ question, workerBase: 'https://<worker>.workers.dev' });
   يعيد { text, citations, refs, learnTopics } أو null إذا فشل.
*/

const WORKER_DEFAULT = 'https://azzouz-research.YOUR-SUBDOMAIN.workers.dev';
const LEARN_KEY = 'azzouz-learn-v1';
const MAX_LEARN = 400;

/* ---------- تخزين التعلّم (محلي فقط) ---------- */
function store() {
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === 'object' ? d : { entries: [], topics: {}, sources: {} };
  } catch {
    return { entries: [], topics: {}, sources: {} };
  }
}
function persist(d) {
  try { localStorage.setItem(LEARN_KEY, JSON.stringify(d)); } catch {}
}

const STOP = new Set('من في على إلى عن مع هذا هذه ذلك التي الذي هو هي كان تكون يتم حول بين بعد قبل عند أو و ثم كما إن أن لا ما قد كل the a an of to in on for and or is are was were with that this from by at as it its'.split(/\s+/));
export function tokens(text) {
  return [...new Set(String(text || '')
    .toLocaleLowerCase('ar')
    .replace(/[\u0640\u064b-\u065f\u06d6-\u06ed]/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP.has(t)))];
}

/* ---------- الاستخراج والترتيب ---------- */
export function parseCitations(article) {
  return [...new Set([...String(article).matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

export function buildRefs(article, sources) {
  const used = parseCitations(article);
  const byN = new Map(sources.map((s) => [s.n, s]));
  const picked = used.map((n) => byN.get(n)).filter(Boolean);
  const list = picked.length ? picked : sources.slice(0, 5);
  return list.map((s, i) => ({ n: i + 1, title: s.title, url: s.url, engine: s.engine }));
}

export function formatAnswer(article, refs) {
  const lines = refs.map((r) => `${r.n}. ${r.title}\n${r.url}`).join('\n');
  return `${String(article).trim()}\n\nالمراجع:\n${lines}`;
}

/* ---------- التعلم من البحث ---------- */
export function learn({ question, article, refs = [] }) {
  const d = store();
  const qt = tokens(question);
  const at = tokens(article);
  const entry = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    q: String(question).slice(0, 300),
    a: String(article).slice(0, 4000),
    refs: refs.slice(0, 12),
    tokens: [...new Set([...qt, ...at])].slice(0, 120),
    createdAt: Date.now(),
  };
  d.entries.unshift(entry);
  d.entries = d.entries.slice(0, MAX_LEARN);
  for (const t of entry.tokens) d.topics[t] = (d.topics[t] || 0) + 1;
  for (const r of refs) {
    const host = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return null; } })();
    if (!host) continue;
    const s = d.sources[host] || { hits: 0, useful: 0 };
    s.hits += 1;
    if (refs.indexOf(r) < 5) s.useful += 1;
    d.sources[host] = s;
  }
  persist(d);
  return entry;
}

export function relatedLearning(question, limit = 3) {
  const d = store();
  const qt = new Set(tokens(question));
  if (!qt.size) return [];
  return d.entries
    .map((e) => {
      const overlap = e.tokens.filter((t) => qt.has(t)).length;
      return { e, score: overlap / Math.max(4, qt.size) };
    })
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score || b.e.createdAt - a.e.createdAt)
    .slice(0, limit)
    .map((x) => ({ q: x.e.q, a: x.e.a, refs: x.e.refs, score: x.score }));
}

export function topSources(limit = 8) {
  const d = store();
  return Object.entries(d.sources)
    .map(([host, s]) => ({ host, ...s, rate: s.hits ? s.useful / s.hits : 0 }))
    .sort((a, b) => b.useful - a.useful || b.rate - a.rate)
    .slice(0, limit);
}

/* ---------- البحث الشامل ---------- */
export async function advancedResearch({ question, workerBase = WORKER_DEFAULT, lang = 'ar', timeoutMs = 45000 }) {
  if (!question || question.trim().length < 3) return null;
  const base = String(workerBase).replace(/\/$/, '');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r1 = await fetch(base + '/research', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: question, lang }),
      signal: ctl.signal,
    });
    if (!r1.ok) return null;
    const { sources = [] } = await r1.json();
    if (!sources.length) return null;

    const r2 = await fetch(base + '/summarize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: question, sources, lang }),
      signal: ctl.signal,
    });
    if (!r2.ok) return null;
    const { article = '', refs: rawRefs = [] } = await r2.json();
    if (!article.trim()) return null;

    const refs = rawRefs.length
      ? rawRefs.map((s, i) => ({ n: i + 1, title: s.title, url: s.url, engine: s.engine }))
      : buildRefs(article, sources);

    const past = relatedLearning(question);
    const context = past.length
      ? `\n\nملاحظة تعلّم: لديك ${past.length} بحث سابق مرتبط (${past.map((p) => '«' + p.q.slice(0, 60) + '»').join('، ')}). تم تحديث المعرفة بدل تجاهلها.`
      : '';

    const text = formatAnswer(article, refs) + context;
    learn({ question, article, refs });

    return {
      text,
      article,
      citations: refs.map((r) => ({ title: r.title, url: r.url, sourceId: 'web', excerpt: '' })),
      refs,
      engines: sources.map((s) => s.engine),
      learned: past.length,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default { advancedResearch, learn, relatedLearning, topSources, formatAnswer, buildRefs, parseCitations };
