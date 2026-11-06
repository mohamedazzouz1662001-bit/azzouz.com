/* research.mjs v3 — محرك بحث شامل بمراجع، يعمل من المتصفح مباشرة.
   مصادر: ويكيبيديا ar/en · بحث ويب (Bing) · OpenAlex · Crossref · Europe PMC ·
           PubMed · GitHub · Stack Overflow · Hacker News · DEV · DuckDuckGo
   المخرجات: مقال واحد + TL;DR + مراجع مرقمة + ذاكرة وتعلّم محلي. */

const TIMEOUT = 14000;
const JINA = 'https://r.jina.ai/';
const LEARN_KEY = 'azzouz-learn-v3';
const MEM_KEY = 'azzouz-memory-v3';

/* ---------- أدوات ---------- */
const enc = encodeURIComponent;
function readJSON(key, def) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch (e) { return def; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

function htmlDecode(s = '') {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function strip(s = '') { return htmlDecode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function trimText(s, n = 380) { s = strip(s); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
function yearOf(v) {
  if (!v) return null;
  const m = String(v).match(/(19|20)\d{2}/);
  return m ? +m[0] : null;
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

async function get(url, { json = true, ms = TIMEOUT, text = false } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: json ? 'application/json' : 'text/plain', 'User-Agent': 'AzzouzResearch/3.0 (+github.io)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

/* ---------- مفكك روابط Bing ---------- */
function bingUrl(raw) {
  const m = String(raw).match(/u=a1([A-Za-z0-9_\-=]+)/);
  if (!m) return raw;
  let s = m[1].replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  try { return decodeURIComponent(escape(atob(s))); } catch (e) { return raw; }
}

/* ---------- المصادر ---------- */
const TRUST = {
  'ar.wikipedia.org': 1, 'en.wikipedia.org': 1, 'pubmed.ncbi.nlm.nih.gov': 0.97,
  'europepmc.org': 0.95, 'arxiv.org': 0.95, 'openalex.org': 0.93, 'doi.org': 0.93,
  'stackoverflow.com': 0.88, 'github.com': 0.84, 'dev.to': 0.75,
  'news.ycombinator.com': 0.72, 'reddit.com': 0.6
};
const KIND_TITLES = {
  general: 'المعرفة العامة',
  web: 'الويب والصفحات',
  academic: 'الأبحاث والمراجع العلمية',
  dev: 'التقنية والبرمجة',
  community: 'المجتمع والنقاشات'
};

const SOURCES = [
  {
    id: 'wikipedia-ar', label: 'ويكيبيديا العربية', kind: 'general', ms: 9000,
    run: async (q) => {
      const d = await get(`https://ar.wikipedia.org/w/rest.php/v1/search/page?q=${enc(q)}&limit=4`);
      return (d.pages || []).map(p => ({
        title: p.title, url: `https://ar.wikipedia.org/wiki/${enc(p.key || p.title)}`,
        snippet: trimText(p.description || p.excerpt || '', 300), year: null
      }));
    }
  },
  {
    id: 'wikipedia-en', label: 'Wikipedia (EN)', kind: 'general', ms: 9000,
    run: async (q) => {
      const d = await get(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${enc(q)}&limit=3`);
      return (d.pages || []).map(p => ({
        title: p.title, url: `https://en.wikipedia.org/wiki/${enc(p.key || p.title)}`,
        snippet: trimText(p.description || p.excerpt || '', 300), year: null
      }));
    }
  },
  {
    id: 'web-bing', label: 'بحث الويب', kind: 'web', ms: 22000,
    run: async (q) => {
      const md = await get(JINA + 'https://www.bing.com/search?q=' + enc(q) + '&count=8', { json: false, ms: 22000 });
      const lines = md.split('\n');
      const out = [];
      for (let i = 0; i < lines.length && out.length < 6; i++) {
        const L = lines[i];
        const m = L.match(/^##\s*\[(.+?)\]\((https?:\/\/[^)]+)\)/);
        if (!m) continue;
        const title = strip(m[1].replace(/\*\*/g, ''));
        const url = bingUrl(m[2]);
        if (!/^https?:/i.test(url) || /bing\.com\/ck/.test(url)) continue;
        let snip = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const t = strip(lines[j]);
          if (t && !/^\[|^##|^!\[|^\d+\./.test(t)) { snip = trimText(t, 300); break; }
        }
        if (title && snip) out.push({ title, url, snippet: snip, year: yearOf(snip) });
      }
      return out;
    }
  },
  {
    id: 'openalex', label: 'OpenAlex', kind: 'academic', ms: 11000,
    run: async (q) => {
      const d = await get(`https://api.openalex.org/works?search=${enc(q)}&per_page=5&sort=relevance_score:desc`);
      return (d.results || []).map(w => {
        let abs = '';
        const inv = w.abstract_inverted_index;
        if (inv) {
          const words = [];
          for (const [word, pos] of Object.entries(inv)) for (const p of pos) words[p] = word;
          abs = words.filter(Boolean).join(' ');
        }
        return {
          title: w.display_name, url: w.doi || w.id,
          snippet: trimText(abs || w.display_name, 320), year: w.publication_year
        };
      });
    }
  },
  {
    id: 'crossref', label: 'Crossref', kind: 'academic', ms: 11000,
    run: async (q) => {
      const d = await get(`https://api.crossref.org/works?query=${enc(q)}&rows=5&select=title,URL,abstract,issued,is-referenced-by-count`);
      return ((d.message && d.message.items) || []).map(it => ({
        title: (it.title && it.title[0]) || '',
        url: it.URL,
        snippet: trimText(it.abstract || (it.title && it.title[0]) || '', 320),
        year: it.issued && it.issued['date-parts'] ? it.issued['date-parts'][0][0] : null
      }));
    }
  },
  {
    id: 'europepmc', label: 'Europe PMC', kind: 'academic', ms: 11000,
    run: async (q) => {
      const d = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(q)}&format=json&pageSize=5`);
      const rs = (d.resultList && d.resultList.result) || [];
      return rs.map(r => ({
        title: r.title,
        url: r.doi ? 'https://doi.org/' + r.doi : `https://europepmc.org/article/${r.source}/${r.id}`,
        snippet: trimText(r.abstractText || r.title, 320), year: yearOf(r.pubYear)
      }));
    }
  },
  {
    id: 'pubmed', label: 'PubMed', kind: 'academic', ms: 14000,
    run: async (q) => {
      const s = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${enc(q)}&retmode=json&retmax=4`);
      const ids = (s.esearchresult && s.esearchresult.idlist) || [];
      if (!ids.length) return [];
      const d = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`);
      return ids.map(id => {
        const r = d.result && d.result[id];
        if (!r) return null;
        return {
          title: r.title, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          snippet: trimText((r.source || '') + ' · ' + (r.title || ''), 300), year: yearOf(r.pubdate)
        };
      }).filter(Boolean);
    }
  },
  {
    id: 'github', label: 'GitHub', kind: 'dev', ms: 11000,
    run: async (q) => {
      const d = await get(`https://api.github.com/search/repositories?q=${enc(q)}&sort=stars&per_page=4`);
      return (d.items || []).map(r => ({
        title: r.full_name, url: r.html_url,
        snippet: trimText((r.description || '') + ' · ⭐ ' + r.stargazers_count + ' · ' + (r.language || ''), 300),
        year: yearOf(r.updated_at)
      }));
    }
  },
  {
    id: 'stackoverflow', label: 'Stack Overflow', kind: 'dev', ms: 11000,
    run: async (q) => {
      const d = await get(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${enc(q)}&site=stackoverflow&pagesize=4`);
      return (d.items || []).filter(i => i.question_id).map(i => ({
        title: i.title, url: `https://stackoverflow.com/q/${i.question_id}`,
        snippet: trimText(i.excerpt, 300), year: i.creation_date ? new Date(i.creation_date * 1000).getFullYear() : null
      }));
    }
  },
  {
    id: 'hackernews', label: 'Hacker News', kind: 'community', ms: 10000,
    run: async (q) => {
      const d = await get(`https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=4`);
      return (d.hits || []).map(h => ({
        title: h.title || h.story_title || '',
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: trimText(strip(h.story_text || '') || (h.title || '') + ' · ' + (h.points || 0) + ' نقطة', 300),
        year: yearOf(h.created_at)
      })).filter(x => x.title);
    }
  },
  {
    id: 'devto', label: 'DEV Community', kind: 'dev', ms: 10000,
    run: async (q) => {
      const latin = (q.match(/[a-zA-Z][a-zA-Z0-9-]{2,}/g) || []).slice(0, 1);
      if (!latin.length) return [];
      const d = await get(`https://dev.to/api/articles?tag=${enc(latin[0].toLowerCase())}&per_page=3&top=30`);
      return (Array.isArray(d) ? d : []).map(a => ({
        title: a.title, url: a.url, snippet: trimText(a.description || '', 300), year: yearOf(a.published_at)
      }));
    }
  },
  {
    id: 'duckduckgo', label: 'DuckDuckGo', kind: 'web', ms: 9000,
    run: async (q) => {
      const d = await get(`https://api.duckduckgo.com/?q=${enc(q)}&format=json&no_html=1&skip_disambig=1`);
      const out = [];
      if (d.AbstractText) out.push({ title: d.Heading || q, url: d.AbstractURL || 'https://duckduckgo.com/?q=' + enc(q), snippet: trimText(d.AbstractText, 320), year: null });
      (d.RelatedTopics || []).slice(0, 3).forEach(t => {
        if (t.Text && t.FirstURL) out.push({ title: t.Text.split(' - ')[0], url: t.FirstURL, snippet: trimText(t.Text, 260), year: null });
      });
      return out;
    }
  }
];

