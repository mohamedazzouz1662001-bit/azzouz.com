/* Azzouz Research Worker — بحث ويب شامل + تلخيص بمقال واحد + مراجع
   Cloudflare Worker (ES module). ربط Workers AI عبر binding اسمه AI.
   Routes:
     GET  /health
     POST /research   { q, lang }            -> { sources:[{n,title,url,snippet,engine,ts}], engines:[...] }
     POST /summarize  { q, sources, lang }   -> { article, refs }
*/

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const UA = 'AzzouzResearch/2.0 (+https://elazzouz-dotcom.github.io/)';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      if (url.pathname === '/health') return json({ ok: true, ai: !!env.AI });
      if (url.pathname === '/research' && req.method === 'POST') {
        const { q, lang = 'ar' } = await req.json();
        if (!q || q.length < 2) return json({ error: 'bad_query' }, 400);
        const out = await research(q, lang);
        return json(out);
      }
      if (url.pathname === '/summarize' && req.method === 'POST') {
        const { q, sources = [], lang = 'ar' } = await req.json();
        const out = await summarize(q, sources, env, lang);
        return json(out);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function get(url, ms = 9000, opts = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8', ...(opts.headers || {}) },
      cf: { cacheTtl: 300, cacheEverything: false },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } finally {
    clearTimeout(t);
  }
}

function clean(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

const decode = (h) => {
  try { return decodeURIComponent(h); } catch { return h; }
};

/* ================= المحركات والمصادر ================= */

async function ddg(q) {
  const r = await get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q) + '&kl=wt-wt');
  const html = await r.text();
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    let u = m[1];
    const mm = u.match(/uddg=([^&]+)/);
    if (mm) u = decode(mm[1]);
    if (!/^https?:/.test(u)) continue;
    out.push({ title: clean(m[2]), url: u, snippet: clean(m[3] || '') });
  }
  return out;
}

async function bing(q) {
  const r = await get('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=ar');
  const html = await r.text();
  const out = [];
  const blocks = html.split('<li class="b_algo"').slice(1, 12);
  for (const b of blocks) {
    const a = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const p = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ title: clean(a[2]), url: a[1], snippet: clean(p ? p[1] : '') });
  }
  return out;
}

