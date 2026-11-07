#!/usr/bin/env node
// Azzouz Computer Agent — كيخلي Azzouz يخدم على الحاسوب ديالك
// التشغيل:  node azzouz-computer.mjs
// الأوامر كتوصل من الواجهة، وهاد السكريبت هو اللي كينفذها فالحاسوب.
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const RELAY = 'https://superagent-1906c8e6.base44.app/functions/azzouzComputer';
const KEY = 'AZZOUZ-PC-2026';
const OUT = path.join(os.homedir(), 'azzouz-work');
const AUTO = process.env.AZZOUZ_AUTO === '1';

await fs.mkdir(OUT, { recursive: true });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function api(op, extra = {}) {
  const r = await fetch(RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, key: KEY, ...extra })
  });
  return r.json().catch(() => ({}));
}

function parse(job) {
  const raw = String(job.instruction || '').trim();
  try {
    const j = JSON.parse(raw);
    if (j && j.op) return j;
  } catch (e) {}
  return { op: 'write', path: 'azzouz-' + Date.now() + '.txt', content: raw };
}

async function runCmd(cmd) {
  return new Promise(res => {
    exec(cmd, { cwd: OUT, timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      res(((stdout || '') + (stderr || '') + (err ? '\n' + err.message : '')).trim().slice(0, 4000));
    });
  });
}

console.log('🖥️  Azzouz Computer Agent شغال.');
console.log('📂 مجلد العمل:', OUT);
console.log('🔄 كنستنى المهام من الواجهة... (Ctrl+C باش توقف)\n');

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

    if (cmd.op === 'run' && !AUTO) {
      const ans = await rl.question('⚠️  أمر فالتيرمينال:\n' + cmd.cmd + '\nنفذو؟ (y/n) ');
      if (ans.trim().toLowerCase() !== 'y') {
        await api('done', { id: job.id, result: 'المستخدم رفض التنفيذ.', error: false });
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
    } else if (cmd.op === 'run') {
      result = await runCmd(String(cmd.cmd || 'echo empty'));
    } else if (cmd.op === 'list') {
      const list = await fs.readdir(OUT);
      result = list.length ? list.join(' | ') : '(مجلد خاوي)';
    } else if (cmd.op === 'open') {
      result = '🔗 حل الرابط فالحاسوب: ' + String(cmd.url || '');
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