/* ---------- جمع ---------- */
function normUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref$|fbclid|gclid|ntb|ocid)/.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString();
  } catch (e) { return u; }
}

export function mergeResults(batches) {
  const map = new Map();
  for (const b of batches) {
    for (const it of (b.items || [])) {
      if (!it || !it.url || !it.title) continue;
      const key = normUrl(it.url);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...it, url: key, engines: [b.label], trust: TRUST[hostOf(key)] || 0.62, ts: Date.now() });
      } else {
        if (!prev.engines.includes(b.label)) prev.engines.push(b.label);
        if ((it.snippet || '').length > (prev.snippet || '').length) prev.snippet = it.snippet;
        if (it.year && !prev.year) prev.year = it.year;
      }
    }
  }
  return [...map.values()];
}

function tokenize(s) {
  return strip(s).toLowerCase().replace(/[\u0640\u064b-\u065f]/g, '')
    .split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2);
}

function scoreItem(it, qTokens, learned) {
  const hay = (it.title + ' ' + (it.snippet || '')).toLowerCase();
  let coverage = 0;
  for (const t of qTokens) if (hay.includes(t)) coverage++;
  const cov = qTokens.length ? coverage / qTokens.length : 0;
  const agree = Math.min(1, (it.engines.length - 1) * 0.5);
  const recency = it.year ? Math.max(0, Math.min(1, (it.year - 2005) / 21)) : 0.5;
  const len = Math.min(1, (it.snippet || '').length / 300);
  const learnedBoost = learned.hosts[hostOf(it.url)] ? Math.min(0.15, learned.hosts[hostOf(it.url)].rate * 0.15) : 0;
  return it.trust * 1.5 + cov * 2 + agree * 0.8 + recency * 0.4 + len * 0.3 + learnedBoost;
}

