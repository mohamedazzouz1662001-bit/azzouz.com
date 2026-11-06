/* research.mjs v2 — بحث شامل من المتصفح مباشرة (بلا خدمة خارجية)
   المصادر: ويكيبيديا (ar/en) · Stack Exchange · Hacker News · OpenAlex ·
            Crossref · GitHub · DuckDuckGo IA
   كولها كتدعم CORS، يعني كتخدم مباشرة من GitHub Pages.
   يعطي: مقال واحد مركّب من المصادر + مراجع مرقمة فالأسفل + ذاكرة وتعلّم محلي.
*/

const TIMEOUT = 9000;
const CACHE_KEY = 'azzouz-research-cache-v2';
const LEARN_KEY = 'azzouz-learn-v2';
const MEM_KEY = 'azzouz-memory-v2';

/* ---------- أدوات ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#34': '"', '#38': '&' };
const strip = (s = '') => String(s)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? ' ')
  .replace(/\s+/g, ' ').trim();
const cut = (s, n = 260) => (s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + '…' : s);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function getJSON(url, signal) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  if (signal) signal.addEventListener('abort', () => c.abort());
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json', 'User-Agent': 'AzzouzResearch/2.0 (browser)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------- المصادر ---------- */
const SOURCES = [
  {
    id: 'wikipedia-ar', label: 'ويكيبيديا العربية', weight: 1.15, kind: 'general',
    run: async (q, sig) => {
      const d = await getJSON(`https://ar.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=4`, sig);
      return (d?.pages || []).map(p => ({
        title: p.title, url: `https://ar.wikipedia.org/wiki/${encodeURIComponent(p.key || p.title)}`,
        snippet: cut(strip(p.excerpt || p.description || ''))
      }));
    }
  },
  {
    id: 'wikipedia-en', label: 'Wikipedia (EN)', weight: 1.05, kind: 'general',
    run: async (q, sig) => {
      const d = await getJSON(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=4`, sig);
      return (d?.pages || []).map(p => ({
        title: p.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key || p.title)}`,
        snippet: cut(strip(p.excerpt || p.description || ''))
      }));
    }
  },
  {
    id: 'stackexchange', label: 'Stack Overflow / SE', weight: 1.0, kind: 'dev',
    run: async (q, sig) => {
      const d = await getJSON(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5`, sig);
      return (d?.items || []).map(it => ({
        title: strip(it.title), url: it.question_id ? `https://stackoverflow.com/q/${it.question_id}` : 'https://stackoverflow.com',
        snippet: cut(strip(it.excerpt))
      }));
    }
  },
  {
    id: 'github', label: 'GitHub', weight: 0.95, kind: 'dev',
    run: async (q, sig) => {
      const d = await getJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`, sig);
      return (d?.items || []).map(r => ({
        title: r.full_name, url: r.html_url,
        snippet: cut(strip((r.description || '') + ' · ⭐ ' + r.stargazers_count + ' · ' + (r.language || '')))
      }));
    }
  },
  {
    id: 'hackernews', label: 'Hacker News', weight: 0.9, kind: 'community',
    run: async (q, sig) => {
      const d = await getJSON(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5`, sig);
      return (d?.hits || []).map(h => ({
        title: strip(h.title || ''), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: cut(strip((h.story_text || '') + ' · ' + (h.points || 0) + ' نقطة · ' + (h.num_comments || 0) + ' تعليق')),
        date: h.created_at
      }));
    }
  },
  {
    id: 'openalex', label: 'OpenAlex', weight: 1.0, kind: 'academic',
    run: async (q, sig) => {
      const d = await getJSON(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=4`, sig);
      return (d?.results || []).map(w => ({
        title: strip(w.title || ''), url: w.doi || w.id,
        snippet: cut(abstractOf(w)), date: String(w.publication_year || '')
      }));
    }
  },
  {
    id: 'crossref', label: 'Crossref', weight: 0.95, kind: 'academic',
    run: async (q, sig) => {
      const d = await getJSON(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=4&select=title,DOI,URL,abstract,issued`, sig);
      return (d?.message?.items || []).map(w => ({
        title: strip((w.title || [''])[0]), url: w.URL || ('https://doi.org/' + w.DOI),
        snippet: cut(strip(w.abstract || '')), date: String(w.issued?.['date-parts']?.[0]?.[0] || '')
      }));
    }
  },
  {
    id: 'duckduckgo', label: 'DuckDuckGo', weight: 0.8, kind: 'general',
    run: async (q, sig) => {
      const d = await getJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, sig);
      const out = [];
      if (d?.AbstractText) out.push({ title: d.Heading || q, url: d.AbstractURL || 'https://duckduckgo.com', snippet: cut(strip(d.AbstractText)) });
      (d?.RelatedTopics || []).slice(0, 4).forEach(t => {
        const it = t.FirstURL ? t : (t.Topics?.[0] || null);
        if (it?.FirstURL && it.Text) out.push({ title: cut(strip(it.Text), 70), url: it.FirstURL, snippet: cut(strip(it.Text)) });
      });
      return out;
    }
  }
];

