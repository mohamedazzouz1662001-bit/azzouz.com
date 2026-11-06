/* reason.mjs — طبقة العقل: تصنيف السؤال، استدلال، ثم كتابة نص مترابط */

function tok(s) {
  return String(s || '').toLowerCase()
    .replace(/[\u0640\u064b-\u065f]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .split(/[^\p{L}\p{N}]+/u)
    .map(w => (w.length > 4 && w.startsWith('ال')) ? w.slice(2) : w)
    .filter(w => w.length > 2);
}

const CONN = ['بالإضافة إلى ذلك، ', 'كما تشير المصادر إلى أن ', 'ومن جهة أخرى، ', 'وفي السياق نفسه، ', 'ويضاف إلى ذلك أن '];

export function classify(q) {
  const t = String(q || '').trim();
  if (/^(ما|ماذا|شنو|أشنو|اشنو|عرف|تعريف|what is|define)/i.test(t)) return 'definition';
  if (/(لماذا|علاش|سبب|أسباب|why|because)/i.test(t)) return 'causal';
  if (/(كيف|كيفاش|طريقة|خطوات|how)/i.test(t)) return 'method';
  if (/(مقارنة|الفرق|أفضل|ضد|versus|vs|difference)/i.test(t)) return 'compare';
  if (/(متى|تاريخ|عام|سنة|when|history)/i.test(t)) return 'historical';
  if (/(هل|واش|صحيح|is it|does)/i.test(t)) return 'verify';
  return 'general';
}

const ASPECTS = {
  definition: /(يُعرَّف|يعرف|تعريف|هو|هي|يقصد|يطلق|عبارة عن|means|refers to)/i,
  causal: /(بسبب|لأن|نتيجة|يؤدي|يسبب|يرتبط|العوامل|causes|because|leads to)/i,
  method: /(طريقة|خطوات|يتم|يمكن|يستخدم|آلية|كيفية|procedure|steps|using)/i,
  evidence: /(دراسة|بحث|أظهرت|أشارت|نتائج|وجدت|study|research|found)/i,
  limits: /(لكن|غير أن|بيد أن|تحديات|قيود|خلافاً|however|limitation|challenge)/i,
  numbers: /\d/
};

export function reasonAndWrite(question, sources) {
  if (!sources || !sources.length) return null;
  const type = classify(question);
  const qTok = tok(question).filter(w => w.length > 3);
  const need = qTok.length >= 2 ? Math.max(2, Math.ceil(qTok.length * 0.5)) : 1;
  const cands = [];
  sources.forEach((s) => {
    const titleTok = new Set(tok(s.title || ''));
    String(s.snippet || '').split(/(?<=[.!?؟؛])\s+/).forEach((sent) => {
      const t = sent.trim();
      if (t.length < 70 || t.length > 380) return;
      const st = new Set(tok(t));
      let hit = 0;
      for (const w of qTok) if (st.has(w)) hit++;
      const inTitle = [...qTok].filter(w => titleTok.has(w)).length;
      // شرط الصلة: خاص الجملة تكون مرتبطة بالسؤال، ماشي غير كلمة عابرة
      if (hit < need && inTitle === 0) return;
      let aspect = 'other';
      for (const [k, re] of Object.entries(ASPECTS)) { if (re.test(t)) { aspect = k; break; } }
      cands.push({ t, n: s.n, aspect, score: (aspect === type ? 2 : 0) + hit * 1.5 + inTitle + Math.min(1, t.length / 200) });
    });
  });
  if (cands.length < 3) {
    // تخفيف: نقبل جملة فيها كلمة رئيسية وحدة إلا كان الناتج قليل
    sources.forEach((s) => {
      String(s.snippet || '').split(/(?<=[.!?؟؛])\s+/).forEach((sent) => {
        const t = sent.trim();
        if (t.length < 70 || t.length > 380) return;
        if (cands.some(c => c.t === t)) return;
        const st = new Set(tok(t));
        if (!qTok.some(w => st.has(w))) return;
        cands.push({ t, n: s.n, aspect: 'other', score: 0.5 });
      });
    });
  }
  if (!cands.length) return null;

  const pickAspect = (a, max) => cands.filter(c => c.aspect === a).sort((x, y) => y.score - x.score).slice(0, max);
  const definitional = pickAspect('definition', 3);
  const causal = pickAspect('causal', 3);
  const method = pickAspect('method', 3);
  const evidence = pickAspect('evidence', 3);
  const limits = pickAspect('limits', 2);
  const nums = pickAspect('numbers', 2);

  const unique = (arr) => {
    const out = [];
    arr.forEach(c => { if (!out.some(o => o.t === c.t)) out.push(c); });
    return out;
  };

  const used = new Set();
  const para = (items, leader) => {
    const sel = unique(items).filter(i => !used.has(i.t));
    sel.forEach(i => used.add(i.t));
    if (!sel.length) return '';
    let text = '';
    sel.forEach((item, idx) => {
      text += (idx === 0 ? (leader || '') : CONN[idx % CONN.length]) + item.t + ' [' + item.n + '] ';
    });
    return text.trim();
  };

  const parts = [];
  parts.push(`📌 ${question}\n`);
  const lead = para(definitional, '');
  if (lead) parts.push('*الجواب*\n' + lead);

  const why = para(causal, 'والسبب في ذلك أن ');
  if (why) parts.push('*لماذا*\n' + why);

  const how = para(method, 'أما من الناحية العملية، ');
  if (how) parts.push('*كيف*\n' + how);

  const ev = para(evidence, 'وقد بينت الدراسات أن ');
  if (ev) parts.push('*ما تقوله الأبحاث*\n' + ev);

  const nm = para(nums, 'ومن الأرقام الواردة: ');
  if (nm) parts.push('*أرقام*\n' + nm);

  const lim = para(limits, 'غير أن ');
  if (lim) parts.push('*تحفظات*\n' + lim);

  const agreement = sources.filter(s => (s.engines || []).length > 1).length;
  const confidence = Math.min(95, 45 + Math.round((sources.length / 4) * 10) + agreement * 6);
  parts.push(`*الخلاصة*\nركّبت هاد الجواب من ${sources.length} مصدر (${agreement} منهم متطابقين فأكثر من محرك). درجة الثقة: ${confidence}%.`);

  const text = parts.join('\n\n');
  return { text, type, confidence, words: text.split(/\s+/).length, used: [...used], usedCount: used.size };
}
