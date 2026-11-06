/* wide.mjs v2 — سلسلة بحث واسعة: 30+ محرك ومستودع، مع مقتطفات وصور وفيديو */

import { connectorSearch } from './connectors.mjs?v=1';

const enc = encodeURIComponent;

async function jget(url, ms = 13000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function jtext(url, ms = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: 'text/plain' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

const clean = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 320);

/* abstracts اللي كتجي مقلوبة فـOpenAlex */
function invAbstract(inv) {
  if (!inv) return '';
  const pos = [];
  for (const [w, idxs] of Object.entries(inv)) for (const i of idxs) pos[i] = w;
  return clean(pos.join(' '));
}

function realUrl(u) {
  try {
    if (/duckduckgo\.com\/l\//.test(u)) {
      const q = new URL(u).searchParams.get('uddg');
      if (q) return decodeURIComponent(q);
    }
  } catch (e) {}
  return u;
}

function parseSerp(text, engine) {
  const out = [];
  const re = /\[([^\]\n]{10,140})\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const title = m[1].replace(/\s+/g, ' ').trim();
    const url = realUrl(m[2]);
    if (/jina\.ai|bing\.com|duckduckgo|mojeek|google\./.test(url)) continue;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 320);
    const snip = clean(rest.split('\n').filter(l => l.trim() && !/^\[/.test(l)).slice(0, 2).join(' '));
    out.push({ title, url, snippet: snip, engine });
  }
  return out;
}

const COMPOUND = {
  'ضغط البيانات': 'data compression', 'ضغط الصور': 'image compression', 'ضغط الفيديو': 'video compression',
  'التشفير المتماثل': 'symmetric encryption', 'التشفير غير المتماثل': 'asymmetric encryption',
  'الصيام المتقطع': 'intermittent fasting', 'أمن المعلومات': 'information security',
  'الطاقة المتجددة': 'renewable energy', 'تغير المناخ': 'climate change',
  'التعلم الآلي': 'machine learning', 'التعلم العميق': 'deep learning',
  'قواعد البيانات': 'databases', 'الشبكات العصبية': 'neural networks',
  'الذكاء الاصطناعي': 'artificial intelligence', 'معالجة اللغة الطبيعية': 'natural language processing',
  'أمن الشبكات': 'network security', 'الاقتصاد الرقمي': 'digital economy',
  'الصحة النفسية': 'mental health', 'الاقتصاد الكلي': 'macroeconomics'
};

const GLOSSARY = {
  'تشفير': 'encryption', 'المتماثل': 'symmetric', 'متماثل': 'symmetric',
  'ذكاء': 'artificial intelligence', 'اصطناعي': 'artificial intelligence',
  'تعلم': 'machine learning', 'خوارزمية': 'algorithm', 'خوارزميات': 'algorithms',
  'تضخم': 'inflation', 'اقتصاد': 'economics', 'سوق': 'market', 'مالية': 'finance',
  'صيام': 'fasting', 'غذاء': 'nutrition', 'تغذية': 'nutrition',
  'طاقة': 'energy', 'متجددة': 'renewable energy', 'شمسية': 'solar energy',
  'مناخ': 'climate', 'بيئة': 'environment', 'ماء': 'water',
  'صحة': 'health', 'مرض': 'disease', 'سرطان': 'cancer', 'سكري': 'diabetes', 'قلب': 'heart',
  'دماغ': 'brain', 'نفسي': 'psychology', 'تعليم': 'education',
  'رياضيات': 'mathematics', 'فيزياء': 'physics', 'كيمياء': 'chemistry', 'أحياء': 'biology',
  'برمجة': 'programming', 'برنامج': 'software', 'تطبيق': 'application', 'موقع': 'website',
  'شبكة': 'network', 'أمن': 'security', 'بيانات': 'data', 'قاعدة': 'database',
  'تاريخ': 'history', 'فلسفة': 'philosophy', 'أدب': 'literature', 'لغة': 'language',
  'قرآن': 'quran', 'إسلام': 'islam', 'فقه': 'fiqh', 'حديث': 'hadith',
  'زليج': 'zellige mosaic', 'فخار': 'pottery', 'نسيج': 'textile', 'طبخ': 'cooking',
  'سفر': 'travel', 'سياحة': 'tourism', 'مدينة': 'city', 'معمار': 'architecture',
  'ضغط': 'compression', 'صور': 'image', 'فيديو': 'video',
  'روبوت': 'robotics', 'سيارة': 'car', 'كهرباء': 'electricity', 'بطارية': 'battery',
  'بحث': 'research', 'مراجع': 'references', 'كتاب': 'book'
};

