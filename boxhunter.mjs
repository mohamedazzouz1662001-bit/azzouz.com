/* boxhunter.mjs — TikTok Box Hunter داخل AZZOUZ AI
   ملاحظة صريحة: TikTok ما كتوفرش API عمومي لصناديق LIVE ولا جمع العملات.
   لهذا: الاكتشاف مساعد (رابط/بث + فحص الكلمات)، والجمع كيتم بفتح البث بيد المستخدم.
*/

const K = { b: 'bh-boxes', l: 'bh-logs', s: 'bh-settings' };
const DEF = { on: true, notify: false, ttl: 15, kinds: { treasure: true, live: true }, lang: 'ar' };

function rd(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }
function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const boxes = () => rd(K.b, []);
const logs = () => rd(K.l, []);
const setts = () => ({ ...DEF, ...rd(K.s, {}) });

function logIt(kind, text) {
  const L = logs(); L.unshift({ at: Date.now(), kind, text }); wr(K.l, L.slice(0, 300));
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(ms) {
  if (ms <= 0) return 'سالا';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return m + 'د ' + String(s).padStart(2, '0') + 'ث';
}

function notify(title, body) {
  const st = setts();
  if (st.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: 'icon.svg' }); } catch (e) {}
  }
  const host = document.getElementById('bh-toast');
  if (host) {
    const d = document.createElement('div');
    d.className = 'bh-toast';
    d.textContent = title + ' — ' + body;
    host.appendChild(d);
    setTimeout(() => d.remove(), 6000);
  }
}

async function probe(url) {
  try {
    const r = await fetch('https://r.jina.ai/' + url, { signal: AbortSignal.timeout(14000) });
    const t = await r.text();
    const hit = /(treasure\s*box|صندوق|كلوفر|clover|gift\s*box|مكافأة|reward)/i.test(t);
    return { ok: true, treasure: hit, size: t.length };
  } catch (e) { return { ok: false, treasure: false, size: 0 }; }
}

function addBox({ host, url, ttl }) {
  const st = setts();
  const B = boxes();
  const id = (url || host || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-24) || 'b' + Date.now();
  if (B.some(b => b.id === id && b.status === 'available')) return { dup: true };
  const b = { id, host: host || 'بث', url: url || '', at: Date.now(), ttl: (ttl || st.ttl) * 60000, status: 'available', coins: 0, confirmed: false, tries: 0 };
  B.unshift(b); wr(K.b, B.slice(0, 400));
  logIt('detect', 'صندوق جديد: ' + (host || url));
  notify('🎁 صندوق جديد', (host || 'بث') + ' — عندك ' + Math.round(b.ttl / 60000) + ' دقيقة');
  return { box: b };
}

function tick() {
  const B = boxes(); let changed = false;
  B.forEach(b => {
    if (b.status !== 'available') return;
    const left = b.at + b.ttl - Date.now();
    if (left <= 0) { b.status = 'expired'; changed = true; logIt('expire', 'انتهى صندوق ' + b.host); notify('⌛ صندوق سالا', b.host); }
    else if (left < 180000 && !b.warned) { b.warned = true; changed = true; logIt('warn', 'قرب يسالي: ' + b.host); notify('⏳ قرب يسالي', b.host + ' — ' + fmt(left)); }
  });
  if (changed) wr(K.b, B);
}

function collect(id, mode) {
  const B = boxes(); const b = B.find(x => x.id === id); if (!b) return;
  const st = setts();
  if (mode === 'open') {
    b.tries = (b.tries || 0) + 1; b.lastTry = Date.now(); wr(K.b, B);
    logIt('open', 'تحل البث باش تجمع بيدك: ' + b.host);
    if (!st.autoNote) { /* auto غير متاح رسميا */ }
    notify('↗️ تحل البث', 'جمع المكافأة كيتم بيدك حيت TikTok ما كتسمحش بالجمع الآلي');
    if (b.url) window.open(b.url, '_blank', 'noopener');
    return;
  }
  if (mode === 'done') {
    const v = prompt('شحال ديال العملات ولا المكافآت تأكدو؟ (رقم)', '0');
    const coins = Math.max(0, parseInt(String(v || '0').replace(/[^\d]/g, ''), 10) || 0);
    b.status = 'collected'; b.coins = coins; b.confirmed = coins > 0; b.doneAt = Date.now();
    wr(K.b, B); logIt('collect', 'تسجل جمع: ' + b.host + ' — ' + coins + ' عملة');
    notify('✅ تسجل الجمع', b.host + (coins ? ' — ' + coins + ' عملة مؤكدة' : ' — بلا رقم مؤكد'));
    return;
  }
  if (mode === 'fail') {
    b.status = 'expired'; b.failed = true; wr(K.b, B);
    logIt('fail', 'فشل الجمع: ' + b.host); notify('⚠️ فشل الجمع', b.host);
  }
}

