# DELIVERY REPORT: OTPProvider Commercial Launch V1

**Status: PARTIAL. Not production-ready. Sandbox-only OTP. Do not take real money or send real messages with this build.**
Statuses: PASS (verified by a test that ran), FAIL, BLOCKED (needs something we do not have), NOT TESTED (written, never run).

## Backend (NestJS, Neon PostgreSQL)
| Area | Status | Evidence |
|---|---|---|
| Schema + migrations (0001-0004) | PASS | Applied to a real Postgres 16 and to Neon; SQL suites in CI |
| Ledger, wallet, deposits (approve/reject, immutability, charge-once) | PASS | CI SQL tests + local smoke 14/14 |
| Auth: register, verify email, Argon2id login, sessions, lockout | PASS | local smoke 17/17 |
| Staff MFA (TOTP + recovery codes), pending-MFA session guard | PASS | unit tests + local smoke 18/18 |
| Admin deposits + Super Admin approval workflow | PASS | SQL suite + smoke |
| Sandbox OTP API (send/verify/resend/cancel, test keys only) | PASS | local smoke 28/28 |
| Live OTP sending | NOT IMPLEMENTED | live mode returns `live_mode_not_enabled` |
| Resend email adapter | NOT TESTED | written; needs `RESEND_API_KEY` + verified domain (BLOCKED on credentials). Resend webhook receiver NOT IMPLEMENTED |
| WhatsApp linked-device adapter | NOT IMPLEMENTED | must stay disabled until compliance sign-off; delivery is never guaranteed (see runbook) |
| Support tickets API (customer create/reply, staff list/reply/internal note/assign/status; customers never see internal notes or staff e-mails) | NOT TESTED | compiles in CI; `scripts/smoke-tickets.mjs` written, not yet run |
| Password reset (customers only; one-hour single-use token; all sessions ended) | NOT TESTED | compiles in CI; no smoke test yet |
| Housekeeping scheduler (expire OTPs, purge old tokens/sessions; advisory-lock so one instance works) | NOT TESTED | compiles in CI |
| OpenAPI (54 routes) + test that it matches the controllers | PASS | CI test |
| Webhooks: management API, signed delivery worker (retries/backoff, SSRF re-check at delivery), `otp.verified` events | PARTIAL / NOT TESTED | signing, URL safety and backoff unit-tested (PASS); the worker and endpoints compile in CI but were never run. `otp.delivered`/`otp.failed` events need live sending. No UI yet |
| Admin read-only users directory and audit log | NOT TESTED | compile in CI; UI in admin web |
| Wallet-vs-ledger reconciliation (SQL function, hourly check, admin page) | PASS (SQL) / NOT TESTED (endpoint, page) | `tests/billing/reconciliation.test.sql` ran against Postgres 16 |
| Routing integration, pricing/providers/legal-document admin | NOT IMPLEMENTED | |

## Front ends
| App | Status | Evidence |
|---|---|---|
| Website (48 static pages, 6 languages, SEO files) | PASS (build) / NOT TESTED (browser) | CI typecheck, SEO tests, `next build` |
| Customer web (6 languages incl. RTL; incl. tickets and password reset) | PASS (build) / NOT TESTED (browser) | CI typecheck, i18n parity tests, build |
| Admin web (English only; login + MFA, deposits, approvals, users, audit log) | PASS (build) / NOT TESTED (browser) | CI typecheck + build |
| Support web (English only; tickets UI, no money or secrets) | PASS (build) / NOT TESTED (browser); tickets backend missing | CI typecheck + build |
| Flutter customer / support / admin (English only) | See "Android" | `.github/workflows/android.yml` |

## Android
`flutter create` runs in CI over our `lib/` and pubspec, then analyze + debug and release APK builds. Release APKs are signed with the debug key: NOT for store upload. Real keystore signing: BLOCKED (secrets not provided). APK artifact upload can fail when the account's Actions storage quota is full; that does not fail the build. Apps have never been run on a device or emulator: NOT TESTED.

## Honest gaps
- No screens were seen in a browser or on a phone by the author.
- Staff consoles and mobile apps are English only; customer web and website have 6 languages.
- No deployment done (Vercel/Neon production config is documented only where noted in docs).
- Rate limits are in-memory; production needs shared storage.
- Legal documents (`docs/legal/TEMPLATES.md`) are unreviewed templates and need a lawyer.
- Deployment, runbook and security notes exist in `docs/` but nothing has been deployed.
- Money: wallet is credited only by an admin after independent receipt verification; support cannot approve or change balances (enforced in DB functions and tested).
