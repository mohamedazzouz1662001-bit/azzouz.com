/* connectors.mjs v2 — الوصلات كتخدم بتسجيل الدخول (OAuth) ماشي بمفاتيح */

import { googleApi, SCOPES, getSession, hasScope, account } from './auth.mjs';

const SVC_KEY = 'azzouz-svc-v1';

function state() {
  try { return JSON.parse(localStorage.getItem(SVC_KEY) || '{}'); } catch (e) { return {}; }
}
function setState(s) {
  try { localStorage.setItem(SVC_KEY, JSON.stringify(s)); } catch (e) {}
}
export function isOn(id) { return state()[id] !== false; }
export function setOn(id, v) { const s = state(); s[id] = !!v; setState(s); }
export function anyOn() { return SERVICES.some(s => { const st = getSession(); return st && hasScope(st, s.scope) && isOn(s.id); }); }

const clamp = (s, n = 220) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export const SERVICES = [
  {
    id: 'youtube', name: 'YouTube', icon: '🎬', scope: SCOPES.youtube,
    desc: 'كيقلب فالفيديوهات ويجيب الروابط من حسابك',
    run: async (q) => {
      const r = await googleApi('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=' + encodeURIComponent(q), SCOPES.youtube);
      const d = await r.json();
      return (d.items || []).map(v => ({
        title: v.snippet?.title || '',
        url: 'https://www.youtube.com/watch?v=' + v.id?.videoId,
        snippet: clamp(v.snippet?.description),
        thumb: v.snippet?.thumbnails?.medium?.url || '',
        kind: 'video'
      }));
    }
  },
  {
    id: 'drive', name: 'Google Drive', icon: '📁', scope: SCOPES.drive,
    desc: 'كيقلب فملفاتك، الملفات المشتركة معك، وDrive ديال الفريق',
    run: async (q) => {
      const term = String(q).replace(/'/g, ' ').slice(0, 120);
      const queries = [
        "fullText contains '" + term + "'",
        "name contains '" + term + "'",
        "sharedWithMe = true and fullText contains '" + term + "'",
        "mimeType contains 'pdf' and fullText contains '" + term + "'"
      ];
      const out = [], seen = new Set();
      for (const qx of queries) {
        if (out.length >= 40) break;
        try {
          const url = 'https://www.googleapis.com/drive/v3/files?pageSize=25&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives&fields=files(id,name,description,webViewLink,thumbnailLink,mimeType,modifiedTime)&q=' +
            encodeURIComponent(qx);
          const r = await googleApi(url, SCOPES.drive);
          const d = await r.json();
          for (const f of d.files || []) {
            if (seen.has(f.id)) continue;
            seen.add(f.id);
            out.push({
              title: f.name,
              url: f.webViewLink || ('https://drive.google.com/file/d/' + f.id),
              snippet: clamp((f.description || '') + ' · ' + (f.mimeType || '').split('.').pop() + ' · ' + (f.modifiedTime || '').slice(0, 10)),
              thumb: f.thumbnailLink || '',
              kind: 'archive'
            });
          }
        } catch (e) {}
      }
      return out;
    }
  },
  {
    id: 'gmail', name: 'Gmail', icon: '✉️', scope: SCOPES.gmail,
    desc: 'كيقلب فالرسائل اللي عندك فالبريد',
    run: async (q) => {
      const lr = await googleApi('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=' + encodeURIComponent(q), SCOPES.gmail);
      const list = (await lr.json()).messages || [];
      const out = [];
      for (const m of list.slice(0, 6)) {
        try {
          const mr = await googleApi('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date', SCOPES.gmail);
          const md = await mr.json();
          const h = Object.fromEntries((md.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
          out.push({
            title: h.subject || '(بلا عنوان)',
            url: 'https://mail.google.com/mail/u/0/#all/' + m.id,
            snippet: clamp([h.from, h.date, md.snippet].filter(Boolean).join(' · ')),
            thumb: '',
            kind: 'article'
          });
        } catch (e) {}
      }
      return out;
    }
  },
  {
    id: 'calendar', name: 'Google Calendar', icon: '📅', scope: SCOPES.calendar,
    desc: 'كيقلب فالمواعيد والأحداث ديالك',
    run: async (q) => {
      const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=20&q=' + encodeURIComponent(q);
      const r = await googleApi(url, SCOPES.calendar);
      const d = await r.json();
      return (d.items || []).map(ev => ({
        title: ev.summary || '(حدث)',
        url: ev.htmlLink || '',
        snippet: clamp([(ev.start?.dateTime || ev.start?.date || ''), ev.location, ev.description].filter(Boolean).join(' · ')),
        thumb: '',
        kind: 'article'
      }));
    }
  }
];

/* وصلات اختيارية بمفاتيح (متقدمة) — كتبقى خدامة إلى حطيتيها */
export const KEY_CONNECTORS = [
  { id: 'googlecse', name: 'Google Programmable Search', icon: '🔍', fields: [['key', 'API Key'], ['cx', 'CX']],
    run: async (v, q) => {
      const u = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(v.key)}&cx=${encodeURIComponent(v.cx)}&num=10&q=${encodeURIComponent(q)}`;
      const d = await (await fetch(u)).json();
      return (d.items || []).map(i => ({ title: i.title, url: i.link, snippet: clamp(i.snippet), thumb: i.pagemap?.cse_thumbnail?.[0]?.src || '', kind: 'article' }));
    } },
  { id: 'serpapi', name: 'SerpAPI', icon: '🌐', fields: [['key', 'API Key']],
    run: async (v, q) => {
      const d = await (await fetch(`https://serpapi.com/search.json?engine=google&num=10&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(v.key)}`)).json();
      return (d.organic_results || []).map(i => ({ title: i.title, url: i.link, snippet: clamp(i.snippet), thumb: '', kind: 'article' }));
    } },
  { id: 'tavily', name: 'Tavily', icon: '🧠', fields: [['key', 'API Key']],
    run: async (v, q) => {
      const d = await (await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: v.key, query: q, max_results: 10 })
      })).json();
      return (d.results || []).map(i => ({ title: i.title, url: i.url, snippet: clamp(i.content), thumb: '', kind: 'article' }));
    } },
  { id: 'unsplash', name: 'Unsplash', icon: '🖼️', fields: [['key', 'Access Key']],
    run: async (v, q) => {
      const d = await (await fetch(`https://api.unsplash.com/search/photos?per_page=20&query=${encodeURIComponent(q)}&client_id=${encodeURIComponent(v.key)}`)).json();
      return (d.results || []).map(i => ({ title: i.description || i.alt_description || 'صورة', url: i.links?.html, snippet: clamp(i.user?.name), thumb: i.urls?.small, kind: 'image' }));
    } },
  { id: 'github', name: 'GitHub', icon: '💻', fields: [['key', 'Personal Access Token']],
    run: async (v, q) => {
      const h = { Authorization: 'Bearer ' + v.key, Accept: 'application/vnd.github+json' };
      const d = await (await fetch(`https://api.github.com/search/repositories?per_page=20&q=${encodeURIComponent(q)}`, { headers: h })).json();
      return (d.items || []).map(i => ({ title: i.full_name, url: i.html_url, snippet: clamp(i.description), thumb: i.owner?.avatar_url || '', kind: 'code' }));
    } }
];