export function render(root) {
  if (!root) return;
  if (!document.getElementById('bh-style')) {
    const s = document.createElement('style'); s.id = 'bh-style';
    s.textContent = `
    #paneHunter{--bh1:#0a0710;--bh2:#140b22;--pp:#a06bff;--bl:#4cc2ff}
    .bh-wrap{background:linear-gradient(160deg,#0a0710,#140b22 60%,#0b1220);border-radius:14px;padding:12px;color:#e9e4ff}
    .bh-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .bh-hd b{font-size:15px;background:linear-gradient(90deg,#a06bff,#4cc2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
    .bh-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}
    .bh-c{background:#170f26;border:1px solid #2a1d42;border-radius:10px;padding:7px}
    .bh-c b{display:block;font-size:16px;color:#c9b3ff}.bh-c span{font-size:10.5px;color:#9d93b8}
    .bh-in{width:100%;background:#120d1d;border:1px solid #2a1d42;color:#e9e4ff;border-radius:9px;padding:8px;font-family:inherit;font-size:12.5px}
    .bh-b{background:linear-gradient(90deg,#7a3cff,#2f9bff);color:#fff;border:0;border-radius:9px;padding:8px 11px;font-size:12px;font-family:inherit;cursor:pointer;margin:3px 3px 0 0}
    .bh-b.g{background:#1c1430;border:1px solid #3a2a5e;color:#cfc2f5}
    .bh-b.r{background:#2a1020;border:1px solid #5a2340;color:#ffb3cf}
    .bh-row{background:#150f22;border:1px solid #2a1d42;border-radius:10px;padding:8px;margin-top:6px}
    .bh-row b{font-size:12.5px}.bh-t{font-size:11px;color:#9d93b8}
    .bh-live{color:#59f2b2}.bh-warn{color:#ffd166}.bh-dead{color:#ff7b7b}
    .bh-toast{background:#1d1330;border:1px solid #a06bff;padding:7px 9px;border-radius:8px;font-size:11.5px;margin-top:5px}
    .bh-lg{max-height:150px;overflow:auto;font-size:11px;color:#a99fc4}
    `;
    document.head.appendChild(s);
  }
  const st = setts();
  tick();
  const B = boxes();
  const now = Date.now();
  const avail = B.filter(b => b.status === 'available' && b.at + b.ttl > now);
  const done = B.filter(b => b.status === 'collected');
  const expired = B.filter(b => b.status === 'expired');
  const coins = done.reduce((s, b) => s + (b.confirmed ? b.coins || 0 : 0), 0);
  const last = done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))[0];
  avail.sort((a, b) => (a.at + a.ttl) - (b.at + b.ttl));

  root.innerHTML = `
  <div class="bh-wrap">
    <div class="bh-hd"><b>🎁 TikTok Box Hunter</b><span class="bh-t">مراقبة مساعدة</span></div>
    <div class="bh-t">حالة الحساب: <span class="bh-warn">ماشي مربوط رسميا</span> — TikTok ما كتوفرش API عمومي لصناديق LIVE. الجمع كيتم بيدك.</div>
    <div class="bh-cards">
      <div class="bh-c"><b>${B.length}</b><span>مكتشفة</span></div>
      <div class="bh-c"><b>${avail.length}</b><span>متاحة دابا</span></div>
      <div class="bh-c"><b>${done.length}</b><span>مجمعة</span></div>
      <div class="bh-c"><b>${coins}</b><span>عملات مؤكدة</span></div>
      <div class="bh-c"><b>${expired.length}</b><span>سالاو</span></div>
      <div class="bh-c"><b>${last ? fmt(now - (last.doneAt || now)) : '—'}</b><span>آخر جمع</span></div>
    </div>
    <input class="bh-in" id="bhUrl" placeholder="رابط البث ولا @اسم_الحساب" />
    <input class="bh-in" id="bhTtl" type="number" min="1" max="180" value="${st.ttl}" placeholder="مدة الصندوق بالدقايق" style="margin-top:5px" />
    <button class="bh-b" id="bhAdd">➕ زيد وراقب</button>
    <button class="bh-b g" id="bhScan">🔎 فحص الصفحة</button>
    <button class="bh-b g" id="bhPerm">${st.notify ? '🔔 الإشعارات شاعلة' : '🔕 شعل الإشعارات'}</button>
    <button class="bh-b r" id="bhClear">🧹 نظف المسالي</button>
    <div id="bh-toast"></div>
    ${avail.length ? '<div class="bh-t" style="margin-top:8px">⬇️ مرتبة حسب الوقت اللي باقي</div>' : ''}
    ${avail.map(b => `
      <div class="bh-row">
        <b>${esc(b.host)}</b> <span class="bh-live">● متاح</span>
        <div class="bh-t">باقي: ${fmt(b.at + b.ttl - now)} · تسجل ${new Date(b.at).toLocaleTimeString('ar-MA')}</div>
        <button class="bh-b" data-open="${b.id}">↗️ حل وجمع</button>
        <button class="bh-b g" data-done="${b.id}">✅ تسجل الجمع</button>
        <button class="bh-b r" data-fail="${b.id}">⚠️ فشل</button>
      </div>`).join('')}
    ${done.length ? '<div class="bh-t" style="margin-top:8px">📦 تاريخ الجمع</div>' + done.slice(0, 6).map(b => `<div class="bh-t">• ${esc(b.host)} — ${b.confirmed ? b.coins + ' عملة مؤكدة' : 'بلا رقم'} · ${new Date(b.doneAt || b.at).toLocaleDateString('ar-MA')}</div>`).join('') : ''}
    <div class="bh-t" style="margin-top:10px">📋 آخر الأحداث</div>
    <div class="bh-lg">${logs().slice(0, 12).map(l => `<div>${new Date(l.at).toLocaleTimeString('ar-MA')} — ${esc(l.text)}</div>`).join('') || '<div>ما كاين حتى حدث.</div>'}</div>
  </div>`;

  const $ = s => root.querySelector(s);
  $('#bhAdd')?.addEventListener('click', async () => {
    const raw = ($('#bhUrl').value || '').trim();
    if (!raw) return;
    const ttl = parseInt($('#bhTtl').value, 10) || st.ttl;
    const url = /^https?:\/\//i.test(raw) ? raw : 'https://www.tiktok.com/@' + raw.replace(/^@/, '');
    const host = (raw.match(/@([\w.]+)/) || [, raw])[1];
    const res = addBox({ host, url, ttl });
    if (res.dup) { logIt('dup', 'صندوق موجود من قبل: ' + host); alert('هادا الصندوق مسجل من قبل.'); }
    render(root);
  });
  $('#bhScan')?.addEventListener('click', async () => {
    const raw = ($('#bhUrl').value || '').trim();
    if (!raw) return alert('حط رابط البث ولا الحساب الأول.');
    const url = /^https?:\/\//i.test(raw) ? raw : 'https://www.tiktok.com/@' + raw.replace(/^@/, '');
    const r = await probe(url);
    logIt('probe', (r.ok ? 'فحص ناجح' : 'فحص فشل') + ' — ' + url);
    alert(r.ok ? (r.treasure ? '✅ الصفحة كتذكر صندوق ولا مكافأة (فحص كلمات).' : 'ℹ️ الصفحة تحملات، ولكن ما لقيتش كلمة صندوق.') : '⚠️ ما قدرتش نقرا الصفحة (TikTok قد يحجب القراءة).');
    render(root);
  });
  $('#bhPerm')?.addEventListener('click', async () => {
    if (!('Notification' in window)) return alert('المتصفح ما كيدعمش الإشعارات.');
    const p = await Notification.requestPermission();
    const s2 = setts(); s2.notify = p === 'granted'; wr(K.s, s2);
    render(root);
  });
  $('#bhClear')?.addEventListener('click', () => {
    if (!confirm('تحيد كل الصناديق والسجل؟')) return;
    wr(K.b, []); wr(K.l, []); render(root);
  });
  root.querySelectorAll('[data-open]').forEach(el => el.onclick = () => { collect(el.dataset.open, 'open'); });
  root.querySelectorAll('[data-done]').forEach(el => el.onclick = () => { collect(el.dataset.done, 'done'); render(root); });
  root.querySelectorAll('[data-fail]').forEach(el => el.onclick = () => { collect(el.dataset.fail, 'fail'); render(root); });
}

export function startWatcher() {
  tick();
  setInterval(tick, 15000);
}
