/* wide.mjs — توسيع البحث لأقصى عدد من المصادر (هدف 1000) */

const enc = encodeURIComponent;

async function jget(url, ms = 12000) {
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

/* محرك ويب عبر قارئ الصفحات: كيرجع روابط + عناوين */
function parseSerp(text, engine) {
  const out = [];
  const re = /\[([^\]\n]{12,120})\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const title = m[1].replace(/\s+/g, ' ').trim();
    const url = m[2];
    if (/jina\.ai|bing\.com|duckduckgo|mojeek|google\./.test(url)) continue;
    out.push({ title, url, snippet: '', engine });
  }
  return out;
}

const GLOSSARY = {
  'تشفير': 'encryption', 'التشفير': 'encryption', 'المتماثل': 'symmetric', 'متماثل': 'symmetric',
  'ذكاء': 'artificial intelligence', 'اصطناعي': 'artificial intelligence',
  'تعلم': 'machine learning', 'آلة': 'machine learning', 'خوارزمية': 'algorithm', 'خوارزميات': 'algorithms',
  'تضخم': 'inflation', 'اقتصاد': 'economics', 'سوق': 'market', 'مالية': 'finance',
  'صيام': 'fasting', 'متقطع': 'intermittent fasting', 'غذاء': 'nutrition', 'تغذية': 'nutrition',
  'طاقة': 'energy', 'متجددة': 'renewable energy', 'شمسية': 'solar energy',
  'مناخ': 'climate', 'بيئة': 'environment', 'ماء': 'water', 'تربة': 'soil',
  'صحة': 'health', 'مرض': 'disease', 'سرطان': 'cancer', 'سكري': 'diabetes', 'قلب': 'heart',
  'دماغ': 'brain', 'نفس': 'psychology', 'نفسي': 'psychology', 'تعليم': 'education', 'تعلم': 'learning',
  'رياضيات': 'mathematics', 'فيزياء': 'physics', 'كيمياء': 'chemistry', 'أحياء': 'biology',
  'برمجة': 'programming', 'برنامج': 'software', 'تطبيق': 'application', 'موقع': 'website',
  'شبكة': 'network', 'أمن': 'security', 'بيانات': 'data', 'قاعدة': 'database',
  'تاريخ': 'history', 'فلسفة': 'philosophy', 'أدب': 'literature', 'لغة': 'language',
  'قرآن': 'quran', 'إسلام': 'islam', 'فقه': 'fiqh', 'حديث': 'hadith',
  'زليج': 'zellige mosaic', 'فخار': 'pottery', 'نسيج': 'textile', 'طبخ': 'cooking',
  'سفر': 'travel', 'سياحة': 'tourism', 'مدينة': 'city', 'معمار': 'architecture',
  'ذكاء اصطناعي': 'artificial intelligence', 'شبكات عصبية': 'neural networks',
  'ضغط': 'compression', 'صور': 'image processing', 'فيديو': 'video',
  'روبوت': 'robotics', 'سيارة': 'car', 'كهرباء': 'electricity', 'بطارية': 'battery'
};

export function englishQuery(question) {
  const q = String(question).toLowerCase();
  const hits = [];
  for (const [ar, en] of Object.entries(GLOSSARY)) {
    if (q.includes(ar) && !hits.includes(en)) hits.push(en);
  }
  return hits.slice(0, 4).join(' ');
}

