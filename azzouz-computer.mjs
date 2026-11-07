#!/usr/bin/env node
// Azzouz Computer Agent v2 — كيخلي Azzouz يخدم على الحاسوب ديالك
// التشغيل:  node azzouz-computer.mjs
// كيدير: كتابة ملفات، تنفيذ أوامر، كتابة فالنافذة النشيطة، حل الروابط، تصويرة الشاشة.
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const RELAY = 'https://superagent-1906c8e6.base44.app/functions/azzouzComputer';
const KEY = 'AZZOUZ-PC-2026';
const OUT = path.join(os.homedir(), 'azzouz-work');
const AUTO = process.env.AZZOUZ_AUTO === '1';
const NAME = os.hostname();
const PLAT = process.platform; // linux | darwin | win32

await fs.mkdir(OUT, { recursive: true });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function api(op, extra = {}) {
  const r = await fetch(RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, key: KEY, machine: NAME, ...extra })
  });
  return r.json().catch(() => ({}));
}

function parse(job) {
  const raw = String(job.instruction || '').trim();
  try {
    const j = JSON.parse(raw);
    if (j && j.op) return j;
  } catch (e) {}
  if (/^(اكتب فالنافذة|اكتب في التطبيق|type )/i.test(raw)) return { op: 'type', text: raw.replace(/^(اكتب فالنافذة|اكتب في التطبيق|type )\s*/i, '') };
  if (/^(حل الرابط|حل |open )/i.test(raw)) return { op: 'open', url: raw.replace(/^(حل الرابط|حل|open)\s*/i, '') };
  return { op: 'write', path: 'azzouz-' + Date.now() + '.txt', content: raw };
}

function sh(cmd) {
  return new Promise(res => {
    exec(cmd, { cwd: OUT, timeout: 90000, maxBuffer: 6 * 1024 * 1024 }, (err, stdout, stderr) => {
      res(((stdout || '') + (stderr || '') + (err ? '\n' + err.message : '')).trim().slice(0, 4000));
    });
  });
}

function typeCmd(text) {
  const safe = text.replace(/["`$\\]/g, m => '\\' + m);
  if (PLAT === 'linux') return `xdotool type --delay 25 "${safe}"`;
  if (PLAT === 'darwin') return `osascript -e 'tell application "System Events" to keystroke "${safe}"'`;
  return `powershell -c "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('${safe}')"`;
}

function openCmd(url) {
  const u = String(url || '').replace(/["`$]/g, '');
  if (PLAT === 'linux') return `xdg-open "${u}" >/dev/null 2>&1 &`;
  if (PLAT === 'darwin') return `open "${u}"`;
  return `start "" "${u}"`;
}

async function beat() {
  try { await api('beat'); } catch (e) {}
}

console.log('🖥️  Azzouz Computer Agent v2 شغال — الجهاز:', NAME);
console.log('📂 مجلد العمل:', OUT);
console.log('🔄 كنستنى المهام... (Ctrl+C باش توقف)\n');
beat();
setInterval(beat, 10000);

let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const p = await api('pull');
    const job = p && p.job;
    if (!job) return;
    const cmd = parse(job);
    console.log('📥 مهمة:', job.kind, '→', cmd.op);

    const risky = (cmd.op === 'run' || cmd.op === 'type') && !AUTO;
    if (risky) {
      const ans = await rl.question('⚠️  ' + cmd.op + ':\n' + JSON.stringify(cmd).slice(0, 400) + '\nنفذو؟ (y/n) ');
      if (ans.trim().toLowerCase() !== 'y') {
        await api('done', { id: job.id, result: 'المستخدم رفض التنفيذ.' });
        console.log('🚫 ترفضات.\n');
        return;
      }
    }

    let result = '';
    if (cmd.op === 'write') {
      const target = path.isAbsolute(cmd.path || '') ? cmd.path : path.join(OUT, cmd.path || 'out.txt');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(cmd.content ?? ''), 'utf8');
      result = '✅ تكتب الملف: ' + target;
      const isCode = /\.(py|js|mjs|sh)$/i.test(target);
      if (isCode && (cmd.run || /شغل|نفّذ|نفذ|شغلو/.test(String(job.instruction || '')))) {
        const runner = /\.py$/i.test(target) ? 'python3' : (/\.sh$/i.test(target) ? 'bash' : 'node');
        const out = await sh(runner + ' "' + target + '"');
        result += '\n▶️ تشغيل ' + runner + ':\n' + (out || '(بلا خرج)');
      }
    } else if (cmd.op === 'run') {
      result = await sh(String(cmd.cmd || 'echo empty'));
    } else if (cmd.op === 'type') {
      await sh(typeCmd(String(cmd.text || '')));
      result = '⌨️ تكتب فالنافذة النشيطة: ' + String(cmd.text || '').slice(0, 120);
    } else if (cmd.op === 'open') {
      await sh(openCmd(cmd.url));
      result = '🔗 تحل الرابط: ' + String(cmd.url || '');
    } else if (cmd.op === 'shot') {
      const shot = path.join(OUT, 'screen-' + Date.now() + '.png');
      if (PLAT === 'linux') await sh(`scrot "${shot}" 2>/dev/null || import -window root "${shot}" 2>/dev/null`);
      else if (PLAT === 'darwin') await sh(`screencapture -x "${shot}"`);
      else await sh(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds"`);
      result = '📸 تصويرة الشاشة: ' + shot;
    } else if (cmd.op === 'list') {
      const list = await fs.readdir(OUT);
      result = list.length ? list.join(' | ') : '(مجلد خاوي)';
    } else {
      result = 'ما فهمتش الأمر.';
    }

    await api('done', { id: job.id, result });
    console.log('✅ سالا:', result.slice(0, 200), '\n');
  } catch (e) {
    console.log('⚠️ خطأ فالجسر:', e.message);
  } finally {
    busy = false;
  }
}, 2500);