export function englishQuery(question) {
  const q = String(question).toLowerCase();
  const hits = [];
  for (const [ar, en] of Object.entries(COMPOUND)) if (q.includes(ar) && !hits.includes(en)) hits.unshift(en);
  for (const [ar, en] of Object.entries(GLOSSARY)) if (q.includes(ar) && !hits.includes(en)) hits.push(en);
  return hits.slice(0, 4).join(' ');
}

/* ============ المحركات ============ */
const ENGINES = [
  { name: 'OpenAlex', kind: 'paper', run: async (q, en, add) => {
    for (let p = 1; p <= 4; p++) {
      const t = p % 2 ? q : (en || q);
      const d = await jget(`https://api.openalex.org/works?search=${enc(t)}&per_page=100&page=${p}&sort=relevance_score:desc`);
      add('paper', (d.results || []).map(w => ({
        title: w.display_name || w.title,
        url: w.doi ? 'https://doi.org/' + String(w.doi).replace('https://doi.org/', '') : w.id,
        snippet: invAbstract(w.abstract_inverted_index),
        year: w.publication_year
      })));
    }
  }},

  { name: 'Crossref', kind: 'paper', run: async (q, en, add) => {
    for (let off = 0; off < 400; off += 100) {
      const d = await jget(`https://api.crossref.org/works?query=${enc(off % 200 ? (en || q) : q)}&rows=100&offset=${off}&select=title,URL,issued,abstract`);
      add('paper', (d.message?.items || []).map(i => ({
        title: (i.title || [])[0], url: i.URL, snippet: clean(i.abstract),
        year: i.issued?.['date-parts']?.[0]?.[0]
      })));
    }
  }},

  { name: 'Semantic Scholar', kind: 'paper', run: async (q, en, add) => {
    for (let off = 0; off < 200; off += 100) {
      const d = await jget(`https://api.semanticscholar.org/graph/v1/paper/search?query=${enc(off ? (en || q) : q)}&limit=100&offset=${off}&fields=title,abstract,url,year,externalIds`);
      add('paper', (d.data || []).map(p => ({
        title: p.title, url: p.url || (p.externalIds?.DOI ? 'https://doi.org/' + p.externalIds.DOI : ''),
        snippet: clean(p.abstract), year: p.year
      })));
    }
  }},

  { name: 'Europe PMC', kind: 'paper', run: async (q, en, add) => {
    for (let p = 1; p <= 3; p++) {
      const d = await jget(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(p % 2 ? q : (en || q))}&format=json&pageSize=100&page=${p}`);
      add('paper', (d.resultList?.result || []).map(r => ({
        title: r.title, url: r.doi ? 'https://doi.org/' + r.doi : 'https://europepmc.org/article/' + (r.source || 'MED') + '/' + r.id,
        snippet: clean(r.abstractText), year: r.pubYear
      })));
    }
  }},

  { name: 'PubMed', kind: 'paper', run: async (q, en, add) => {
    const s = await jget(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${enc(en || q)}&retmode=json&retmax=200`);
    const ids = (s.esearchresult?.idlist || []).join(',');
    if (!ids) return;
    const d = await jget(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids}`);
    add('paper', Object.values(d.result || {}).filter(x => x.uid).map(x => ({
      title: x.title, url: 'https://pubmed.ncbi.nlm.nih.gov/' + x.uid + '/', year: x.pubdate
    })));
  }},

  { name: 'arXiv', kind: 'paper', run: async (q, en, add) => {
    for (let p = 0; p < 2; p++) {
      const txt = await jtext(`https://export.arxiv.org/api/query?search_query=all:${enc(en || q)}&start=${p * 50}&max_results=50`);
      const entries = txt.split('<entry>').slice(1);
      add('paper', entries.map(e => {
        const title = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const id = (e.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || '';
        const abs = (e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '';
        const yr = (e.match(/<published>(\d{4})/) || [])[1];
        return { title: clean(title), url: id.trim(), snippet: clean(abs), year: yr };
      }));
    }
  }},

  { name: 'DataCite', kind: 'paper', run: async (q, en, add) => {
    const d = await jget(`https://api.datacite.org/dois?query=${enc(q)}&page[size]=100`);
    add('paper', (d.data || []).map(x => ({
      title: x.attributes?.titles?.[0]?.title,
      url: x.attributes?.url || ('https://doi.org/' + x.id),
      snippet: clean(x.attributes?.descriptions?.[0]?.description),
      year: x.attributes?.publicationYear
    })));
  }},

  { name: 'OpenAIRE', kind: 'paper', run: async (q, en, add) => {
    const d = await jget(`https://api.openaire.eu/search/publications?keywords=${enc(q)}&format=json&size=50`);
    const arr = d?.response?.results?.result || [];
    add('paper', (Array.isArray(arr) ? arr : [arr]).map(x => {
      const m = x?.metadata?.['oaf:entity']?.['oaf:result'] || {};
      return {
        title: m.title?.['$'] || m.title,
        url: m.children?.['instance']?.webresource?.url?.['$'] || '',
        snippet: clean(m.description?.['$'] || m.description),
        year: m.dateofacceptance?.['$']?.slice(0, 4)
      };
    }));
  }},

  { name: 'DOAJ', kind: 'paper', run: async (q, en, add) => {
    for (let p = 1; p <= 2; p++) {
      const d = await jget(`https://doaj.org/api/v2/search/articles/${enc(p % 2 ? q : (en || q))}?pageSize=100&page=${p}`);
      add('paper', (d.results || []).map(r => ({
        title: r.bibjson?.title, url: r.bibjson?.link?.[0]?.url,
        snippet: clean(r.bibjson?.abstract), year: r.bibjson?.year
      })));
    }
  }},

  { name: 'HAL', kind: 'paper', run: async (q, en, add) => {
    for (let p = 0; p < 2; p++) {
      const d = await jget(`https://api.archives-ouvertes.fr/search/?q=${enc(p % 2 ? q : (en || q))}&fl=title_s,uri_s,producedDateY_i,abstract_s&rows=100&start=${p * 100}&wt=json`);
      add('paper', (d.response?.docs || []).map(x => ({
        title: (x.title_s || [])[0], url: x.uri_s,
        snippet: clean((x.abstract_s || [])[0]), year: x.producedDateY_i
      })));
    }
  }},

  { name: 'Zenodo', kind: 'paper', run: async (q, en, add) => {
    for (let p = 1; p <= 3; p++) {
      const d = await jget(`https://zenodo.org/api/records?q=${enc(p % 2 ? q : (en || q))}&size=100&page=${p}`);
      add('paper', (d.hits?.hits || []).map(h => ({
        title: h.metadata?.title, url: h.links?.self_html || h.doi_url,
        snippet: clean(h.metadata?.description), year: h.metadata?.publication_date?.slice(0, 4)
      })));
    }
  }},

  { name: 'Internet Archive', kind: 'archive', run: async (q, en, add) => {
    const d = await jget(`https://archive.org/advancedsearch.php?q=${enc(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=mediatype&rows=100&output=json`);
    add('archive', (d.response?.docs || []).map(x => ({
      title: x.title, url: 'https://archive.org/details/' + x.identifier,
      snippet: x.mediatype ? 'نوع الملف: ' + x.mediatype : '', year: x.year
    })));
  }},

  { name: 'Google Books', kind: 'book', run: async (q, en, add) => {
    for (const t of [q, en].filter(Boolean)) {
      const d = await jget(`https://www.googleapis.com/books/v1/volumes?q=${enc(t)}&maxResults=40`);
      add('book', (d.items || []).map(b => ({
        title: b.volumeInfo?.title, url: b.volumeInfo?.infoLink,
        snippet: clean(b.volumeInfo?.description), year: b.volumeInfo?.publishedDate?.slice(0, 4),
        thumb: b.volumeInfo?.imageLinks?.thumbnail
      })));
    }
  }},

  { name: 'Open Library', kind: 'book', run: async (q, en, add) => {
    const d = await jget(`https://openlibrary.org/search.json?q=${enc(q)}&limit=100&fields=title,author_name,first_publish_year,key,cover_i`);
    add('book', (d.docs || []).map(b => ({
      title: b.title + (b.author_name ? ' — ' + b.author_name[0] : ''),
      url: 'https://openlibrary.org' + b.key, year: b.first_publish_year,
      thumb: b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg' : ''
    })));
  }},

  { name: 'Wikipedia', kind: 'article', run: async (q, en, add) => {
    for (const lang of ['ar', 'en', 'fr', 'es', 'de', 'tr', 'ru', 'it', 'pt', 'nl', 'id', 'fa']) {
      try {
        const d = await jget(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${enc(lang === 'ar' ? q : (en || q))}&limit=15`);
        add('article', (d.pages || []).map(p => ({
          title: p.title, url: `https://${lang}.wikipedia.org/wiki/${enc(p.key || p.title)}`,
          snippet: clean(p.description), thumb: p.thumbnail?.url || ''
        })));
      } catch (e) {}
      await new Promise(r => setTimeout(r, 90));
    }
  }},

  { name: 'Wikidata', kind: 'data', run: async (q, en, add) => {
    const d = await jget(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(q)}&language=ar&limit=20&format=json&origin=*`);
    add('data', (d.search || []).map(s => ({
      title: s.label + (s.description ? ' — ' + s.description : ''), url: 'https://www.wikidata.org/wiki/' + s.id
    })));
  }},

  { name: 'Stack Exchange', kind: 'code', run: async (q, en, add) => {
    for (const site of ['stackoverflow', 'superuser', 'math', 'physics', 'security', 'askubuntu', 'stats', 'datascience', 'electronics', 'chemistry', 'biology', 'health', 'academia', 'cooking', 'travel', 'islam']) {
      try {
        const d = await jget(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${enc(en || q)}&site=${site}&pagesize=30&filter=default`);
        add('code', (d.items || []).map(i => ({
          title: i.title, url: i.link, snippet: (i.tags || []).join(' · '),
          year: i.creation_date ? new Date(i.creation_date * 1000).getFullYear() : null
        })));
      } catch (e) {}
      await new Promise(r => setTimeout(r, 90));
    }
  }},

  { name: 'GitHub', kind: 'code', run: async (q, en, add) => {
    const d = await jget(`https://api.github.com/search/repositories?q=${enc(en || q)}&sort=stars&per_page=50`);
    add('code', (d.items || []).map(r => ({
      title: r.full_name + ' — ' + (r.description || ''), url: r.html_url,
      snippet: clean(r.description), year: r.created_at?.slice(0, 4), thumb: r.owner?.avatar_url
    })));
    try {
      const c = await jget(`https://api.github.com/search/code?q=${enc(en || q)}&per_page=30`, 14000);
      add('code', (c.items || []).map(x => ({ title: x.name + ' — ' + x.repository?.full_name, url: x.html_url })));
    } catch (e) {}
  }},

  { name: 'GitLab', kind: 'code', run: async (q, en, add) => {
    const d = await jget(`https://gitlab.com/api/v4/projects?search=${enc(en || q)}&per_page=50&order_by=star_count`);
    add('code', (d || []).map(p => ({ title: p.name_with_namespace + ' — ' + (p.description || ''), url: p.web_url, snippet: clean(p.description) })));
  }},

  { name: 'Codeberg', kind: 'code', run: async (q, en, add) => {
    const d = await jget(`https://codeberg.org/api/v1/repos/search?q=${enc(en || q)}&limit=40`);
    add('code', (d.data || []).map(r => ({ title: r.full_name + ' — ' + (r.description || ''), url: r.html_url, snippet: clean(r.description) })));
  }},

  { name: 'npm', kind: 'code', run: async (q, en, add) => {
    const d = await jget(`https://registry.npmjs.org/-/v1/search?text=${enc(en || q)}&size=40`);
    add('code', (d.objects || []).map(o => ({
      title: o.package?.name + ' — ' + (o.package?.description || ''), url: o.package?.links?.npm || '',
      snippet: clean(o.package?.description)
    })));
  }},

  { name: 'crates.io', kind: 'code', run: async (q, en, add) => {
    const d = await jget(`https://crates.io/api/v1/crates?q=${enc(en || q)}&per_page=40`);
    add('code', (d.crates || []).map(c => ({ title: c.name + ' — ' + (c.description || ''), url: 'https://crates.io/crates/' + c.name, snippet: clean(c.description) })));
  }},

  { name: 'Hacker News', kind: 'social', run: async (q, en, add) => {
    const d = await jget(`https://hn.algolia.com/api/v1/search?query=${enc(en || q)}&hitsPerPage=100`);
    add('social', (d.hits || []).map(h => ({
      title: h.title || h.story_title, url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
      snippet: clean(h.story_text || h.comment_text), year: h.created_at?.slice(0, 4)
    })));
  }},

  { name: 'DEV', kind: 'social', run: async (q, en, add) => {
    const d = await jget(`https://dev.to/api/articles?per_page=50&top=365`);
    const rx = new RegExp((en || q).split(/\s+/)[0] || 'x', 'i');
    add('social', (d || []).filter(a => rx.test(a.title + ' ' + (a.description || ''))).map(a => ({
      title: a.title, url: a.url, snippet: clean(a.description), thumb: a.cover_image || '', year: a.published_at?.slice(0, 4)
    })));
  }},

  { name: 'YouTube', kind: 'video', run: async (q, en, add) => {
    for (const host of ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de']) {
      try {
        const d = await jget(`${host}/search?q=${enc(en || q)}&filter=videos`);
        add('video', (d.items || []).slice(0, 40).map(v => ({
          title: v.title, url: 'https://www.youtube.com/watch?v=' + (v.url || '').replace('/watch?v=', ''),
          snippet: (v.uploaderName || '') + (v.duration ? ' · ' + Math.round(v.duration / 60) + 'د' : ''),
          thumb: v.thumbnail || ''
        })));
        break;
      } catch (e) {}
    }
  }},

  { name: 'Dailymotion', kind: 'video', run: async (q, en, add) => {
    const d = await jget(`https://api.dailymotion.com/videos?search=${enc(en || q)}&fields=title,url,thumbnail_240_url,duration,created_time&limit=30`);
    add('video', (d.list || []).map(v => ({
      title: v.title, url: 'https://www.dailymotion.com/video/' + v.id,
      snippet: v.duration ? Math.round(v.duration / 60) + ' دقيقة' : '', thumb: v.thumbnail_240_url
    })));
  }},

  { name: 'Apple Podcasts', kind: 'audio', run: async (q, en, add) => {
    const d = await jget(`https://itunes.apple.com/search?term=${enc(en || q)}&media=podcast&limit=30`);
    add('audio', (d.results || []).map(p => ({
      title: p.collectionName, url: p.collectionViewUrl, snippet: clean(p.artistName), thumb: p.artworkUrl100
    })));
  }},

  { name: 'Wikimedia Commons', kind: 'image', run: async (q, en, add) => {
    const d = await jget(`https://commons.wikimedia.org/w/rest.php/v1/search/page?q=${enc(q)}&limit=30`);
    add('image', (d.pages || []).map(p => ({
      title: p.title, url: 'https://commons.wikimedia.org/wiki/' + enc(p.key || p.title),
      snippet: clean(p.description), thumb: p.thumbnail?.url || ''
    })));
  }},

  { name: 'Art Institute', kind: 'image', run: async (q, en, add) => {
    const d = await jget(`https://api.artic.edu/api/v1/artworks/search?q=${enc(en || q)}&limit=30&fields=id,title,image_id,artist_display`);
    add('image', (d.data || []).map(a => ({
      title: a.title + (a.artist_display ? ' — ' + a.artist_display : ''),
      url: 'https://www.artic.edu/artworks/' + a.id,
      thumb: a.image_id ? `https://www.artic.edu/iiif/2/${a.image_id}/full/200,/0/default.jpg` : ''
    })));
  }},

  { name: 'ClinicalTrials', kind: 'study', run: async (q, en, add) => {
    const d = await jget(`https://clinicaltrials.gov/api/v2/studies?query.term=${enc(en || q)}&pageSize=50&format=json`);
    add('study', (d.studies || []).map(s => ({
      title: s.protocolSection?.identificationModule?.briefTitle,
      url: 'https://clinicaltrials.gov/study/' + s.protocolSection?.identificationModule?.nctId,
      snippet: clean(s.protocolSection?.descriptionModule?.briefSummary)
    })));
  }},

  { name: 'GDELT News', kind: 'news', run: async (q, en, add) => {
    const d = await jget(`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc(en || q)}&mode=artlist&maxrecords=50&format=json`);
    add('news', (d.articles || []).map(a => ({ title: a.title, url: a.url, snippet: a.domain, year: (a.seendate || '').slice(0, 4) })));
  }},

  { name: 'Nominatim', kind: 'place', run: async (q, en, add) => {
    const d = await jget(`https://nominatim.openstreetmap.org/search?q=${enc(q)}&format=json&limit=10`);
    add('place', (d || []).map(p => ({ title: p.display_name, url: 'https://www.openstreetmap.org/' + p.osm_type + '/' + p.osm_id, snippet: p.type })));
  }},

  { name: 'Web', kind: 'article', run: async (q, en, add) => {
    const serps = [
      ['duckduckgo', `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${enc(q)}`],
      ['duckduckgo-en', `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${enc(en || q)}`],
      ['reddit', `https://r.jina.ai/https://www.reddit.com/search/?q=${enc(en || q)}`],
      ['stackoverflow-web', `https://r.jina.ai/https://stackoverflow.com/search?q=${enc(en || q)}`]
    ];
    for (const [name, url] of serps) {
      try { add('article', parseSerp(await jtext(url), name)); } catch (e) {}
      await new Promise(r => setTimeout(r, 1200));
    }
  }},

  { name: 'PeerTube', kind: 'video', run: async (q, en, add) => {
    for (const t of [q, en].filter(Boolean)) {
      const d = await jget(`https://sepiasearch.org/api/v1/search/videos?search=${enc(t)}&count=50`);
      add('video', (d.data || []).map(v => ({
        title: v.name, url: v.url || ('https://sepiasearch.org/w/' + v.shortUUID),
        snippet: (v.channel?.displayName || '') + (v.duration ? ' · ' + Math.round(v.duration / 60) + 'د' : ''),
        thumb: v.thumbnailUrl || ''
      })));
    }
  }},

  { name: 'Openverse', kind: 'image', run: async (q, en, add) => {
    for (let p = 1; p <= 2; p++) {
      const d = await jget(`https://api.openverse.org/v1/images/?q=${enc(en || q)}&page_size=100&page=${p}`);
      add('image', (d.results || []).map(i => ({
        title: i.title || i.creator || 'صورة', url: i.foreign_landing_url || i.url,
        snippet: (i.creator ? 'تصوير: ' + i.creator + ' · ' : '') + (i.license || ''),
        thumb: i.thumbnail || i.url
      })));
    }
  }},

  { name: 'Archive Video', kind: 'video', run: async (q, en, add) => {
    const d = await jget(`https://archive.org/advancedsearch.php?q=${enc(en || q)}+AND+mediatype%3Amovies&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=50&output=json`);
    add('video', (d.response?.docs || []).map(x => ({ title: x.title, url: 'https://archive.org/details/' + x.identifier, year: x.year })));
  }}
];

