/* research-cron.mjs — باحث مستقل كيخدم فGitHub Actions بلا أي فلوس ولا مفاتيح.
 * كيقرا المواضيع من data/topics.json، كيبحث فيهم فمصادر عمومية، وكيكتب data/memory.json.
 * التشغيل: node scripts/research-cron.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const enc = encodeURIComponent;

async function jget(url, ms = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json', 'User-Agent': 'azzouz-cron' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const clean = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const ENGINES = [
  ['OpenAlex', async q => {
    const d = await jget(`https://api.openalex.org/works?search=${enc(q)}&per_page=25&sort=relevance_score:desc`);
    return (d.results || []).map(w => ({
      title: w.display_name, url: w.doi ? 'https://doi.org/' + String(w.doi).replace('https://doi.org/', '') : w.id,
      snippet: clean(w.title), year: w.publication_year
    }));
  }],
  ['Crossref', async q => {
    const d = await jget(`https://api.crossref.org/works?query=${enc(q)}&rows=25&select=title,URL,abstract,issued`);
    return (d.message?.items || []).map(i => ({
      title: (i.title || [])[0], url: i.URL, snippet: clean(i.abstract), year: i.issued?.['date-parts']?.[0]?.[0]
    }));
  }],
  ['Wikipedia', async q => {
    const d = await jget(`https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&format=json&srlimit=10&origin=*`);
    return (d.query?.search || []).map(p => ({
      title: p.title, url: 'https://ar.wikipedia.org/wiki/' + enc(p.title), snippet: clean(p.snippet)
    }));
  }],
  ['Wikipedia EN', async q => {
    const d = await jget(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&format=json&srlimit=10&origin=*`);
    return (d.query?.search || []).map(p => ({
      title: p.title, url: 'https://en.wikipedia.org/wiki/' + enc(p.title), snippet: clean(p.snippet)
    }));
  }],
  ['Hacker News', async q => {
    const d = await jget(`https://hn.algolia.com/api/v1/search?query=${enc(q)}&hitsPerPage=20`);
    return (d.hits || []).map(h => ({
      title: h.title || h.story_title, url: h.url || 'https://news.ycombinator.com/item?id=' + h.objectID,
      snippet: clean(h.story_text || h.comment_text)
    }));
  }],
  ['GitHub', async q => {
    const d = await jget(`https://api.github.com/search/repositories?per_page=15&sort=stars&q=${enc(q)}`);
    return (d.items || []).map(i => ({ title: i.full_name, url: i.html_url, snippet: clean(i.description) }));
  }],
  ['Open Library', async q => {
    const d = await jget(`https://openlibrary.org/search.json?q=${enc(q)}&limit=10`);
    return (d.docs || []).map(b => ({
      title: b.title, url: 'https://openlibrary.org' + (b.key || ''), snippet: (b.author_name || []).join(', ')
    }));
  }],
  ['Internet Archive', async q => {
    const d = await jget(`https://archive.org/advancedsearch.php?q=${enc(q)}&fl[]=title&fl[]=identifier&rows=15&output=json`);
    return (d.response?.docs || []).map(x => ({
      title: x.title, url: 'https://archive.org/details/' + x.identifier, snippet: 'أرشيف'
    }));
  }],
  ['Stack Exchange', async q => {
    const d = await jget(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${enc(q)}&site=stackoverflow&pagesize=15`);
    return (d.items || []).map(i => ({ title: i.title, url: i.link, snippet: clean(i.title) }));
  }],
  ['œuvres (Wikidata)', async q => {
    const d = await jget(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(q)}&language=ar&format=json&limit=10&origin=*`);
    return (d.search || []).map(e => ({
      title: e.label || e.id, url: 'https://www.wikidata.org/wiki/' + e.id, snippet: clean(e.description)
    }));
  }]
];

async function research(topic) {
  const refs = [], seen = new Set(), stats = {};
  for (const [name, run] of ENGINES) {
    try {
      const items = await run(topic);
      let n = 0;
      for (const it of items || []) {
        if (!it || !it.url || !it.title) continue;
        const key = String(it.url).split('#')[0];
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ title: String(it.title).slice(0, 160), url: it.url, snippet: String(it.snippet || '').slice(0, 240), source: name, year: it.year || null });
        n++;
      }
      stats[name] = n;
    } catch (e) {
      stats[name] = 'error';
    }
  }
  const top = refs.slice(0, 8);
  const summary = top.length
    ? `تجميع من ${Object.keys(stats).length} مصدر (${refs.length} نتيجة). أبرز العناوين: ` +
      top.map(r => r.title).slice(0, 6).join(' · ')
    : 'ما لقيتش نتائج فهاد الدورة.';
  return { topic, refs, stats, count: refs.length, summary, at: new Date().toISOString() };
}

const main = async () => {
  let topics = [];
  try { topics = JSON.parse(await readFile(ROOT + 'data/topics.json', 'utf8')); } catch (e) {}
  if (!Array.isArray(topics) || !topics.length) topics = ['الصيام المتقطع'];

  await mkdir(ROOT + 'data', { recursive: true });
  let mem = { updated: null, entries: [] };
  try { mem = JSON.parse(await readFile(ROOT + 'data/memory.json', 'utf8')); } catch (e) {}
  const byTopic = new Map((mem.entries || []).map(e => [e.topic, e]));

  for (const topic of topics.slice(0, 4)) {
    const r = await research(topic);
    byTopic.set(topic, r);
    console.log(`${topic}: ${r.count} مصادر`);
  }

  const entries = [...byTopic.values()]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 200);

  await writeFile(ROOT + 'data/memory.json', JSON.stringify({ updated: new Date().toISOString(), entries }, null, 1));
  console.log('كتبت data/memory.json —', entries.length, 'موضوع');
};

main().catch(e => { console.error('فشل:', e.message); process.exit(1); });
