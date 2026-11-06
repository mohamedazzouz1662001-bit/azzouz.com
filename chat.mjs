/* chat.mjs — مساعد يتعلم منك ويبحث فكل المصادر */
import { advancedResearch, memory } from './research.mjs';

const KB_KEY = 'azzouz-kb-v1';
const ST_KEY = 'azzouz-chat-v1';

function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

export function kb() { return read(KB_KEY, { rules: [], facts: [] }); }

export function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[أإآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function state() { return read(ST_KEY, { lastQuestion: '', depth: 0, history: [] }); }
export function saveState(s) { write(ST_KEY, s); }

export function teach(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const K = kb();

  let m = t.match(/(?:إذا|اذا|ملي|وقت|كلما)\s*(?:قلت|نقول|قلتي|كتبت|سولتيني|سألتيني)\s*[:"«»]?\s*(.{2,60}?)\s*[:"«»]?\s*(?:قل|قول|جاوب|جواب|رد|كتب)\s*[:"«»]?\s*(.{2,300})$/i);
  if (m) {
    const trigger = m[1].trim(), reply = m[2].trim();
    K.rules = K.rules.filter(r => norm(r.trigger) !== norm(trigger));
    K.rules.push({ trigger, reply, ts: Date.now() });
    write(KB_KEY, K);
    return { kind: 'rule', trigger, reply };
  }

  m = t.match(/^(.{2,60}?)\s*(?:=|=>|:|<-|←)\s*(.{2,300})$/);
  if (m) {
    const trigger = m[1].trim(), reply = m[2].trim();
    K.rules = K.rules.filter(r => norm(r.trigger) !== norm(trigger));
    K.rules.push({ trigger, reply, ts: Date.now() });
    write(KB_KEY, K);
    return { kind: 'rule', trigger, reply };
  }

  m = t.match(/^(?:تعل[مّ]|تذك[رّ]|احفظ|سج[لّ]|خزن|أضف|اضف)\s*(?:أن|ان|بأن|بلي|:)?\s*(.{3,400})$/i);
  if (m) {
    const fact = m[1].trim();
    K.facts = K.facts.filter(f => norm(f.fact) !== norm(fact));
    K.facts.push({ fact, ts: Date.now() });
    write(KB_KEY, K);
    return { kind: 'fact', fact };
  }

  m = t.match(/^(?:اسمي|سميتي|كنسمي|أنا|انا)\s+(.{2,40})$/i);
  if (m) {
    const fact = 'اسم المستخدم: ' + m[1].trim();
    K.facts = K.facts.filter(f => !norm(f.fact).startsWith('اسم المستخدم'));
    K.facts.push({ fact, ts: Date.now() });
    write(KB_KEY, K);
    return { kind: 'fact', fact };
  }
  return null;
}

const GREET = ['السلام', 'سلام', 'صباح الخير', 'مساء الخير', 'اهلا', 'مرحبا', 'هاي', 'hello', 'hi', 'bonjour', 'salut', 'salam'];
const THANKS = ['شكرا', 'thanks', 'merci', 'بارك الله'];
const BYE = ['بسلامة', 'الى اللقاء', 'bye', 'au revoir'];

export function isGreeting(text) {
  const n = norm(text);
  if (!n || n.split(' ').length > 4) return false;
  return GREET.some(g => n === norm(g) || n.startsWith(norm(g) + ' '));
}

export function greetingReply(text) {
  const n = norm(text);
  const K = kb();
  const hit = K.rules.find(r => {
    const trig = norm(r.trigger);
    return trig && (n === trig || n.includes(trig));
  });
  if (hit) return hit.reply;
  if (n.includes('صباح')) return 'صباح النور ☀️ كيف نقدر نعاونك اليوم؟';
  if (n.includes('مساء')) return 'مساء النور 🌙 شنو بغيتي نبحث ليك فيه؟';
  return 'وعليكم السلام 👋 أنا مساعدك: سولني أي سؤال ونبحث فكل المصادر، ولا علّمني حاجة تقول «تعلم أن ...».';
}

export function isThanks(text) {
  const n = norm(text);
  return THANKS.some(t => n === norm(t) || n.includes(norm(t)));
}

export function isBye(text) {
  const n = norm(text);
  return BYE.some(t => n === norm(t) || n.includes(norm(t)));
}

export function isRetry(text) {
  const n = norm(text);
  return /^(عاود|اعد|وسع|زيد|كمل|وسع البحث|عاود بحث|بحث اكثر|تعمق)/.test(n) || n === 'عاود';
}

export function isQuestion(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.endsWith('؟') || t.endsWith('?')) return true;
  return /^(ما|ماذا|كيف|كيفاش|لماذا|علاش|من|متى|فوقاش|وين|فين|هل|واش|أي|اي|شحال|كم|بشحال|شنو|أشنو|اشنو|define|what|how|why|when|who|which)/i.test(t) || t.length > 18;
}

function variantsFor(q) {
  const base = q.trim();
  return [base + ' بحث علمي', base + ' دراسة', base + ' أحدث المعلومات'];
}

export async function chatTurn(text, { onSource, onStage } = {}) {
  const raw = String(text || '').trim();
  if (!raw) return { type: 'reply', text: 'كتب ليا سؤالك ولا المعلومة اللي بغيتي نتعلمها.' };
  const st = state();

  const learned = teach(raw);
  if (learned) {
    st.history = [...(st.history || []), { role: 'user', text: raw, ts: Date.now() }].slice(-40);
    saveState(st);
    const reply = learned.kind === 'rule'
      ? '✅ تعلمت القاعدة: إلا سولتيني «' + learned.trigger + '» غادي نجاوب «' + learned.reply + '»'
      : '🧠 تعلمت: ' + learned.fact;
    return { type: 'learned', text: reply, learned };
  }

  if (isRetry(raw)) {
    const q = st.lastQuestion;
    if (!q) return { type: 'reply', text: 'ما عندي حتى سؤال سابق نعاودو. كتب ليا سؤالك أولا.' };
    st.depth = (st.depth || 0) + 1;
    saveState(st);
    onStage && onStage('توسيع البحث: ' + q);
    const res = await advancedResearch({ question: q, onSource, deeper: true, variants: variantsFor(q) });
    if (!res) return { type: 'reply', text: 'ما لقيتش مصادر إضافية. جرب صياغة أخرى للسؤال.' };
    const head = '🔎 وسّعت البحث (جولة ' + st.depth + ') على: ' + q + '\n\n';
    return { type: 'article', text: head + res.text, refs: res.refs, words: res.words, question: q, depth: st.depth };
  }

  if (isGreeting(raw)) return { type: 'reply', text: greetingReply(raw) };
  if (isThanks(raw)) return { type: 'reply', text: 'على الرحب والسعة 🌿 إلا بغيتي شي حاجة أخرى غير قولها.' };
  if (isBye(raw)) return { type: 'reply', text: 'بسلامة 👋 أي وقت محتاجني أنا هنا.' };

  const K = kb();
  const nRaw = norm(raw);
  const ruleHit = K.rules.find(r => nRaw === norm(r.trigger));
  if (ruleHit) return { type: 'reply', text: ruleHit.reply, learnedRule: true };

  onStage && onStage('كنبحث فكل المصادر...');
  const res = await advancedResearch({ question: raw, onSource });
  if (!res) return { type: 'reply', text: 'ما وصلات حتى نتيجة من المصادر. عاود جرب بصياغة أخرى ولا بالإنجليزية.' };

  st.lastQuestion = raw; st.depth = 0;
  st.history = [...(st.history || []), { role: 'user', text: raw, ts: Date.now() }, { role: 'bot', text: res.text.slice(0, 400), ts: Date.now() }].slice(-40);
  saveState(st);
  return { type: 'article', text: res.text, refs: res.refs, words: res.words, question: raw, citations: res.citations };
}

export function stats() {
  const K = kb();
  return { rules: K.rules.length, facts: K.facts.length, searches: memory().length };
}

/* ===== البحث الدائم فالخلفية ===== */
const BG_KEY = 'azzouz-bg-v1';
const SEEDS = [
  'كيف يتواصل البشر',
  'لغة الجسد في التواصل',
  'أنماط الحوار الفعّال',
  'الذكاء الاصطناعي في التعليم',
  'أمن المعلومات والتشفير',
  'ضغط البيانات',
  'الطاقة المتجددة',
  'الصيام المتقطع والصحة',
  'علم النفس المعرفي',
  'تاريخ الكتابة',
  'الاقتصاد الرقمي',
  'الفضاء والاستكشاف'
];

export function bg() { return read(BG_KEY, { queue: [], done: [], cycles: 0, last: 0 }); }
function saveBg(b) { localStorage.setItem(BG_KEY, JSON.stringify(b)); }

export function ensureSeeds() {
  const b = bg();
  if (!b.queue.length) {
    const used = new Set(b.done.map(d => d.topic));
    b.queue = SEEDS.filter(t => !used.has(t));
    saveBg(b);
  }
  return b;
}

export function takeTopic() {
  const b = ensureSeeds();
  if (!b.queue.length) {
    const now = Date.now();
    b.queue = SEEDS.map(t => `${t} — ${new Date(now).getFullYear()}`);
    saveBg(b);
  }
  const topic = b.queue.shift();
  saveBg(b);
  return topic;
}

export async function backgroundTick() {
  const topic = takeTopic();
  const r = await advancedResearch({ question: topic });
  const b = bg();
  b.cycles += 1;
  b.last = Date.now();
  b.done.unshift({ topic, refs: (r?.refs || []).length, words: r?.words || 0, ts: Date.now() });
  b.done = b.done.slice(0, 60);
  saveBg(b);
  return { topic, refs: (r?.refs || []).length, words: r?.words || 0 };
}

export function bgStats() {
  const b = bg();
  return { cycles: b.cycles, last: b.last, queue: b.queue.length, done: b.done.slice(0, 6) };
}
