# Customer web (`@otp/customer-web`)
Customer console for OTPProvider: sign-in/registration, projects, test API keys, wallet (top-up *requests* only), sandbox playground, settings. 6 languages (en, ar RTL, ru, es, de, zh). Sandbox only: live sending is not enabled.

## Run
```
pnpm -C apps/customer-web dev      # http://localhost:3101
```
- `API_BASE_URL` (default `http://localhost:3001`): the browser calls `/api/*`, which Next proxies to this URL (same-origin cookie, no CORS in production).
- API `CORS_ORIGINS` must include this app's origin if you call the API directly.
- Test API keys live in tab memory only (never cookies/localStorage).

## Vercel
Root directory `apps/customer-web`, framework Next.js, env `API_BASE_URL=https://<your api host>`.

## Honest status
Verified by CI typecheck, i18n tests and build only. Not yet exercised in a browser.
