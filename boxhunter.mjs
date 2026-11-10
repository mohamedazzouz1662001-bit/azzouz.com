/* boxhunter.mjs — TikTok Box Hunter داخل AZZOUZ AI
   ملاحظة صريحة: TikTok ما كتوفرش API عمومي لصناديق LIVE ولا جمع العملات.
   لهذا: الاكتشاف مساعد (رابط/بث + فحص الكلمات)، والجمع كيتم بفتح البث بيد المستخدم.
*/

const K = { b: 'bh-boxes', l: 'bh-logs', s: 'bh-settings' };
const DEF = { on: true, silent: true, notify: false, ttl: 15, kinds: { treasure: true, live: true }, lang: 'ar' };

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

function msg(t) {
  const w = document.querySelector('#paneHunter .bh-wrap');
  if (!w) return;
  let d = document.getElementById('bh-msg');
  if (!d) { d = document.createElement('div'); d.id = 'bh-msg'; d.className = 'bh-toast'; w.appendChild(d); }
  d.textContent = String(t);
  clearTimeout(d._t); d._t = setTimeout(() => d.remove(), 7000);
}
function need(text) {
  const n = rd('bh-need', { n: 0 });
  wr('bh-need', { n: (n.n || 0) + 1, text, at: Date.now() });
}
function notify(title, body) {
  const st = setts();
  if (st.silent) { logIt('quiet', title + ' — ' + body); need(title); return; }
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

/* ===== Smart Radar ===== */
function radarKeywords() { const st = setts(); return (st.radarKw || 'maroc,live').split(',').map(x => x.trim()).filter(Boolean); }
async function tagPool(kw) {
  try {
    const r = await fetch('https://r.jina.ai/https://www.tiktok.com/tag/' + encodeURIComponent(kw.replace(/\s+/g, '')), { signal: AbortSignal.timeout(18000) });
    const t = await r.text();
    const m = t.match(/tiktok[.]com[/]@[A-Za-z0-9_.]{2,24}/g) || [];
    return Array.from(new Set(m.map(x => x.split('@')[1]))).slice(0, 40);
  } catch (e) { return []; }
}
async function checkLive(user) {
  try {
    const r = await fetch('https://r.jina.ai/https://www.tiktok.com/@' + user + '/live', { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { live: !/No LIVE/i.test(t), boxHint: /(treasure|صندوق|كلوفر|clover|gift box)/i.test(t) };
  } catch (e) { return { live: false, boxHint: false }; }
}
let RADAR_BUSY = false;
async function radarCycle() {
  const st = setts();
  if (!st.radar || RADAR_BUSY) return;
  RADAR_BUSY = true;
  try {
    const seen = rd('bh-radar-seen', {});
    for (const kw of radarKeywords().slice(0, 2)) {
      const pool = await tagPool(kw);
      const fresh = pool.filter(u => !seen[u]).slice(0, 4);
      for (const u of fresh) {
        seen[u] = Date.now();
        const r = await checkLive(u);
        if (r.live) { addBox({ host: '@' + u, url: 'https://www.tiktok.com/@' + u + '/live', ttl: st.ttl }); logIt('radar', 'بث مباشر: @' + u + (r.boxHint ? ' · إشارة صندوق' : '')); }
      }
    }
    wr('bh-radar-seen', seen);
  } catch (e) { logIt('radar', 'خطأ فالرادار: ' + e.message); }
  RADAR_BUSY = false;
}

function tick() {
  const st0 = setts();
  if (!st0.on) return;
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
    if (b.url && mode === 'open' && !setts().silent) window.open(b.url, '_blank', 'noopener');
    if (b.url && mode === 'open' && setts().silent) msg('🔇 الهدوء شاعل: الرابط واجد، حلّو بيدك ملي تفرغ. ' + b.url);
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


/* ===== ربط حساب TikTok رسميا (Login Kit + PKCE) ===== */
const TK = { key: 'bh-tk-client', tok: 'bh-tk-token', ver: 'bh-tk-ver' };
const TK_API = 'https://superagent-1906c8e6.base44.app/functions/tiktokAuth';
export function tkToken() { try { const t = JSON.parse(localStorage.getItem(TK.tok) || 'null'); return t && t.access_token ? t : null; } catch (e) { return null; } }
export function tkStatus() {
  const ck = localStorage.getItem(TK.key); const t = tkToken();
  if (t) return { state: 'linked', label: 'مربوط رسميا', key: ck };
  if (ck) return { state: 'half', label: 'التطبيق مسجل، الحساب ماشي مربوط', key: ck };
  return { state: 'none', label: 'ماشي مربوط رسميا', key: '' };
}
const TK_DEFAULT = 'awga3m8eepkt0ikr';
export function tkClientKey() { return (localStorage.getItem(TK.key) || TK_DEFAULT).trim(); }
export function tkSetClientKey(v) {
  const k = String(v || '').replace(/\s+/g, '');
  if (!k) { localStorage.removeItem(TK.key); return { ok: false, why: 'فارغ' }; }
  if (/^\d{12,}$/.test(k)) return { ok: false, why: 'هادا App ID (أرقام فقط). Client Key كيبدا غالبا بـ aw وفيه حروف وأرقام.' };
  if (k.length < 10 || k.length > 40) return { ok: false, why: 'الطول ماشي صحيح' };
  localStorage.setItem(TK.key, k);
  return { ok: true };
}
export async function tkConnect() {
  const ck = tkClientKey();
  if (!ck) { msg('دخل Client Key ديال تطبيقك الأول فالخانة اللي فوق، ومن بعد اضغط ربط.'); return false; }
  const ver = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(TK.ver, ver);
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver));
  const ch = btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const redirect = location.origin + location.pathname;
  localStorage.setItem('bh-tk-redirect', redirect);
  location.href = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + encodeURIComponent(ck) +
    '&scope=user.info.basic&response_type=code&redirect_uri=' + encodeURIComponent(redirect) +
    '&state=azzouz&code_challenge=' + ch + '&code_challenge_method=S256';
  return true;
}
export function tkDisconnect() {
  localStorage.removeItem(TK.tok);
  logIt('auth', 'تم فصل حساب TikTok');
}
export async function tkFinish() {
  const q = new URLSearchParams(location.search);
  const err = q.get('error');
  if (err) {
    logIt('auth', 'TikTok رفض الربط: ' + err + ' ' + (q.get('error_description') || ''));
    setTimeout(() => msg('TikTok رفض الربط: ' + err + '. تحقق من Client Key و Redirect URI فـ Login Kit.'), 1200);
    history.replaceState({}, '', location.pathname);
    return false;
  }
  const code = q.get('code'); if (!code) return false;
  try {
    const r = await fetch(TK_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: localStorage.getItem(TK.ver) || '', redirect_uri: localStorage.getItem('bh-tk-redirect') || location.origin + location.pathname }) });
    const j = await r.json();
    if (j && j.access_token) {
      let me = null;
      try {
        const u = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', { headers: { Authorization: 'Bearer ' + j.access_token } });
        const uj = await u.json();
        me = uj?.data?.user || null;
      } catch (e) {}
      localStorage.setItem(TK.tok, JSON.stringify({ ...j, me, at: Date.now() }));
      logIt('auth', 'تسجل الدخول لـ TikTok' + (me && me.display_name ? ' (' + me.display_name + ')' : ''));
      history.replaceState({}, '', location.pathname);
      return true;
    }
    logIt('auth', 'فشل الربط: ' + (j && (j.error_description || j.error) || 'خطأ'));
  } catch (e) {}
  return false;
}