export async function wideResearch(question, { target = 2000, onProgress = () => {} } = {}) {
  const q = question;
  const en = englishQuery(question);
  const terms = en && en !== q ? [q, en] : [q];
  const seen = new Set();
  const refs = [];
  const stats = {};

  const add = (engine, items) => {
    let n = 0;
    for (const it of items || []) {
      if (!it || !it.url || !it.title) continue;
      const key = String(it.url).split('#')[0].replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ n: refs.length + 1, title: String(it.title).slice(0, 180), url: it.url, engine, year: it.year || null });
      n++;
    }
    stats[engine] = (stats[engine] || 0) + n;
    onProgress(refs.length, engine, stats);
    return n;
  };

  const workers = [];

  // OpenAlex — 3 صفحات × 100
  for (let page = 1; page <= 4; page++) {
    workers.push(async () => {
      const t = terms[page % terms.length];
      const d = await jget(`https://api.openalex.org/works?search=${enc(t)}&per_page=100&page=${page}&sort=relevance_score:desc`);
      add('OpenAlex', (d.results || []).map(w => ({
        title: w.display_name || w.title, url: w.doi ? 'https://doi.org/' + w.doi.replace('https://doi.org/', '') : (w.id || ''), year: w.publication_year
      })));
    });
  }

  // Crossref — 200
  for (let off = 0; off < 500; off += 100) {
    workers.push(async () => {
      const t = terms[(off / 100) % terms.length];
      const d = await jget(`https://api.crossref.org/works?query=${enc(t)}&rows=100&offset=${off}&select=title,URL,issued`);
      add('Crossref', (d.message?.items || []).map(i => ({
        title: (i.title || [])[0], url: i.URL, year: i.issued?.['date-parts']?.[0]?.[0]
      })));
    });
  }

  // Europe PMC — 200
  for (let page = 1; page <= 3; page++) {
    workers.push(async () => {
      const t = terms[page % terms.length];
      const d = await jget(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(t)}&format=json&pageSize=100&page=${page}`);
      add('Europe PMC', (d.resultList?.result || []).map(r => ({
        title: r.title, url: r.doi ? 'https://doi.org/' + r.doi : 'https://europepmc.org/article/' + (r.source || 'MED') + '/' + r.id, year: r.pubYear
      })));
    });
  }

  // PubMed — 100
  workers.push(async () => {
    const t = terms[terms.length - 1];
    const s = await jget(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${enc(t)}&retmode=json&retmax=200`);
    const ids = (s.esearchresult?.idlist || []).join(',');
    if (!ids) return;
    const d = await jget(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids}`);
    add('PubMed', Object.values(d.result || {}).filter(x => x.uid).map(x => ({
      title: x.title, url: 'https://pubmed.ncbi.nlm.nih.gov/' + x.uid + '/', year: x.pubdate
    })));
  });

  // Stack Exchange — 6 مواقع × 30
  for (const site of ['stackoverflow', 'superuser', 'math', 'physics', 'security', 'askubuntu', 'stats', 'datascience', 'electronics', 'chemistry', 'biology', 'health', 'academia', 'english', 'cooking', 'travel']) {
    workers.push(async () => {
      const t = terms[terms.length - 1];
      const d = await jget(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${enc(t)}&site=${site}&pagesize=30`);
      add('Stack ' + site, (d.items || []).map(i => ({ title: i.title, url: i.link, year: i.creation_date ? new Date(i.creation_date * 1000).getFullYear() : null })));
    });
  }

  // ويكيبيديا بعدة لغات (تسلسلي باش ما يتلاقاوش الليميتات)
  workers.push(async () => {
    for (const lang of ['ar', 'en', 'fr', 'es', 'de', 'tr', 'ru', 'it', 'pt', 'nl']) {
      try {
        const d = await jget(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${enc(q)}&limit=20`);
        add('Wikipedia ' + lang, (d.pages || []).map(p => ({ title: p.title, url: `https://${lang}.wikipedia.org/wiki/${enc(p.key || p.title)}` })));
      } catch (e) { /* نكملو اللغة الجاية */ }
      await new Promise(r => setTimeout(r, 120));
    }
  });

  // GitHub repos + code
  workers.push(async () => {
    const t = terms[terms.length - 1];
    const d = await jget(`https://api.github.com/search/repositories?q=${enc(t)}&sort=stars&per_page=50`);
    add('GitHub', (d.items || []).map(r => ({ title: r.full_name + ' — ' + (r.description || ''), url: r.html_url, year: r.created_at?.slice(0, 4) })));
  });

  // Hacker News
  workers.push(async () => {
    const t = terms[terms.length - 1];
    const d = await jget(`https://hn.algolia.com/api/v1/search?query=${enc(t)}&hitsPerPage=100`);
    add('Hacker News', (d.hits || []).map(h => ({ title: h.title || h.story_title, url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID), year: h.created_at?.slice(0, 4) })));
  });

  // DEV
  workers.push(async () => {
    const d = await jget(`https://dev.to/api/articles?per_page=50&top=365`);
    add('DEV', (d || []).filter(a => new RegExp(q.split(/\s+/)[0] || 'x', 'i').test(a.title + a.description)).map(a => ({ title: a.title, url: a.url })));
  });

  // Open Library
  workers.push(async () => {
    const d = await jget(`https://openlibrary.org/search.json?q=${enc(q)}&limit=100&fields=title,author_name,first_publish_year,key`);
    add('Open Library', (d.docs || []).map(b => ({ title: b.title, url: 'https://openlibrary.org' + b.key, year: b.first_publish_year })));
  });

  // محركات ويب عامة (Bing / DuckDuckGo HTML / Mojeek) عبر قارئ الصفحات
  const serps = [
    ['bing', `https://r.jina.ai/https://www.bing.com/search?q=${enc(q)}&count=30`],
    ['duckduckgo', `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${enc(q)}`],
    ['mojeek', `https://r.jina.ai/https://www.mojeek.com/search?q=${enc(q)}`],
  ];
  for (const [name, url] of serps) {
    workers.push(async () => {
      const text = await jtext(url);
      add(name, parseSerp(text, name));
    });
  }

  // Zenodo (تسلسلي)
  workers.push(async () => {
    for (let page = 1; page <= 3; page++) {
      try {
        const t = terms[page % terms.length];
        const d = await jget(`https://zenodo.org/api/records?q=${enc(t)}&size=100&page=${page}`);
        add('Zenodo', (d.hits?.hits || []).map(h => ({ title: h.metadata?.title, url: h.links?.self_html || h.doi_url, year: h.metadata?.publication_date?.slice(0, 4) })));
      } catch (e) {}
      await new Promise(r => setTimeout(r, 150));
    }
  });

  // DOAJ
  for (let page = 1; page <= 2; page++) {
    workers.push(async () => {
      const t = terms[page % terms.length];
      const d = await jget(`https://doaj.org/api/v2/search/articles/${enc(t)}?pageSize=100&page=${page}`);
      add('DOAJ', (d.results || []).map(r => ({ title: r.bibjson?.title, url: r.bibjson?.link?.[0]?.url, year: r.bibjson?.year })));
    });
  }

  // HAL
  for (let page = 1; page <= 2; page++) {
    workers.push(async () => {
      const t = terms[page % terms.length];
      const d = await jget(`https://api.archives-ouvertes.fr/search/?q=${enc(t)}&fl=title_s,uri_s,producedDateY_i&rows=100&start=${(page - 1) * 100}&wt=json`);
      add('HAL', (d.response?.docs || []).map(x => ({ title: (x.title_s || [])[0], url: x.uri_s, year: x.producedDateY_i })));
    });
  }

  // Internet Archive
  workers.push(async () => {
    const t = terms[terms.length - 1];
    const d = await jget(`https://archive.org/advancedsearch.php?q=${enc(t)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=100&output=json`);
    add('Internet Archive', (d.response?.docs || []).map(x => ({ title: x.title, url: 'https://archive.org/details/' + x.identifier, year: x.year })));
  });

  // Wikimedia Commons
  workers.push(async () => {
    const d = await jget(`https://commons.wikimedia.org/w/rest.php/v1/search/page?q=${enc(q)}&limit=20`);
    add('Commons', (d.pages || []).map(p => ({ title: p.title, url: 'https://commons.wikimedia.org/wiki/' + enc(p.key || p.title) })));
  });

  // GitHub code search
  workers.push(async () => {
    const t = terms[terms.length - 1];
    const d = await jget(`https://api.github.com/search/code?q=${enc(t)}&per_page=30`, 14000);
    add('GitHub code', (d.items || []).map(x => ({ title: x.name + ' — ' + x.repository?.full_name, url: x.html_url })));
  });

  // تنفيذ متوازي محدود
  const limit = 5;
  let i = 0;
  async function runner() {
    while (i < workers.length && refs.length < target) {
      const job = workers[i++];
      try { await job(); }
      catch (e) {
        await new Promise(r => setTimeout(r, 900));
        try { await job(); } catch (e2) { /* فشل نهائي: نكملو */ }
      }
      onProgress(refs.length, 'batch', stats);
    }
  }
  await Promise.all(Array.from({ length: limit }, runner));

  return { refs, stats, total: refs.length };
}
