/* AZZOUZ Term — محرك تيرمينال فالمتصفح (بلا سيرفر) */
(function (root) {
  const VKEY = 'azzouz-term-vfs';

  function load() {
    try {
      const raw = localStorage.getItem(VKEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.files) return d; }
    } catch (e) {}
    return { dirs: ['/home', '/home/azzouz', '/tmp', '/etc'], files: {} };
  }

  function save(s) {
    try { localStorage.setItem(VKEY, JSON.stringify(s)); } catch (e) {}
  }

  function norm(p) {
    const parts = String(p).split('/');
    const out = [];
    parts.forEach(x => {
      if (!x || x === '.') return;
      if (x === '..') out.pop(); else out.push(x);
    });
    return '/' + out.join('/');
  }

  function resolve(cwd, p) {
    if (!p) return norm(cwd);
    if (p.startsWith('/')) return norm(p);
    return norm(cwd + '/' + p);
  }

  function create() {
    const state = load();
    const env = { user: 'azzouz', host: 'browser', cwd: '/home/azzouz' };
    const history = [];

    function ensureDir(p) {
      if (!state.dirs.includes(p)) state.dirs.push(p);
    }

    function isDir(p) { return state.dirs.includes(p); }
    function isFile(p) { return Object.prototype.hasOwnProperty.call(state.files, p); }

    function listDir(p) {
      const out = [];
      state.dirs.forEach(d => {
        if (d !== '/' && norm(d + '/..') === p && d !== p) out.push({ name: d.split('/').pop(), dir: true });
      });
      Object.keys(state.files).forEach(f => {
        if (norm(f + '/..') === p) out.push({ name: f.split('/').pop(), dir: false });
      });
      return out.sort((a, b) => (a.name > b.name ? 1 : -1));
    }

    function fmt(n) { return '/home/azzouz'.replace('/home/azzouz', '~').replace(/^~$/, '~'); }
    function prompt() {
      const c = env.cwd.replace('/home/azzouz', '~');
      return env.user + '@' + env.host + ':' + c + '$ ';
    }

    function cmdLs(args) {
      const flags = args.filter(a => a.startsWith('-'));
      const rest = args.filter(a => !a.startsWith('-'));
      const target = resolve(env.cwd, rest[0] || '.');
      if (isFile(target)) return target.split('/').pop();
      if (!isDir(target)) return 'ls: ' + (rest[0] || '.') + ': ما كاينش';
      const items = listDir(target);
      if (!items.length) return '';
      if (flags.includes('-l')) {
        return items.map(i => (i.dir ? 'd' : '-') + 'rw-r--r--  1 azzouz  ' + (i.dir ? '   -' : String((state.files[target === '/' ? '/' + i.name : target + '/' + i.name] || '').length).padStart(4)) + '  ' + i.name + (i.dir ? '/' : '')).join('\n');
      }
      return items.map(i => i.name + (i.dir ? '/' : '')).join('  ');
    }

    function cmdCd(args) {
      const t = resolve(env.cwd, args[0] || '/home/azzouz');
      if (!isDir(t)) return 'cd: ' + (args[0] || '') + ': ما كاينش';
      env.cwd = t;
      return '';
    }

    function cmdCat(args) {
      if (!args.length) return 'cat: خصك تعطي ملف';
      return args.map(a => {
        const p = resolve(env.cwd, a);
        if (isDir(p)) return 'cat: ' + a + ': هو مجلد';
        if (!isFile(p)) return 'cat: ' + a + ': ما كاينش';
        return state.files[p];
      }).join('\n');
    }

    function cmdEcho(args) {
      return args.join(' ');
    }

    function cmdMkdir(args) {
      const t = resolve(env.cwd, args[0] || '');
      if (!args[0]) return 'mkdir: خصك اسم';
      ensureDir(t);
      save(state);
      return '';
    }

    function cmdTouch(args) {
      if (!args[0]) return 'touch: خصك اسم';
      const p = resolve(env.cwd, args[0]);
      if (!isFile(p)) state.files[p] = '';
      save(state);
      return '';
    }

    function cmdRm(args) {
      const names = args.filter(a => !a.startsWith('-'));
      if (!names.length) return 'rm: خصك اسم';
      names.forEach(n => {
        const p = resolve(env.cwd, n);
        if (isFile(p)) delete state.files[p];
        else {
          const idx = state.dirs.indexOf(p);
          if (idx > -1) state.dirs.splice(idx, 1);
        }
      });
      save(state);
      return '';
    }

    function cmdWrite(cmd) {
      const m = cmd.match(/^(?:echo|cat)\s+([\s\S]*?)\s*(>>?)\s*(\S+)$/);
      if (!m) return null;
      const text = m[1].replace(/^["']|["']$/g, '');
      const p = resolve(env.cwd, m[3]);
      const append = m[2] === '>>';
      state.files[p] = (append && state.files[p] ? state.files[p] + '\n' : '') + text;
      save(state);
      return '';
    }

    function cmdGrep(args) {
      const pat = args[0];
      const file = args[1];
      if (!pat) return 'grep: خصك نص';
      const src = file ? cmdCat([file]) : '';
      return String(src).split('\n').filter(l => l.toLowerCase().includes(String(pat).toLowerCase())).join('\n');
    }

    function cmdHead(args) {
      const m = args.find(a => !a.startsWith('-'));
      const n = Number((args.find(a => /^-n?\d+/.test(a)) || '').replace(/[^0-9]/g, '')) || 10;
      if (!m) return 'head: خصك ملف';
      const p = resolve(env.cwd, m);
      if (!isFile(p)) return 'head: ' + m + ': ما كاينش';
      return state.files[p].split('\n').slice(0, n).join('\n');
    }

    function cmdWc(args) {
      const f = args.find(a => !a.startsWith('-'));
      if (!f) return 'wc: خصك ملف';
      const p = resolve(env.cwd, f);
      if (!isFile(p)) return 'wc: ' + f + ': ما كاينش';
      const t = state.files[p];
      return t.split('\n').length + ' سطر · ' + t.split(/\s+/).filter(Boolean).length + ' كلمة · ' + t.length + ' حرف';
    }

    function help() {
      return [
        'الأوامر المتوفرة:',
        '  ls [-l] · cd · pwd · mkdir · touch · rm · cat · echo "x" > file · head · wc · grep',
        '  find <text> · tree · date · whoami · history · df · clear · reset',
        '  curl <url>   — كيجيب نص صفحة عبر بروكسي Base44',
        '  js <code>    — كينفذ JavaScript',
        '  py           — كيشعل Python (Pyodide) فالمتصفح',
        'كولشي كيدور فالمتصفح: الملفات محفوظة فهاد الجهاز فقط.'
      ].join('\n');
    }

    function find(args) {
      const q = String(args[0] || '').toLowerCase();
      const paths = Object.keys(state.files).filter(p => !q || p.toLowerCase().includes(q));
      return paths.length ? paths.join('\n') : '(ما لقيتش)';
    }

    function tree() {
      const lines = ['/'];
      state.dirs.filter(d => d !== '/').sort().forEach(d => lines.push('  ' + d));
      Object.keys(state.files).sort().forEach(f => lines.push('  ' + f));
      return lines.join('\n');
    }

    function df() {
      const size = Object.values(state.files).reduce((a, b) => a + String(b).length, 0);
      return 'المساحة: ' + (size / 1024).toFixed(1) + ' KB مستعملة من 5 MB (localStorage)';
    }

    async function run(line, opts) {
      const raw = String(line || '').trim();
      if (!raw) return { out: '', prompt: prompt() };
      history.push(raw);
      const cmd = raw;
      const [name, ...args] = raw.split(/\s+/);

      const writeCase = cmdWrite(cmd);
      if (writeCase !== null) return { out: '', prompt: prompt() };

      let out = '';
      switch (name) {
        case 'help': out = help(); break;
        case 'ls': out = cmdLs(args); break;
        case 'cd': out = cmdCd(args); break;
        case 'pwd': out = env.cwd; break;
        case 'cat': out = cmdCat(args); break;
        case 'echo': out = cmdEcho(args); break;
        case 'mkdir': out = cmdMkdir(args); break;
        case 'touch': out = cmdTouch(args); break;
        case 'rm': out = cmdRm(args); break;
        case 'grep': out = cmdGrep(args); break;
        case 'head': out = cmdHead(args); break;
        case 'wc': out = cmdWc(args); break;
        case 'find': out = find(args); break;
        case 'tree': out = tree(); break;
        case 'df': out = df(); break;
        case 'date': out = new Date().toLocaleString('ar-MA'); break;
        case 'whoami': out = env.user + ' (متصفح · بلا سيرفر)'; break;
        case 'history': out = history.map((h, i) => (i + 1) + '  ' + h).join('\n'); break;
        case 'clear': return { out: '', clear: true, prompt: prompt() };
        case 'reset': {
          state.dirs = ['/home', '/home/azzouz', '/tmp', '/etc'];
          state.files = {};
          env.cwd = '/home/azzouz';
          save(state);
          out = 'تصفّر النظام.';
          break;
        }
        case 'js': {
          try {
            const val = await (async () => eval(args.join(' ')))();
            out = typeof val === 'string' ? val : JSON.stringify(val, null, 1);
          } catch (e) { out = 'JS: ' + e.message; }
          break;
        }
        case 'curl': {
          const url = args[0];
          if (!url) { out = 'curl: عطيني رابط'; break; }
          out = await opts.onCurl(url);
          break;
        }
        case 'py': {
          out = await opts.onPython(args.join(' '));
          break;
        }
        default:
          out = name + ': أمر ماشي معروف. كتب help.';
      }
      return { out: out == null ? '' : String(out), prompt: prompt() };
    }

    return { run, prompt, state };
  }

  const api = { create, norm, resolve, VKEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TermCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