export async function tkRefresh() {
  const t = tkToken();
  if (!t || !t.refresh_token) return false;
  const age = (Date.now() - (t.at || 0)) / 1000;
  if (age < (t.expires_in || 86400) - 600) return true;
  try {
    const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: tkClientKey(), grant_type: 'refresh_token', refresh_token: t.refresh_token })
    });
    const j = await r.json();
    if (j && j.access_token) {
      localStorage.setItem(TK.tok, JSON.stringify({ ...t, ...j, at: Date.now() }));
      logIt('auth', 'تجدد التوكن');
      return true;
    }
    logIt('auth', 'فشل تجديد التوكن: ' + (j.error_description || j.error || 'خطأ'));
  } catch (e) {}
  return false;
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
    <div class="bh-hd"><b>🎁 TikTok Box Hunter</b><span class="bh-t">${st.silent ? '🔇 Silent Mode' : '🔔 عادي'}</span></div>
    <div class="bh-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="bh-b g" id="bhSilent">${st.silent ? '🔊 حيد الهدوء' : '🔇 شغل الهدوء'}</button>
      <button class="bh-b g" id="bhOn">${st.on ? '⏸ وقف المراقبة' : '▶ شغل المراقبة'}</button>
      <button class="bh-b r" id="bhStop">⏹ وقف فوري</button>
      ${tkToken() ? '<button class="bh-b g" id="bhTkOut">🔓 فصل حساب TikTok</button>' : '<button class="bh-b" id="bhTkIn">🔗 ربط حساب TikTok</button>'}
    </div>
    <div class="bh-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <input id="bhCk" placeholder="Client Key (من Basic information)" value="${esc(tkClientKey())}" style="flex:1;min-width:160px" autocomplete="off">
      <button class="bh-b g" id="bhCkSave">💾 حفظ</button>
      <button class="bh-b g" id="bhCkClear">🗑 مسح</button>
    </div>
    <div class="bh-t">📌 المفتاح كيبدا بحروف وأرقام (بحال aw1234abcd)، وماشي App ID. كاين فـ Basic information ← Client key، والسر Client secret. ما كتحتاجش السر هنا، كيبقى فالسيرفر.</div>
    <div class="bh-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <button class="bh-b" id="bhRadar">${st.radar ? '🛰️ الرادار شاعل' : '🛰️ شغل الرادار'}</button>
      <button class="bh-b g" id="bhRadarNow">🔍 فحص الآن</button>
      <input id="bhKw" placeholder="كلمات: maroc, live" value="${esc((st.radarKw || 'maroc,live'))}" style="flex:1;min-width:120px">
      <span class="bh-t">${RADAR_BUSY ? 'كيقلب…' : 'بحث مرحلي'}</span>
      ${(() => { const n = rd('bh-need', { n: 0 }); return n.n ? '<span class="bh-t bh-warn">🔔 كتحتاج تدخلك: ' + n.n + '</span>' : '<span class="bh-t">ما كاين حتى تدخل مطلوب</span>'; })()}
    </div>
    <div class="bh-t">حالة الحساب: ${(() => { const t = tkToken(); if (!t) return '<span class="bh-warn">ماشي مربوط رسميا</span>'; const nm = (t.me && t.me.display_name) || 'مربوط'; return '<b>' + esc(nm) + '</b> مربوط رسميا'; })()} — TikTok ما كتوفرش API عمومي لصناديق LIVE. الجمع كيتم بيدك.</div>
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
    if (res.dup) { logIt('dup', 'صندوق موجود من قبل: ' + host); msg('هادا الصندوق مسجل من قبل.'); }
    render(root);
  });
  $('#bhScan')?.addEventListener('click', async () => {
    const raw = ($('#bhUrl').value || '').trim();
    if (!raw) return msg('حط رابط البث ولا الحساب الأول.');
    const url = /^https?:\/\//i.test(raw) ? raw : 'https://www.tiktok.com/@' + raw.replace(/^@/, '');
    const r = await probe(url);
    logIt('probe', (r.ok ? 'فحص ناجح' : 'فحص فشل') + ' — ' + url);
    msg(r.ok ? (r.treasure ? '✅ الصفحة كتذكر صندوق ولا مكافأة (فحص كلمات).' : 'ℹ️ الصفحة تحملات، ولكن ما لقيتش كلمة صندوق.') : '⚠️ ما قدرتش نقرا الصفحة (TikTok قد يحجب القراءة).');
    render(root);
  });
  $('#bhRadar')?.addEventListener('click', () => {
    const s2 = setts(); s2.radar = !s2.radar; wr(K.s, s2);
    logIt('mode', s2.radar ? 'الرادار شاعل' : 'الرادار مطفي');
    render(root);
  });
  $('#bhRadarNow')?.addEventListener('click', async () => {
    const kw = document.getElementById('bhKw');
    if (kw) { const s2 = setts(); s2.radarKw = kw.value; wr(K.s, s2); }
    msg('🛰️ كنقلب على بثوث مباشرة…');
    await radarCycle();
    render(root);
  });
  $('#bhCkSave')?.addEventListener('click', () => {
    const r = tkSetClientKey(document.getElementById('bhCk')?.value);
    msg(r.ok ? '✅ تحفظ Client Key. دابا اضغط «ربط حساب TikTok».' : '⚠️ ' + r.why);
  });
  $('#bhCkClear')?.addEventListener('click', () => { localStorage.removeItem(TK.key); render(root); msg('تمسحات Client Key.'); });
  $('#bhTkIn')?.addEventListener('click', () => { tkConnect(); });
  $('#bhTkOut')?.addEventListener('click', () => { tkDisconnect(); render(root); });
  $('#bhSilent')?.addEventListener('click', () => {
    const s2 = setts(); s2.silent = !s2.silent; wr(K.s, s2);
    logIt('mode', s2.silent ? 'Silent Mode شاعل' : 'Silent Mode مطفي');
    render(root);
  });
  $('#bhOn')?.addEventListener('click', () => {
    const s2 = setts(); s2.on = !s2.on; wr(K.s, s2);
    logIt('mode', s2.on ? 'المراقبة شاعلة' : 'المراقبة واقفة');
    render(root);
  });
  $('#bhStop')?.addEventListener('click', () => {
    stopWatcher();
    render(root);
  });
  $('#bhPerm')?.addEventListener('click', async () => {
    if (!('Notification' in window)) return msg('المتصفح ما كيدعمش الإشعارات.');
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

let BH_TIMER = null;
export function stopWatcher() {
  if (BH_TIMER) { clearInterval(BH_TIMER); BH_TIMER = null; }
  const s = setts(); s.on = false; wr(K.s, s);
  logIt('stop', 'توقفت المراقبة');
}
export function startWatcher() {
  tick();
  if (BH_TIMER) return;
  BH_TIMER = setInterval(() => {
    try { tkRefresh(); } catch (e) {}
    tick();
    const pane = document.getElementById('paneHunter');
    if (pane && !pane.hidden && !document.getElementById('bh-busy')) render(pane);
  }, 20000);
}

export async function initBoxHunter(pane, opts) {
  const root = pane || document.querySelector('#paneHunter');
  if (!root) return false;
  try { await tkFinish(); } catch (e) {}
  render(root);
  if (!opts || opts.autoStart !== false) startWatcher();
  return true;
}
