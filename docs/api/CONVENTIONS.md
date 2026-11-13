# Shared conventions (read before building any client)

Backend: `backend/api` (NestJS). Read the controllers/services under `backend/api/src/**` and the end-to-end scripts
`scripts/smoke-*.mjs` for the exact request and response shapes. The smoke scripts are the ground truth.

## Auth
* Web apps call the API through a same-origin proxy: Next.js `rewrites()` maps `/api/:path*` to `${API_BASE_URL}/:path*`
  (env `API_BASE_URL`, default `http://localhost:3001`). The API sets an httpOnly cookie `otp_session`; JS never sees it.
  Non-GET requests are CSRF-checked by Origin, so the browser's own Origin must be in the API's `CORS_ORIGINS`.
* Native apps send header `X-Client-Type: mobile` on login and receive `token`; then `Authorization: Bearer <token>`.
  Store it in the platform secure store (Flutter: flutter_secure_storage), never in plain preferences.
* Login for staff returns `mfa: {required, enrolled}` and a short pending session. Flow: `POST /v1/auth/mfa/setup` →
  show secret + otpauth URI (QR) → `POST /v1/auth/mfa/confirm {code}` → show the 10 recovery codes ONCE, or
  `POST /v1/auth/mfa/verify {code}` / `{recoveryCode}`. A pending session may only call `/v1/auth/me`, `/v1/auth/mfa/*`, logout.
* Errors are JSON `{error: "<code>", ...}`; never show raw codes to people — map them to translated messages.

## Money
USD only. The API returns strings like `"12.34"` and `{microUsd, usd}`; never do floating-point money math in a client.

## Brand and design tokens (all apps must match)
Colors: navy `#1E2A6B`, ink `#0A0F24`, brand indigo `#6366F1`, accent cyan `#22D3EE`; success `#10B981`, warning `#F59E0B`, danger `#EF4444`.
Light: bg `#F7F8FC`, surface `#FFFFFF`, text `#0A0F24`. Dark: bg `#0A0F24`, surface `#11183A`, text `#E8EAF6`.
Type: Inter (Latin/Cyrillic), Cairo (Arabic), system CJK stack for Chinese. Radius 12px cards, 8px controls.
Quality bar: Stripe / Linear. Distinctive and restrained: no template gradients-on-white, no emoji icons, real hierarchy,
visible focus rings, empty/loading/error states on every screen, light and dark themes, works at 360px width.

## Localization
Six languages: `en`, `ar` (RTL), `ru`, `es`, `de`, `zh`. Use logical CSS (margin-inline-start, inset-inline-end, text-align: start),
`dir="rtl"` on `<html>` for Arabic, format numbers/dates with Intl using the active locale. Locale choice persists in a cookie
(web) or secure local setting (mobile) and is sent as `locale` on registration. Keys must exist in all six dictionaries.

## Honesty rules (product copy)
* Pricing is set by the admin; never invent prices, discounts, SLAs, uptime numbers, customer logos or testimonials.
* Email OTP and WhatsApp OTP are the only services. WhatsApp runs in QR-linked-device mode: never promise guaranteed delivery,
  and describe it as limited/at-risk (account bans, rate limits). Live sending is not enabled yet: the console shows "Sandbox only".
* Support staff can never approve deposits or change balances; admin UI must not even render those controls for support.

## Process rules for agents
No network in this sandbox: do not run package installs; write exact pinned versions at least two weeks old. CI installs and builds.
Do not git commit or push; the orchestrator does. Stay inside your assigned directories.