export function rank(items, qTokens, learned) {
  return items.map(it => ({ ...it, score: scoreItem(it, qTokens, learned) })).sort((a, b) => b.score - a.score);
}

/* ---------- التعلم والذاكرة ---------- */
export function learn() { return readJSON(LEARN_KEY, { hosts: {}, topics: [], queries: [] }); }
export function memory() { return readJSON(MEM_KEY, []); }

export function topSources(n = 3) {
  const L = learn();
  return Object.entries(L.hosts).map(([host, v]) => ({ host, ...v }))
    .sort((a, b) => b.rate - a.rate || b.hits - a.hits).slice(0, n);
}

export function relatedLearning(q, limit = 2) {
  const toks = new Set(tokenize(q));
  if (!toks.size) return [];
  return memory().map(e => {
    const et = new Set(e.tokens || []);
    const inter = [...toks].filter(t => et.has(t)).length;
    const score = inter / Math.sqrt(Math.max(1, toks.size) * Math.max(1, et.size));
    return { e, score, inter };
  }).filter(x => x.inter >= 2 && x.score > 0.12)
    .sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.e);
}

function recordLearning(question, sources, usedN) {
  const L = learn();
  for (const s of sources) {
    const h = hostOf(s.url);
    if (!h) continue;
    L.hosts[h] = L.hosts[h] || { hits: 0, useful: 0, rate: 0 };
    L.hosts[h].hits++;
    if (usedN.has(s.n)) L.hosts[h].useful++;
    L.hosts[h].rate = L.hosts[h].useful / L.hosts[h].hits;
  }
  for (const t of new Set(tokenize(question))) {
    const found = L.topics.find(x => x.t === t);
    if (found) found.n++;
    else L.topics.push({ t, n: 1 });
  }
  L.topics = L.topics.sort((a, b) => b.n - a.n).slice(0, 400);
  L.queries = [{ q: question, ts: Date.now() }, ...L.queries].slice(0, 60);
  writeJSON(LEARN_KEY, L);
}

