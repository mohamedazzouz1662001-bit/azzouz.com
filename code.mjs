/* code.mjs — قراءة الأكواد/المستودعات + كتابة كود من قوالب ذكية */

const EXT = { js: 'javascript', mjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', py: 'python', html: 'html', css: 'css', json: 'json', sh: 'bash', md: 'markdown', java: 'java', php: 'php', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp' };

export function detectLang(name = '', content = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  if (EXT[ext]) return EXT[ext];
  const c = String(content);
  if (/^\s*<!DOCTYPE html|<html/i.test(c)) return 'html';
  if (/^\s*(def |import |from .+ import )/m.test(c)) return 'python';
  if (/^\s*(function|const|let|=>|import .+ from)/m.test(c)) return 'javascript';
  if (/^\s*[{[]/.test(c)) return 'json';
  return 'text';
}

export function analyzeCode(text, name = 'code') {
  const src = String(text || '');
  const lines = src.split('\n');
  const lang = detectLang(name, src);
  const functions = [...src.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)|def\s+([A-Za-z_]\w*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(|class\s+([A-Za-z_$][\w$]*))/g)]
    .map(m => m[1] || m[2] || m[3] || m[4]).filter(Boolean).slice(0, 30);
  const imports = [...src.matchAll(/^\s*(?:import|from|require)\s+.*$/gm)].map(m => m[0].trim()).slice(0, 15);
  const issues = [];
  if (/\beval\s*\(/.test(src)) issues.push('eval() — خطر تنفيذ كود عشوائي');
  if (/innerHTML\s*=/.test(src) && !/sanitiz|escape|textContent/.test(src)) issues.push('innerHTML مباشر — احتمال XSS؛ استعمل textContent أو تعقيم');
  if (/(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}/i.test(src)) issues.push('مفتاح/سر مكتوب فالكود — خاصو يتحيد ويتدور');
  if (/(password|passwd)\s*[:=]\s*['"][^'"]{4,}/i.test(src)) issues.push('كلمة سر صريحة فالكود');
  if (/\bconsole\.log\b/.test(src)) issues.push('console.log باقي فالكود (ماشي مشكل ولكن تنقص الإنتاج)');
  if (/\bTODO\b|\bFIXME\b/.test(src)) issues.push('كاين TODO/FIXME');
  if (/http:\/\//.test(src)) issues.push('روابط http غير مشفرة');
  if (src.length > 40000) issues.push('الملف كبير — يفضل تقسيمو');

  const summary = `${name} · ${lang} · ${lines.length} سطر · ${functions.length} دالة/كلاس` +
    (imports.length ? ` · ${imports.length} استيراد` : '');

  return { name, lang, lines: lines.length, functions, imports, issues, summary, chars: src.length };
}

/* قراءة مستودع عمومي عبر GitHub API */
export async function readRepo(input) {
  const m = String(input).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/) || String(input).match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error('صيغة المستودع ماشي صحيحة (owner/repo)');
  const owner = m[1], repo = m[2].replace(/\.git$/, '');
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const meta = await (await fetch(api, { headers: { Accept: 'application/vnd.github+json' } })).json();
  if (meta.message) throw new Error(meta.message);

  const tree = await (await fetch(`${api}/git/trees/${meta.default_branch}?recursive=1`, { headers: { Accept: 'application/vnd.github+json' } })).json();
  const files = (tree.tree || []).filter(f => f.type === 'blob');
  const byExt = {};
  files.forEach(f => {
    const e = (f.path.split('.').pop() || 'other').toLowerCase();
    byExt[e] = (byExt[e] || 0) + 1;
  });
  let readme = '';
  const readmeFile = files.find(f => /^readme/i.test(f.path));
  if (readmeFile) {
    const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${meta.default_branch}/${readmeFile.path}`);
    if (r.ok) readme = (await r.text()).slice(0, 2500);
  }
  return {
    full: `${owner}/${repo}`,
    description: meta.description || '',
    stars: meta.stargazers_count,
    language: meta.language,
    branch: meta.default_branch,
    files: files.slice(0, 40).map(f => f.path),
    totalFiles: files.length,
    byExt,
    readme
  };
}

/* قراءة ملف كود عمومي من رابط */
export async function readCodeUrl(url) {
  const raw = String(url).replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  const r = await fetch(raw, { headers: { Accept: 'text/plain' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  const name = raw.split('/').pop().split('?')[0];
  return { text: text.slice(0, 12000), analysis: analyzeCode(text, name) };
}

/* ---------- كتابة كود من قوالب ---------- */
const T = {
  landing: (p) => `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:${p.bg};color:#eaeff7;line-height:1.8}
.wrap{max-width:900px;margin:auto;padding:48px 20px}
h1{font-size:34px;margin-bottom:14px}
h1 span{color:${p.accent}}
p.lead{color:#93a4bd;margin-bottom:26px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:26px}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px}
.card h3{color:${p.accent};font-size:16px;margin-bottom:8px}
.btn{display:inline-block;margin-top:18px;background:${p.accent};color:#04121f;font-weight:800;
padding:12px 24px;border-radius:10px;text-decoration:none}
footer{text-align:center;color:#5f7characters;padding:30px;font-size:12px}
</style></head>
<body><div class="wrap">
<h1>${p.title} <span>${p.tagline}</span></h1>
<p class="lead">${p.lead}</p>
<a class="btn" href="${p.ctaUrl}">${p.cta}</a>
<div class="grid">${(p.features || []).map(f => `\n  <div class="card"><h3>${f[0]}</h3><p>${f[1]}</p></div>`).join('')}
</div></div><footer>© ${new Date().getFullYear()} ${p.title}</footer></body></html>`,

  form: (p) => `<!-- فورم بسيط + إرسال JSON -->
<form id="f" style="max-width:420px;display:grid;gap:10px">
  <input name="name" placeholder="الاسم" required>
  <input name="email" type="email" placeholder="البريد" required>
  <textarea name="message" placeholder="رسالتك" rows="4"></textarea>
  <button type="submit">إرسال</button>
  <p id="msg"></p>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const msg = document.getElementById('msg');
  msg.textContent = 'كنرسل...';
  try {
    const res = await fetch('${p.endpoint || '/api/contact'}', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    msg.textContent = res.ok ? '✅ توصلنا برسالتك' : '⚠️ مشكل (' + res.status + ')';
  } catch (err) { msg.textContent = '❌ ما قدرناش نرسلو'; }
});
</script>`,

  crud: (p) => `// CRUD بسيط بـ fetch — بدل BASE بالمسار الحقيقي
const BASE = '${p.endpoint || 'https://api.example.com/items'}';

export async function list() {
  const r = await fetch(BASE);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
export async function create(item) {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
export async function update(id, patch) {
  const r = await fetch(BASE + '/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
export async function remove(id) {
  const r = await fetch(BASE + '/' + id, { method: 'DELETE' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return true;
}`,

  python: (p) => `"""${p.title} — سكربت Python"""
import json
from pathlib import Path

def load(path: str) -> list:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def clean(rows: list, key: str) -> list:
    out = []
    for row in rows:
        value = row.get(key)
        if value is None or value == "":
            continue
        out.append({**row, key: value.strip() if isinstance(value, str) else value})
    return out

def save(path: str, rows: list) -> None:
    Path(path).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"تم حفظ {len(rows)} سجل في {path}")

if __name__ == "__main__":
    rows = clean(load("data.json"), "name")
    save("clean.json", rows)`
};

export function writeCode(request) {
  const q = String(request || '').toLowerCase();
  const p = {
    title: 'مشروعي', tagline: 'حل بسيط وسريع', lead: 'واجهة خفيفة بلا مكتبات خارجية.',
    accent: '#3ddc97', bg: '#05080e', cta: 'ابدا دابا', ctaUrl: '#',
    features: [['سريع', 'بلا اعتماديات'], ['متجاوب', 'كيخدم فالهاتف'], ['نقي', 'كود سهل التعديل']]
  };
  if (/لاندينغ|landing|صفحة|موقع|html/i.test(q)) return { lang: 'html', filename: 'index.html', code: T.landing(p), note: 'واجهة HTML/CSS جاهزة — بدل النصوص ديالك.' };
  if (/فورم|form|اتصال|contact/i.test(q)) return { lang: 'html', filename: 'form.html', code: T.form(p), note: 'فورم كيرسل JSON — بدل المسار endpoint.' };
  if (/crud|api|fetch|backend|جلب/i.test(q)) return { lang: 'javascript', filename: 'api.js', code: T.crud(p), note: 'دوال CRUD — بدل BASE.' };
  if (/python|سكربت|json|ملف/i.test(q)) return { lang: 'python', filename: 'script.py', code: T.python(p), note: 'سكربت قراءة/تنظيف/حفظ JSON.' };
  return null;
}
