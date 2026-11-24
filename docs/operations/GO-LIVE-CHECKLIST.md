# Go-live checklist

Status values: PASS, FAIL, BLOCKED, NOT TESTED. Update with evidence (date, commit, deployment id) before launch. Never paste secret values here.

## Launch scope (Email OTP only)
WhatsApp is linked to a personal QR device until a provider contract exists. Customer WhatsApp sending stays disabled
(`WA_CUSTOMER_SEND_ENABLED=false`, `/v1/send` answers 423 / `delivery_receipt_reconciliation_not_enabled`). Public pages hide WhatsApp pricing.
Do not enable it by flipping a flag: it needs verified delivery receipts, reconciliation and charge-after-receipt billing end to end.

## Owner actions (cannot be done by Claude)
- [ ] Rotate the Super Admin password (it was pasted in chat once) and enrol MFA for every staff account.
- [ ] Confirm `RESEND_WEBHOOK_SECRET` in the API project equals the secret of the enabled Resend webhook (compare in the dashboards; do not paste either).
- [ ] Fix DKIM for `otpprovider.com` in DNS (currently `failed`) or keep sending only from the verified `mail.otpprovider.com`.
- [ ] Enable Resend Receiving if inbound Mail Center is wanted (currently disabled on both domains).
- [ ] Set `TRANSLATION_PROVIDER` / `TRANSLATION_API_KEY` if auto-translation is wanted (off by default).
- [ ] Confirm CORS allows `https://www.otpprovider.com`.
- [ ] Android: run `scripts/make-android-keystores.sh` and add the signing secrets to GitHub Actions.

## Deploy (Vercel is rate limited for ~24h on the free tier; do not retry in a loop)
- [ ] After the limit resets, deploy the same `main` commit to all five projects (website, API, admin, console, support).
- [ ] Record commit + deployment id per project in the matrix below.
- [ ] `GET /health/ready` returns 200 with `database: up`.
- [ ] `GET /v1/public/pricing` returns the approved Email price; no WhatsApp price is shown.
- [ ] Each UI loads, CSS/JS assets return 200, no console errors.

| Project | Commit | Deployment | Status |
|---|---|---|---|
| API | | | NOT TESTED |
| Website | | | NOT TESTED |
| Admin | | | NOT TESTED |
| Console | | | NOT TESTED |
| Support | | | NOT TESTED |

## Workflows (real, with an authorised test mailbox)
| # | Workflow | Status |
|---|---|---|
| 1 | Register, verify email, log in, MFA | NOT TESTED |
| 2 | Deposit request creates linked ticket | NOT TESTED in production (SQL tested in CI) |
| 3 | Support submits evidence; support cannot credit | PASS in CI (SQL); NOT TESTED in production |
| 4 | Admin approves; wallet credited exactly once | PASS in CI (SQL); NOT TESTED in production |
| 5 | Email OTP request, real receipt, correct code verifies | NOT TESTED |
| 6 | Resend `delivered` webhook records delivery and charges once | NOT TESTED (code reviewed: signed, timing-safe, idempotent) |
| 7 | Bounced/failed email releases the reservation, no charge | NOT TESTED |
| 8 | Customer isolation (balance, deposits, tickets, keys) | NOT TESTED |
| 9 | WhatsApp device health | BLOCKED (no Railway access from this environment) |
| 10 | WhatsApp customer send | NOT ENABLED by design |
| 11 | Mail Center inbound | NOT IMPLEMENTED (Receiving disabled) |
| 12 | Backup restore drill on a Neon branch | NOT TESTED |