export function keyCfg(id) {
  try { return JSON.parse(localStorage.getItem('azzouz-conn-' + id) || 'null') || {}; } catch (e) { return {}; }
}
export function saveKeyCfg(id, vals) {
  try { localStorage.setItem('azzouz-conn-' + id, JSON.stringify(vals || {})); } catch (e) {}
}
export function removeKeyCfg(id) {
  try { localStorage.removeItem('azzouz-conn-' + id); } catch (e) {}
}
export function keyOn(id) {
  try { return localStorage.getItem('azzouz-conn-on-' + id) === '1'; } catch (e) { return false; }
}
export function setKeyOn(id, v) {
  try { localStorage.setItem('azzouz-conn-on-' + id, v ? '1' : '0'); } catch (e) {}
}

const withTimeout = async (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);


async function githubAccountItems(q) {
  const acc = account('github');
  if (!acc || !acc.token) return [];
  const h = { Authorization: 'Bearer ' + acc.token, Accept: 'application/vnd.github+json' };
  const out = [];
  try {
    const r = await fetch('https://api.github.com/search/repositories?per_page=6&sort=stars&q=' + encodeURIComponent(q), { headers: h });
    if (r.ok) {
      const j = await r.json();
      (j.items || []).forEach(i => out.push({
        title: i.full_name,
        url: i.html_url,
        snippet: (i.description || '').slice(0, 200),
        source: 'GitHub (حسابك)',
        kind: 'code'
      }));
    }
  } catch (e) {}
  return out;
}

export async function connectorSearch(q) {
  const out = {};
  const st = getSession();
  if (st) {
    for (const s of SERVICES) {
      if (!isOn(s.id) || !hasScope(st, s.scope)) continue;
      try {
        const items = await withTimeout(s.run(q));
        if (items.length) out[s.name] = items;
      } catch (e) {}
    }
  }
  try {
    const gh = await withTimeout(githubAccountItems(q));
    if (gh.length) out['GitHub (حسابك)'] = gh;
  } catch (e) {}

  for (const k of KEY_CONNECTORS) {
    if (!keyOn(k.id)) continue;
    const v = keyCfg(k.id);
    if (!v || !v.key) continue;
    try {
      const items = await withTimeout(k.run(v, q));
      if (items.length) out[k.name] = items;
    } catch (e) {}
  }
  return out;
}
