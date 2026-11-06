/* oauth-broker.js — جسر OAuth صغير على Cloudflare Worker
 * كيخبي الـClient Secret، وكيرجع الرمز للتطبيق عبر postMessage (بلا ما يبان فالرابط).
 *
 * متغيرات لازم تحطها (Settings → Variables and Secrets):
 *   APP_ORIGIN            https://mohamedazzouz1662001-bit.github.io
 *   GITHUB_CLIENT_ID      ...
 *   GITHUB_CLIENT_SECRET  ...
 *   CF_CLIENT_ID          ...   (اختياري)
 *   CF_CLIENT_SECRET      ...   (اختياري)
 *   SIGNING_KEY           نص عشوائي طويل (باش نتحققو من state)
 */

const GITHUB_AUTH = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const CF_AUTH = 'https://dash.cloudflare.com/oauth2/auth';
const CF_TOKEN = 'https://dash.cloudflare.com/oauth2/token';

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
}

async function hmac(env, text) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SIGNING_KEY || 'azzouz-dev-key'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, '');
}

async function makeState(env, provider) {
  const raw = provider + '.' + Date.now() + '.' + Math.random().toString(36).slice(2);
  const b = btoa(raw).replace(/[+/=]/g, '');
  return b + '.' + (await hmac(env, b));
}

async function checkState(env, state) {
  if (!state || !state.includes('.')) return null;
  const i = state.lastIndexOf('.');
  const b = state.slice(0, i), sig = state.slice(i + 1);
  if ((await hmac(env, b)) !== sig) return null;
  try {
    const raw = atob(b);
    const provider = raw.split('.')[0];
    const ts = Number(raw.split('.')[1] || 0);
    if (!ts || Date.now() - ts > 10 * 60 * 1000) return null;
    return provider;
  } catch (e) { return null; }
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function back(env, provider, payload) {
  const origin = env.APP_ORIGIN || '*';
  const data = JSON.stringify({ source: 'azzouz-oauth', provider, ...payload });
  const html = `<!doctype html><meta charset="utf-8"><title>تم</title>
<body style="font:16px system-ui;background:#0b141a;color:#e9edef;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:40px">✅</div>
<p>تم تسجيل الدخول، رجع للتطبيق…</p></div>
<script>
(function(){
  var msg = ${data};
  try { if (window.opener) window.opener.postMessage(msg, ${JSON.stringify(origin)}); } catch (e) {}
  setTimeout(function(){ window.close(); }, 900);
})();
<\/script></body>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function fail(env, provider, reason) {
  return back(env, provider, { error: String(reason || 'unknown').slice(0, 200) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({ ok: true, providers: ['github', 'cloudflare'] }), {
        headers: { 'Content-Type': 'application/json', ...cors(env) }
      });
    }

    // 1) بداية الدخول
    if (path.startsWith('/auth/')) {
      const provider = path.slice('/auth/'.length);
      const redirectUri = url.origin + '/callback/' + provider;
      const state = await makeState(env, provider);

      if (provider === 'github') {
        if (!env.GITHUB_CLIENT_ID) return new Response('GITHUB_CLIENT_ID missing', { status: 500 });
        const q = new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          redirect_uri: redirectUri,
          scope: 'read:user repo',
          state, allow_signup: 'true'
        });
        return redirect(GITHUB_AUTH + '?' + q);
      }
      if (provider === 'cloudflare') {
        if (!env.CF_CLIENT_ID) return new Response('CF_CLIENT_ID missing', { status: 500 });
        const q = new URLSearchParams({
          response_type: 'code',
          client_id: env.CF_CLIENT_ID,
          redirect_uri: redirectUri,
          scope: 'account:read zone:read offline_access',
          state
        });
        return redirect(CF_AUTH + '?' + q);
      }
      return new Response('provider not supported', { status: 404 });
    }

    // 2) رجوع المزود
    if (path.startsWith('/callback/')) {
      const provider = path.slice('/callback/'.length);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const valid = await checkState(env, state);
      if (!code) return fail(env, provider, url.searchParams.get('error') || 'no_code');
      if (valid !== provider) return fail(env, provider, 'bad_state');

      const redirectUri = url.origin + '/callback/' + provider;
      try {
        if (provider === 'github') {
          const r = await fetch(GITHUB_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              client_id: env.GITHUB_CLIENT_ID,
              client_secret: env.GITHUB_CLIENT_SECRET,
              code, redirect_uri: redirectUri
            })
          });
          const d = await r.json();
          if (!d.access_token) return fail(env, provider, d.error_description || 'no_token');
          let user = {};
          try {
            const u = await fetch('https://api.github.com/user', {
              headers: { Authorization: 'Bearer ' + d.access_token, 'User-Agent': 'azzouz-broker' }
            });
            user = await u.json();
          } catch (e) {}
          return back(env, provider, {
            token: d.access_token, scopes: d.scope || '',
            name: user.name || user.login || '', login: user.login || '', pic: user.avatar_url || ''
          });
        }

        if (provider === 'cloudflare') {
          const r = await fetch(CF_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: env.CF_CLIENT_ID,
              client_secret: env.CF_CLIENT_SECRET,
              code, redirect_uri: redirectUri
            })
          });
          const d = await r.json();
          if (!d.access_token) return fail(env, provider, d.error_description || 'no_token');
          let name = '';
          try {
            const a = await fetch('https://api.cloudflare.com/client/v4/accounts', {
              headers: { Authorization: 'Bearer ' + d.access_token }
            });
            const j = await a.json();
            name = (j.result && j.result[0] && j.result[0].name) || '';
          } catch (e) {}
          return back(env, provider, { token: d.access_token, scopes: d.scope || '', name });
        }
      } catch (e) {
        return fail(env, provider, e.message);
      }
      return new Response('provider not supported', { status: 404 });
    }

    return new Response('not found', { status: 404 });
  }
};
