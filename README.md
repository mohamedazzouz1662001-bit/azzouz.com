# Azzouz Research

بحث شامل في الويب (12 مصدر) + تلخيص في مقال واحد + مراجع في الأسفل + ذاكرة محلية وتعلّم مستمر.

## الملفات
- `index.html` — واجهة جاهزة (GitHub Pages)
- `research.mjs` — طبقة العميل: بحث، تلخيص، مراجع، ذاكرة، تعلّم
- `worker.js` — Cloudflare Worker: تجميع المصادر + Workers AI للتلخيص

## المصادر
DuckDuckGo · Bing · Mojeek · Wikipedia (ar/en) · Stack Overflow · GitHub · Hacker News · Reddit · arXiv · Semantic Scholar · GDELT · DEV Community

## 1) نشر الـ Worker
```bash
npm i -g wrangler
wrangler login
# في مجلد فيه worker.js و wrangler.toml:
wrangler deploy
```

`wrangler.toml`:
```toml
name = "azzouz-research"
main = "worker.js"
compatibility_date = "2026-11-01"

[ai]
binding = "AI"
```

## 2) تشغيل الواجهة
افتح `index.html` → الصق رابط الـ Worker → ابحث.

## 3) الدمج في Azzouz AI
```js
import { advancedResearch } from './research.mjs';
const adv = await advancedResearch({ question: query, workerBase: WORKER_URL });
const answer = adv ? adv.text : buildGroundedAnswer(query, citations, previous);
```

## الخصوصية
- لا مفاتيح API في الواجهة.
- لا اتصال تلقائي: المستخدم يضغط البحث.
- الذاكرة في localStorage فقط.
- المراجع دائماً ظاهرة مع الروابط.