function abstractOf(w) {
  const idx = w.abstract_inverted_index;
  if (!idx) return '';
  const words = [];
  Object.keys(idx).forEach(word => (idx[word] || []).forEach(p => (words[p] = word)));
  return cut(words.filter(Boolean).join(' '));
}

/* ---------- ذاكرة وتعلّم ---------- */
function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
export function learn() { return readJSON(LEARN_KEY, { hosts: {}, topics: [], queries: [] }); }
export function topSources(n = 3) {
  const l = learn();
  return Object.entries(l.hosts).map(([h, v]) => ({ host: h, hits: v.hits, useful: v.useful, rate: v.hits ? v.useful / v.hits : 0 }))
    .sort((a, b) => b.rate - a.rate || b.hits - a.hits).slice(0, n);
}
export function tokens(t) {
  const stop = new Set('من في على إلى عن مع هذا هذه ذلك التي الذي هو هي كان تكون يتم حول بين بعد قبل عند أو و ثم كما إن أن لا ما قد كل what the and for with from that this how why is are'.split(' '));
  return [...new Set(strip(t).toLowerCase().replace(/[\u0640\u064b-\u065f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !stop.has(w)))];
}
export function relatedLearning(q, limit = 2) {
  const qs = new Set(tokens(q));
  if (!qs.size) return [];
  const memory = readJSON(MEM_KEY, []);
  return memory.map(e => {
    const overlap = tokens(e.question + ' ' + e.answer).filter(t => qs.has(t)).length;
    return { e, score: overlap };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.e);
}
function recordLearning(q, sources, usedIds) {
  const l = learn();
  sources.forEach(s => {
    const h = host(s.url); if (!h) return;
    const e = l.hosts[h] || (l.hosts[h] = { hits: 0, useful: 0 });
    e.hits++;
    if (usedIds.has(s.n)) e.useful++;
  });
  tokens(q).slice(0, 8).forEach(t => { if (!l.topics.includes(t)) l.topics.unshift(t); });
  l.topics = l.topics.slice(0, 400);
  l.queries.unshift({ q, ts: Date.now() });
  l.queries = l.queries.slice(0, 100);
  writeJSON(LEARN_KEY, l);
}
export function saveEntry(entry) {
  const memory = readJSON(MEM_KEY, []);
  memory.unshift({ ...entry, ts: Date.now() });
  writeJSON(MEM_KEY, memory.slice(0, 200));
}
export function recall(q, limit = 3) {
  return readJSON(MEM_KEY, []).filter(e => tokens(e.question).some(t => tokens(q).includes(t))).slice(0, limit);
}

/* ---------- جمع وترتيب ---------- */
export function mergeResults(batches) {
  const map = new Map();
  batches.forEach(b => {
    (b.items || []).forEach(it => {
      const u = (it.url || '').replace(/[?#].*$/, '').toLowerCase();
      if (!u) return;
      const cur = map.get(u);
      const score = b.weight * (0.4 + Math.min(0.6, (it.snippet || '').length / 300));
      if (cur) { cur.score = Math.max(cur.score, score); cur.engines.push(b.label); }
      else map.set(u, { ...it, url: it.url, score, engines: [b.label], kind: b.kind || 'general' });
    });
  });
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export async function gather(question, { limit = 20, signal } = {}) {
  const batches = await Promise.allSettled(SOURCES.map(async s => ({
    label: s.label,
    weight: s.weight,
    kind: s.kind,
    items: await s.run(question, signal)
  })));
  const ok = batches.filter(b => b.status === 'fulfilled').map(b => b.value);
  const merged = mergeResults(ok);
  const ranked = merged.map((r, i) => ({ ...r, n: i + 1 })).slice(0, limit);
  const engines = ok.filter(b => b.items.length).map(b => ({ label: b.label, count: b.items.length }));
  return { sources: ranked, engines };
}

/* ---------- تركيب المقال ---------- */
const SECTION_TITLES = {
  general: 'المعرفة العامة والسياق',
  academic: 'الأبحاث والمراجع الأكاديمية',
  dev: 'التطبيق البرمجي والمصادر التقنية',
  community: 'النقاش المجتمعي والتجارب'
};

export function synthesize(question, sources, previous = []) {
  if (!sources.length) return null;
  const used = new Set();
  const pick = (kind, n = 3) => {
    const out = [];
    for (const s of sources) {
      if (out.length >= n) break;
      if (s.kind === kind && s.snippet && s.snippet.length > 40 && !used.has(s.n)) { out.push(s); used.add(s.n); }
    }
    return out;
  };

  const introSrc = sources.slice(0, 2).filter(s => s.snippet);
  introSrc.forEach(s => used.add(s.n));

  const sections = ['general', 'academic', 'dev', 'community']
    .map(k => ({ title: SECTION_TITLES[k], items: pick(k, 3) }))
    .filter(sec => sec.items.length);

  let text = `📌 ${question}\n\n`;
  if (previous.length) text += `من البحوث السابقة (ذاكرتك): ${previous.map(p => p.question).join(' · ')}\n\n`;
  if (introSrc.length) text += introSrc.map(s => `${s.snippet} [${s.n}]`).join(' ') + '\n\n';
  sections.forEach(sec => {
    text += `*${sec.title}*\n` + sec.items.map(s => `• ${s.snippet} [${s.n}]`).join('\n') + '\n\n';
  });

  const multi = sources.filter(s => s.engines.length > 1);
  text += `*خلاصة*\n`;
  if (multi.length) text += `المصادر اللي تكررو فجوج محركات فأكثر: ${multi.map(s => s.engines.join('+') + ' [' + s.n + ']').join(' · ')}\n`;
  text += `تم الاعتماد على ${used.size} مصدر من ${sources.length} نتيجة مجموعة.\n`;

  const refs = sources.map(s => ({ n: s.n, title: s.title, url: s.url, engine: s.engines.join(' + '), snippet: s.snippet }));
  text += `\n*المراجع*\n` + refs.map(r => `${r.n}. ${r.title}\n${r.url}`).join('\n\n');
  return { text, refs, citations: refs, used: [...used] };
}

/* ---------- الواجهة ---------- */
export async function advancedResearch({ question, limit = 20 } = {}) {
  if (!question || question.trim().length < 3) return null;
  const previous = relatedLearning(question);
  const { sources, engines } = await gather(question, { limit });
  const art = synthesize(question, sources, previous);
  if (!art) return null;
  recordLearning(question, sources, new Set(art.used));
  saveEntry({ question, answer: art.text, citations: art.refs, engines });
  return { ...art, engines, previous };
}

export { SOURCES };
