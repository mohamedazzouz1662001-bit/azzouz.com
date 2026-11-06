/* deep.mjs — بحث عميق افتراضي + تركيب جواب عربي مترابط، بلا رفض
   1) بحث واسع متعدد المحركات (1000+ مرجع)  2) بحث علمي للتركيب  3) صياغة نقاط وخلاصة */

import { advancedResearch, instantAnswer, tokenize } from './research.mjs';
import { wideResearch, englishQuery } from './wide.mjs';

const VARIANTS = q => {
  const bare = q.replace(/^(ما هو|ما هي|كيفاش|كيف|لماذا|علاش|واش|هل)\s+/i, '').trim();
  const en = englishQuery(q);
  return [q, bare, q + ' دراسة', en].filter((v, i, a) => v && v.length > 2 && a.indexOf(v) === i).slice(0, 3);
};

// درجة صلة: عبارة السؤال كاملة فاللقب أقوى من كلمة وحدة
function termsOf(q) {
  const ar = qtokens(q);
  const en = tokenize(englishQuery(q)).filter(w => w.length > 2 && !STOP.has(w));
  return [...new Set([...ar, ...en])];
}

function relevance(refs, q) {
  const phraseAr = tokenize(q).filter(w => w.length > 2 && !STOP.has(w)).join(' ');
  const phraseEn = tokenize(englishQuery(q)).filter(w => w.length > 2).join(' ');
  const terms = termsOf(q);
  return refs.map(r => {
    const txt = tokenize((r.title || '') + ' ' + (r.snippet || '')).join(' ');
    let sc = 0;
    if (phraseAr && txt.includes(phraseAr)) sc += 8;
    if (phraseEn && phraseEn.length > 6 && txt.includes(phraseEn)) sc += 8;
    for (const w of terms) if (txt.includes(w)) sc += 2;
    return { r, sc };
  });
}

const STOP = new Set(['هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'على', 'إلى', 'الى', 'عن', 'من', 'في', 'مع', 'أن', 'ان', 'كان', 'كانت', 'بين', 'حيث', 'كما', 'قد', 'لا', 'ما', 'هو', 'هي', 'the', 'and', 'for', 'with', 'that', 'this']);

function qtokens(q) {
  return [...new Set(tokenize(q))].filter(w => w.length > 3 && !STOP.has(w));
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!؟?؛:।])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 40 && s.length <= 420);
}

function scoreSentence(s, q, kind) {
  const st = new Set(tokenize(s));
  let n = 0;
  for (const w of q) if (st.has(w)) n++;
  let bonus = 0;
  if (/يُعرَّف|يعرف|تعريف|هو |هي |عبارة عن|يقصد|يشير إلى|means|refers to/i.test(s)) bonus += 2;
  if (kind === 'method' && /طريقة|خطوات|يتم|يمكن|آلية|كيفية|procedure|steps|using/i.test(s)) bonus += 2;
  if (kind === 'causal' && /بسبب|لأن|نتيجة|يؤدي|يسبب|causes|because|leads to/i.test(s)) bonus += 2;
  if (kind === 'compare' && /بالمقارنة|عكس|بينما|compared|whereas/i.test(s)) bonus += 2;
  if (/لكن|غير أن|تحديات|قيود|however|limitation/i.test(s)) bonus += 1;
  if (/\d/.test(s)) bonus += 1;
  return n * 3 + bonus;
}

function kindOf(q) {
  if (/^(ما|ماذا|شنو|عريف|تعريف)/.test(q)) return 'definition';
  if (/(لماذا|علاش|سبب|أسباب)/.test(q)) return 'causal';
  if (/(كيف|كيفاش|طريقة|خطوات)/.test(q)) return 'method';
  if (/(مقارنة|الفرق|أفضل|ضد|vs)/i.test(q)) return 'compare';
  return 'general';
}

function dedupe(list) {
  const out = [];
  const grams = s => new Set(tokenize(s).filter(w => w.length > 2));
  for (const s of list) {
    const a = grams(s);
    const dup = out.some(o => {
      const b = grams(o);
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      return inter / Math.max(1, Math.min(a.size, b.size)) > 0.72;
    });
    if (!dup) out.push(s);
  }
  return out;
}