function saveEntry(entry) {
  const m = memory();
  m.unshift(entry);
  writeJSON(MEM_KEY, m.slice(0, 120));
}

export function clearMemory() { writeJSON(MEM_KEY, []); }

/* ---------- صياغة المقال ---------- */
const SENT_SPLIT = /(?<=[.!?؟؛])\s+|\n+/;

function sentences(text) {
  let s = strip(text);
  if (/[…]$|(\.\.\.)$/.test(s)) {
    const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf('؟ '), s.lastIndexOf('! '), s.lastIndexOf('؛ '));
    s = cut > 60 ? s.slice(0, cut + 1) : s.replace(/[…]$|\.\.\.$/, '');
  }
  const parts = s.split(SENT_SPLIT).map(x => x.trim()).filter(Boolean);
  const out = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    if (last && !/[.!?؟؛]$/.test(p)) return;      // ما ناخدوش جملة مقطوعة
    if (p.length < 70 || p.length > 420) return;
    if ((p.match(/\p{L}/gu) || []).length < 25) return;
    out.push(p);
  });
  return out;
}
function bigrams(s) { const w = tokenize(s); const out = new Set(); for (let i = 0; i < w.length - 1; i++) out.add(w[i] + ' ' + w[i + 1]); return out; }
function similar(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function synthesize(question, sources) {
  if (!sources.length) return null;
  const qTok = tokenize(question);
  const qSet = new Set(qTok);

  const cands = [];
  sources.forEach(s => {
    sentences(s.snippet || '').forEach(sent => {
      const st = new Set(tokenize(sent));
      let hit = 0;
      for (const t of qSet) if (st.has(t)) hit++;
      cands.push({ sent, n: s.n, score: hit * 2 + Math.min(1, st.size / 25) + s.score * 0.2 });
    });
  });
  cands.sort((a, b) => b.score - a.score);

  const picked = [];
  for (const c of cands) {
    if (picked.length >= 9) break;
    if (picked.some(p => similar(p.sent, c.sent) > 0.55)) continue;
    if (picked.some(p => p.n === c.n) && picked.filter(p => p.n === c.n).length >= 2) continue;
    picked.push(c);
  }

  const used = new Set(picked.map(p => p.n));
  const tldr = picked.slice(0, 3);
  const rest = picked.slice(3);

  let text = `📌 ${question}\n\n`;
  if (tldr.length) {
    text += `*الخلاصة السريعة*\n`;
    tldr.forEach((p, i) => { text += `${i + 1}. ${p.sent} [${p.n}]\n`; });
    text += '\n';
  }

  const byKind = {};
  rest.forEach(p => {
    const src = sources.find(s => s.n === p.n);
    const k = src ? src.kind : 'general';
    (byKind[k] = byKind[k] || []).push(p);
  });
  for (const k of ['general', 'web', 'academic', 'dev', 'community']) {
    const arr = (byKind[k] || []).slice(0, 3);
    if (!arr.length) continue;
    text += `*${KIND_TITLES[k]}*\n`;
    arr.forEach(p => { text += `• ${p.sent} [${p.n}]\n`; });
    text += '\n';
  }

  const nums = picked.filter(p => /\d/.test(p.sent) && !tldr.includes(p)).slice(0, 3);
  if (nums.length) {
    text += `*أرقام ومعطيات*\n`;
    nums.forEach(p => { text += `• ${p.sent} [${p.n}]\n`; });
    text += '\n';
  }

  const multi = sources.filter(s => s.engines.length > 1);
  const years = sources.map(s => s.year).filter(Boolean);
  text += `*خلاصة منهجية*\n`;
  text += `• ${sources.length} نتيجة من ${new Set(sources.map(s => s.engines.join())).size} مصدر، استُعمل منها ${used.size} مصدر فالمقال.\n`;
  if (multi.length) text += `• ${multi.length} نتيجة تكررت فأكثر من محرك (تطابق يعزز المعلومة): ${multi.slice(0, 4).map(s => `[${s.n}]`).join(' ')}\n`;
  if (years.length) text += `• نطاق التواريخ: ${Math.min(...years)}–${Math.max(...years)}\n`;

  text += `\n*المراجع*\n`;
  sources.forEach(s => {
    text += `[${s.n}] ${s.title}${s.year ? ' (' + s.year + ')' : ''}\n${s.url}\n`;
  });

  const words = text.split(/\s+/).length;
  return { text, used: [...used], refs: sources, citations: sources, words, minutes: Math.max(1, Math.round(words / 200)) };
}

/* ---------- الواجهة ---------- */
export async function gather(question, { onSource } = {}) {
  const learned = learn();
  const jobs = SOURCES.map(async (src) => {
    try {
      const items = (await src.run(question)).filter(x => x && x.title && x.url);
      if (onSource) onSource(src.id, 'ok', items.length);
      return { label: src.label, id: src.id, kind: src.kind, items };
    } catch (e) {
      if (onSource) onSource(src.id, 'err', 0);
      return { label: src.label, id: src.id, kind: src.kind, items: [] };
    }
  });
  const batches = await Promise.all(jobs);

  const merged = mergeResults(batches);
  const kindOf = {};
  batches.forEach(b => (b.items || []).forEach(it => { kindOf[normUrl(it.url)] = b.kind; }));
  merged.forEach(it => { it.kind = kindOf[it.url] || 'general'; });

  const ranked = rank(merged, tokenize(question), learned).slice(0, 16);
  ranked.forEach((it, i) => { it.n = i + 1; });

  const engines = batches.map(b => ({ id: b.id, label: b.label, count: (b.items || []).length }));
  return { sources: ranked, engines };
}

export async function advancedResearch({ question, onSource } = {}) {
  if (!question || question.trim().length < 3) return null;
  const previous = relatedLearning(question);
  const { sources, engines } = await gather(question, { onSource });
  if (!sources.length) return null;
  const art = synthesize(question, sources);
  if (!art) return null;
  recordLearning(question, sources, new Set(art.used));
  saveEntry({ question, answer: art.text, citations: art.refs, engines, ts: Date.now(), tokens: [...new Set(tokenize(question))] });
  return { ...art, engines, previous };
}

export { SOURCES, TRUST };
