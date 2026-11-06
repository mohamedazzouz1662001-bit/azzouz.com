# جسر OAuth (GitHub + Cloudflare)

## 1. تنصيب
1. دخل لـ Cloudflare → Workers & Pages → Create → Worker، سميه `azzouz-oauth`.
2. لصق كود `oauth-broker.js` كامل، ومن بعد Deploy.
3. Settings → Variables and Secrets، زيد:
   - APP_ORIGIN = https://mohamedazzouz1662001-bit.github.io
   - SIGNING_KEY = نص عشوائي طويل (32 حرف)
   - GITHUB_CLIENT_ID و GITHUB_CLIENT_SECRET
   - CF_CLIENT_ID و CF_CLIENT_SECRET (اختياري)

## 2. GitHub OAuth App
GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
- Homepage URL: https://mohamedazzouz1662001-bit.github.io/azzouz.com/
- Authorization callback URL: https://<worker>.workers.dev/callback/github

## 3. Cloudflare OAuth client
dash.cloudflare.com → Manage Account → OAuth clients → Create
- Redirect URL: https://<worker>.workers.dev/callback/cloudflare

## 4. فالتطبيق
حل 🔌 → حط `https://<worker>.workers.dev` فخانة الجسر → حفظ → دخول.