function domain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function compose(question, refs, engines = {}, confidence = 65, total = 0) {
  const q = termsOf(question);
  const kind = kindOf(question);

  const cands = [];
  for (const r of refs) {
    for (const sn of splitSentences(r.snippet || '')) cands.push({ s: sn, score: scoreSentence(sn, q, kind), src: r });
  }
  cands.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 7) break;
    if (c.score < 3) break;
    if (!picked.some(p => p.src.url === c.src.url)) picked.push(c);
  }
  const sentences = dedupe(picked.map(p => p.s));

  const titles = refs.filter((r, i, a) => r.title && a.findIndex(x => (x.title || '').toLowerCase() === r.title.toLowerCase()) === i).slice(0, 6);

  const engineCount = Object.values(engines).filter(v => v > 0).length;
  const lines = [`🔎 ${question}`, ''];

  if (sentences.length >= 2) {
    lines.push('*الخلاصة*', sentences[0], '');
    lines.push('*أهم النقاط*');
    sentences.slice(1, 6).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
    if (sentences.length > 4) lines.push('*تفاصيل*', sentences.slice(4, 7).join(' '), '');
  } else {
    lines.push('*الخلاصة*', `لقيت ${total || refs.length} مصدر مرتبط بـ«${question}». أقرب النتائج:`, '');
    lines.push('*أهم العناوين*');
    titles.forEach((r, i) => lines.push(`${i + 1}. ${r.title}${r.year ? ' (' + r.year + ')' : ''}`));
    lines.push('');
    if (sentences.length === 1) lines.push('*مقتطف*', sentences[0], '');
  }

  const trusted = [...new Set(refs.slice(0, 25).map(r => domain(r.url)).filter(Boolean))].slice(0, 6);
  if (trusted.length) lines.push('*المصادر الرئيسية*', trusted.join(' · '), '');

  lines.push(`📚 ${total || refs.length} مصدر · ${engineCount || 1} محرك · ثقة ${confidence}%`);
  return { text: lines.join('\n'), used: sentences.length };
}

export async function deepAnswer(question, { onStage = () => {}, onCount = () => {} } = {}) {
  const q = String(question || '').trim();
  if (q.length < 3) return { type: 'article', text: 'كتب ليا سؤالك ونبحث ليك فكل المصادر.', refs: [], question: q, confidence: 0 };
  const started = Date.now();

  const cached = instantAnswer(q);
  if (cached && cached.answer) {
    return { type: 'article', text: cached.answer, refs: cached.citations || [], question: q, confidence: 85, fromMemory: true, ms: Date.now() - started, engines: {} };
  }

  onStage('كنبحث فـ 20+ محرك ومستودع...');
  const wideP = wideResearch(q, { target: 1000, onProgress: onCount }).catch(() => ({ refs: [], stats: {}, total: 0 }));
  const deepP = advancedResearch({ question: q, deeper: true, variants: VARIANTS(q) }).catch(() => null);
  const [wide, deep] = await Promise.all([wideP, deepP]);

  onStage('كنركّب الجواب...');

  const seen = new Set();
  const refs = [];
  for (const r of ((deep && deep.refs) || [])) {
    const k = r.url || r.title;
    if (k && !seen.has(k)) { seen.add(k); refs.push(r); }
  }
  for (const r of (wide.refs || [])) {
    const k = r.url || r.title;
    if (k && !seen.has(k)) { seen.add(k); refs.push({ title: r.title, url: r.url, engine: r.engine, year: r.year, snippet: '' }); }
  }
  refs.forEach((r, i) => { r.n = i + 1; });

  const engines = wide.stats || {};
  const scored = relevance(refs, q);
  const core = scored.filter(x => x.sc >= 4).map(x => x.r);
  const forCompose = core.length >= 3 ? core : refs;
  const confidence = Math.min(92, Math.max(45, 40 + Math.round(Math.log2(refs.length + 1) * 6)));
  const built = compose(q, forCompose, engines, confidence, refs.length);

  const text = built.text;

  return {
    type: 'article', text, refs, question: q, confidence,
    words: text.split(/\s+/).length, ms: Date.now() - started, engines,
    wide: { total: wide.total || 0 }
  };
}