export async function wideResearch(question, { target = 3000, onProgress = () => {} } = {}) {
  const q = String(question || '').trim();
  const en = englishQuery(q);
  const seen = new Set();
  const refs = [];
  const stats = {};

  const add = (kind, items, engineName) => {
    let n = 0;
    for (const it of items || []) {
      if (!it || !it.url || !it.title) continue;
      const key = String(it.url).split('#')[0].replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        n: refs.length + 1,
        title: clean(it.title).slice(0, 180),
        url: it.url,
        snippet: clean(it.snippet || '').slice(0, 260),
        thumb: it.thumb || '',
        kind: it.kind || kind,
        year: it.year || null
      });
      n++;
    }
    if (engineName) stats[engineName] = n;
    return n;
  };

  // الوصلات اللي ربطها المستخدم (Google / YouTube / ...) كتخدم قبل كلشي
  try {
    const conn = await connectorSearch(q);
    for (const [name, items] of Object.entries(conn)) add(items[0]?.kind || 'article', items, name);
    onProgress(refs.length, 'connectors', stats);
  } catch (e) {}

  let cursor = 0;
  const limit = 6;
  async function runner() {
    while (cursor < ENGINES.length && refs.length < target) {
      const engine = ENGINES[cursor++];
      try {
        await engine.run(q, en, add);
      } catch (e) {
        await new Promise(r => setTimeout(r, 700));
        try { await engine.run(q, en, add); } catch (e2) {}
      }
      stats[engine.name] = refs.length;
      onProgress(refs.length, engine.name, stats);
    }
  }
  await Promise.all(Array.from({ length: limit }, runner));

  return { refs, stats, total: refs.length, engines: ENGINES.length };
}