async function mojeek(q) {
  const r = await get('https://www.mojeek.com/search?q=' + encodeURIComponent(q));
  const html = await r.text();
  const out = [];
  const re = /<a[^>]+class="ob"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p class="s">([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 10) {
    out.push({ title: clean(m[2]), url: m[1], snippet: clean(m[3]) });
  }
  return out;
}

async function wikipedia(q, lang) {
  const l = lang === 'ar' ? 'ar' : 'en';
  const u = `https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json&origin=*`;
  const d = await (await get(u)).json();
  return (d.query?.search || []).map((s) => ({
    title: s.title,
    url: `https://${l}.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
    snippet: clean(s.snippet),
  }));
}

async function stackexchange(q) {
  const u = 'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=8&q=' + encodeURIComponent(q);
  const d = await (await get(u)).json();
  return (d.items || []).map((i) => ({
    title: i.title,
    url: i.link,
    snippet: clean((i.tags || []).join(', ') + ' · ' + (i.is_answered ? 'answered' : 'questions')),
    ts: i.creation_date ? i.creation_date * 1000 : undefined,
  }));
}

async function github(q) {
  const u = 'https://api.github.com/search/repositories?per_page=8&q=' + encodeURIComponent(q);
  const d = await (await get(u, 9000, { headers: { accept: 'application/vnd.github+json' } })).json();
  return (d.items || []).map((r) => ({
    title: r.full_name,
    url: r.html_url,
    snippet: clean((r.description || '') + ' · ★' + r.stargazers_count + ' · ' + (r.language || '')),
    ts: r.updated_at ? Date.parse(r.updated_at) : undefined,
  }));
}

async function hackernews(q) {
  const u = 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=' + encodeURIComponent(q);
  const d = await (await get(u)).json();
  return (d.hits || []).map((h) => ({
    title: h.title || h.story_title || '',
    url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
    snippet: clean(h.story_text || (h.comment_text || '')).slice(0, 300) || ('HN · ' + (h.points || 0) + ' points'),
    ts: h.created_at_i ? h.created_at_i * 1000 : undefined,
  })).filter((x) => x.title);
}

async function reddit(q) {
  const u = 'https://www.reddit.com/search.json?limit=8&q=' + encodeURIComponent(q);
  const d = await (await get(u, 9000, { headers: { accept: 'application/json' } })).json();
  return (d.data?.children || []).map((c) => c.data).map((p) => ({
    title: p.title,
    url: 'https://www.reddit.com' + p.permalink,
    snippet: clean((p.selftext || '').slice(0, 300) || ('r/' + p.subreddit + ' · ' + (p.score || 0) + ' points')),
    ts: p.created_utc ? p.created_utc * 1000 : undefined,
  }));
}

async function arxiv(q) {
  const u = 'http://export.arxiv.org/api/query?search_query=all:' + encodeURIComponent(q) + '&max_results=6';
  const xml = await (await get(u)).text();
  const out = [];
  const entries = xml.split('<entry>').slice(1);
  for (const e of entries) {
    const t = e.match(/<title>([\s\S]*?)<\/title>/);
    const s = e.match(/<summary>([\s\S]*?)<\/summary>/);
    const l = e.match(/<id>([\s\S]*?)<\/id>/);
    if (!t || !l) continue;
    out.push({ title: clean(t[1]), url: l[1].trim(), snippet: clean(s ? s[1] : '').slice(0, 400) });
  }
  return out;
}

async function semantic(q) {
  const u = 'https://api.semanticscholar.org/graph/v1/paper/search?limit=6&fields=title,abstract,url,year,authors&query=' + encodeURIComponent(q);
  const d = await (await get(u)).json();
  return (d.data || []).map((p) => ({
    title: p.title,
    url: p.url || ('https://www.semanticscholar.org/paper/' + p.paperId),
    snippet: clean((p.abstract || '').slice(0, 400) + (p.year ? ' · ' + p.year : '')),
  })).filter((x) => x.title);
}

async function gdelt(q) {
  const u = 'https://api.gdeltproject.org/api/v2/doc/doc?format=json&maxrecords=8&sort=hybridrel&query=' + encodeURIComponent(q);
  const d = await (await get(u)).json();
  return (d.articles || []).map((a) => ({
    title: a.title,
    url: a.url,
    snippet: clean(a.domain + ' · ' + (a.seendate || '')),
    ts: a.seendate ? Date.parse(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) : undefined,
  }));
}

async function devto(q) {
  const u = 'https://dev.to/api/articles?per_page=8&top=30&tag=' + encodeURIComponent(q.split(/\s+/)[0].toLowerCase());
  const d = await (await get(u)).json();
  return (Array.isArray(d) ? d : []).map((a) => ({
    title: a.title,
    url: a.url,
    snippet: clean((a.description || '') + ' · ' + (a.tag_list || []).join(', ')),
    ts: a.published_at ? Date.parse(a.published_at) : undefined,
  }));
}

const ENGINES = [
  { id: 'ddg', label: 'DuckDuckGo', weight: 1.0, run: ddg },
  { id: 'bing', label: 'Bing', weight: 0.9, run: bing },
  { id: 'mojeek', label: 'Mojeek', weight: 0.7, run: mojeek },
  { id: 'wikipedia', label: 'Wikipedia', weight: 0.95, run: wikipedia },
  { id: 'stackoverflow', label: 'Stack Overflow', weight: 0.85, run: stackexchange },
  { id: 'github', label: 'GitHub', weight: 0.8, run: github },
  { id: 'hackernews', label: 'Hacker News', weight: 0.75, run: hackernews },
  { id: 'reddit', label: 'Reddit', weight: 0.65, run: reddit },
  { id: 'arxiv', label: 'arXiv', weight: 0.9, run: arxiv },
  { id: 'semanticscholar', label: 'Semantic Scholar', weight: 0.9, run: semantic },
  { id: 'gdelt', label: 'GDELT أخبار', weight: 0.7, run: gdelt },
  { id: 'devto', label: 'DEV Community', weight: 0.6, run: devto },
];

/* ================= تجميع + ترتيب ================= */

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    const qs = [...x.searchParams.keys()].filter((k) => /^(utm_|ref|fbclid|gclid)/.test(k));
    qs.forEach((k) => x.searchParams.delete(k));
    return x.toString().replace(/\/$/, '');
  } catch { return u; }
}

export function mergeResults(batches) {
  const seen = new Map();
  for (const b of batches) {
    if (!b || !b.items) continue;
    for (const it of b.items) {
      if (!it || !it.url || !/^https?:/.test(it.url)) continue;
      const key = normUrl(it.url);
      const score = b.weight * (1 + Math.min(1, (it.snippet || '').length / 300)) + (it.ts && Date.now() - it.ts < 864e5 * 30 ? 0.2 : 0);
      const prev = seen.get(key);
      if (prev) {
        prev.engines.push(b.label);
        prev.score += score * 0.5;
        if ((it.snippet || '').length > (prev.snippet || '').length) prev.snippet = it.snippet;
        continue;
      }
      seen.set(key, {
        title: it.title || it.url,
        url: key,
        snippet: it.snippet || '',
        engines: [b.label],
        score,
        ts: it.ts,
      });
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

export async function research(q, lang) {
  const tasks = ENGINES.map((e) =>
    e.run(q, lang).then((items) => ({ label: e.label, weight: e.weight, items })).catch(() => null)
  );
  const batches = (await Promise.all(tasks)).filter(Boolean);
  const merged = mergeResults(batches).slice(0, 24);
  const sources = merged.map((s, i) => ({
    n: i + 1,
    title: s.title,
    url: s.url,
    snippet: s.snippet.slice(0, 500),
    engine: s.engines.join(' + '),
    ts: s.ts || null,
  }));
  return { q, sources, engines: batches.map((b) => b.label) };
}

/* ================= تلخيص بمقال واحد + مراجع ================= */

function buildPrompt(q, sources, lang) {
  const list = sources.slice(0, 18).map((s) => `[${s.n}] ${s.title} — ${s.url}\n${(s.snippet || '').slice(0, 400)}`).join('\n\n');
  const ar = lang !== 'en';
  return ar
    ? `أنت محرر بحث. اكتب مقالًا عربيًا واحدًا منظمًا حول: «${q}».

قواعد صارمة:
1. استعمل فقط المعلومات الموجودة في المصادر أدناه. لا تضف معرفة خارجية ولا تخترع أرقامًا.
2. بعد كل جملة أو فكرة ضع رقم المصدر بين قوسين مربعين هكذا: [2].
3. إذا لم تكفِ المصادر، اكتب جملة صريحة: «المصادر المتاحة لا تغطي هذه النقطة».
4. البنية: عنوان قصير، فقرة تمهيدية، 3 إلى 5 فقرات أو نقاط، ثم خلاصة في سطرين.
5. لا تكتب قسم المراجع؛ سيضاف تلقائيًا.
6. الطول: 180 إلى 320 كلمة.

المصادر:
${list}`
    : `You are a research editor. Write one organized article about: "${q}".
Strict rules: use ONLY the sources below, cite with [n] after each claim, state clearly when sources do not cover a point, structure as title + intro + 3-5 paragraphs/bullets + 2-line conclusion (180-320 words). Do not write a references section.

Sources:
${list}`;
}

export async function summarize(q, sources, env, lang) {
  const usable = (sources || []).filter((s) => s && s.url).slice(0, 18);
  if (!usable.length) return { article: '', refs: [], error: 'no_sources' };

  let article = '';
  if (env && env.AI) {
    try {
      const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'أنت محرر بحث دقيق. لا تختلق معلومات ولا مراجع.' },
          { role: 'user', content: buildPrompt(q, usable, lang) },
        ],
        max_tokens: 900,
        temperature: 0.25,
      });
      article = String(res.response || '').trim();
    } catch (e) {
      article = '';
    }
  }
  if (!article) article = extractive(q, usable, lang);

  const used = new Set([...article.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  const refs = usable.filter((s) => used.has(s.n));
  const finalRefs = refs.length ? refs : usable.slice(0, 6);
  return { article, refs: finalRefs, usedMarkers: [...used] };
}

export function extractive(q, sources, lang) {
  const picks = sources.filter((s) => s.snippet).slice(0, 6);
  if (!picks.length) return '';
  const ar = lang !== 'en';
  const head = ar ? `ملخص بحثي حول «${q}» (تجميع حرفي من المصادر، بلا توليد):` : `Research summary on "${q}" (extractive, no generation):`;
  const body = picks.map((s) => `• ${s.snippet.slice(0, 260)} [${s.n}]`).join('\n');
  const tail = ar ? '\n\nهذا تجميع خوارزمي للمقتطفات؛ راجع المصادر الأصلية قبل الاعتماد.' : '\n\nAlgorithmic excerpt compilation; verify original sources.';
  return head + '\n\n' + body + tail;
}
