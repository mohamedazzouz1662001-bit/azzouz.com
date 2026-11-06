/* connectors.mjs — وصلات التطبيقات: كل مفتاح كيتخزن غير فالجهاز */

const STORE = 'azzouz-connectors-v1';

export function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; }
}

export function saveOne(id, values) {
  const all = loadAll();
  all[id] = { ...(all[id] || {}), ...values, on: values.on !== undefined ? values.on : true, ts: Date.now() };
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) {}
  return all[id];
}

export function toggle(id, on) {
  const all = loadAll();
  all[id] = { ...(all[id] || {}), on };
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) {}
}

export function removeOne(id) {
  const all = loadAll();
  delete all[id];
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) {}
}

export function statusOf(id) {
  const c = (loadAll() || {})[id];
  if (!c) return 'off';
  const filled = (c.fields || {});
  const ready = Object.values(filled).some(v => String(v || '').trim().length > 4);
  return c.on && ready ? 'on' : 'off';
}

async function jget(url, headers = {}, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const clean = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);

export const CONNECTORS = [
  {
    id: 'google', name: 'Google', icon: '🔍', kind: 'article',
    note: 'Custom Search JSON API — محرك بحث جوجل كامل',
    fields: [{ k: 'key', label: 'API Key', ph: 'AIza...' }, { k: 'cx', label: 'CX', ph: 'معرف محرك البحث' }],
    run: async (v, q) => (await jget(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(v.key)}&cx=${encodeURIComponent(v.cx)}&q=${encodeURIComponent(q)}&num=10`)).items?.map(i => ({ title: i.title, url: i.link, snippet: clean(i.snippet), thumb: i.pagemap?.cse_thumbnail?.[0]?.src })) || []
  },
  {
    id: 'youtube', name: 'YouTube', icon: '🎬', kind: 'video',
    note: 'YouTube Data API v3 — فيديوهات وقنوات',
    fields: [{ k: 'key', label: 'API Key', ph: 'AIza...' }],
    run: async (v, q) => (await jget(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&type=video&key=${encodeURIComponent(v.key)}&q=${encodeURIComponent(q)}`)).items?.map(i => ({
      title: i.snippet?.title, url: 'https://www.youtube.com/watch?v=' + i.id?.videoId,
      snippet: clean(i.snippet?.description), thumb: i.snippet?.thumbnails?.medium?.url
    })) || []
  },
  {
    id: 'serpapi', name: 'SerpAPI', icon: '🌐', kind: 'article',
    note: 'جوجل + خرائط + أخبار + صور عبر SerpAPI',
    fields: [{ k: 'key', label: 'API Key', ph: 'serpapi key' }],
    run: async (v, q) => (await jget(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(v.key)}&num=20`)).organic_results?.map(i => ({ title: i.title, url: i.link, snippet: clean(i.snippet) })) || []
  },
  {
    id: 'tavily', name: 'Tavily', icon: '🧠', kind: 'article',
    note: 'محرك بحث مصمم للوكلاء الذكيين',
    fields: [{ k: 'key', label: 'API Key', ph: 'tvly-...' }],
    run: async (v, q) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 14000);
      try {
        const r = await fetch('https://api.tavily.com/search', {
          method: 'POST', signal: c.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: v.key, query: q, max_results: 15, include_answer: false })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        return (d.results || []).map(x => ({ title: x.title, url: x.url, snippet: clean(x.content) }));
      } finally { clearTimeout(t); }
    }
  },
  {
    id: 'unsplash', name: 'Unsplash', icon: '🖼️', kind: 'image',
    note: 'صور عالية الجودة',
    fields: [{ k: 'key', label: 'Access Key', ph: 'unsplash key' }],
    run: async (v, q) => (await jget(`https://api.unsplash.com/search/photos?per_page=20&query=${encodeURIComponent(q)}`, { Authorization: 'Client-ID ' + v.key })).results?.map(p => ({
      title: p.description || p.alt_description || 'صورة', url: p.links?.html, snippet: 'تصوير: ' + (p.user?.name || ''), thumb: p.urls?.small
    })) || []
  },
  {
    id: 'github', name: 'GitHub', icon: '💻', kind: 'code',
    note: 'بحث موسع فالمستودعات والكود (توكن اختياري)',
    fields: [{ k: 'token', label: 'Token', ph: 'ghp_... (اختياري)' }],
    run: async (v, q) => {
      const h = v.token ? { Authorization: 'Bearer ' + v.token } : {};
      const d = await jget(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=30`, h);
      return (d.items || []).map(r => ({ title: r.full_name + ' — ' + (r.description || ''), url: r.html_url, snippet: clean(r.description), thumb: r.owner?.avatar_url }));
    }
  },
  {
    id: 'openweather', name: 'الطقس', icon: '🌦️', kind: 'data',
    note: 'OpenWeather — أحوال الطقس والتنبؤات',
    fields: [{ k: 'key', label: 'API Key', ph: 'openweather key' }],
    run: async (v, q) => {
      const d = await jget(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&appid=${encodeURIComponent(v.key)}&units=metric&lang=ar`);
      if (!d || !d.main) return [];
      return [{
        title: 'الطقس فـ' + (d.name || q) + ': ' + (d.weather?.[0]?.description || ''),
        url: 'https://openweathermap.org/city/' + d.id,
        snippet: `الحرارة ${Math.round(d.main.temp)}° · الرطوبة ${d.main.humidity}% · الريح ${d.wind?.speed} م/ث`
      }];
    }
  }
];

export async function connectorSearch(question) {
  const all = loadAll();
  const out = {};
  await Promise.all(CONNECTORS.map(async c => {
    const cfg = all[c.id];
    if (!cfg || !cfg.on) return;
    const v = cfg.fields || {};
    if (!Object.values(v).some(x => String(x || '').trim().length > 4)) return;
    try {
      const items = await c.run(v, question);
      if (items && items.length) out[c.name] = items.map(i => ({ ...i, kind: i.kind || c.kind }));
    } catch (e) { out[c.name] = []; }
  }));
  return out;
}

export async function testConnector(id, question = 'artificial intelligence') {
  const c = CONNECTORS.find(x => x.id === id);
  const cfg = (loadAll() || {})[id];
  if (!c || !cfg) return { ok: false, n: 0, error: 'غير مضبوط' };
  try {
    const items = await c.run(cfg.fields || {}, question);
    return { ok: true, n: (items || []).length };
  } catch (e) {
    return { ok: false, n: 0, error: e.message };
  }
}
