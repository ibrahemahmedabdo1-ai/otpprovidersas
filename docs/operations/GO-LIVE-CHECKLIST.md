# Go-live checklist

Status values: PASS, FAIL, BLOCKED, NOT TESTED. Update with dated evidence before launch. Never paste secret values here.

## Launch scope (Email OTP only)
- Email is the only candidate customer channel for the first controlled launch.
- WhatsApp is connected to a personal QR-linked device. A real Admin test message reached the allow-listed phone and produced `accepted`, `delivered`, and `server_ack` receipt records. This validates the Admin test path only.
- WhatsApp customer sending remains blocked in the gateway/API; provider is disabled and the device is not routing-eligible. There is no receipt-to-`otp_deliveries` association or customer billing reconciliation. Do not enable it by flipping a flag.
- The Starter Credit $4.99 package exists in production but is inactive and not commercially approved.

## Owner actions
- [ ] Rotate the Super Admin password that was previously exposed in chat.
- [ ] Complete MFA enrollment for every staff account. Latest database count: Super Admin 2/2 enrolled; Admin staff 0/1; Support staff 1/2.
- [ ] Confirm `RESEND_WEBHOOK_SECRET` equals the secret of the enabled Resend webhook. A recent delivered-event callback returned HTTP 200, but older attempts returned 401 invalid_signature; compare values in dashboards without copying them into chat.
- [ ] Keep email sending on the verified `mail.otpprovider.com` domain. The apex `otpprovider.com` Resend domain is failed; it is not the configured sender.
- [ ] Keep Resend Receiving disabled unless inbound Mail Center is implemented and intentionally enabled.
- [ ] Set translation provider credentials only if automatic translation is part of launch scope.
- [ ] Confirm the owner can sign in to website, Admin, Customer Console, and Support in production.
- [ ] Android release signing: run `scripts/make-android-keystores.sh` and configure GitHub Actions signing secrets before Play Store releases.

## Deploy and production smoke checks
Vercel currently reports deployment rate-limit failures (retry after the limit resets). Do not repeatedly trigger builds. The current `main` commit `9cbe312` has successful GitHub CI, but its five Vercel status checks failed due to the platform build-rate limit. Previously deployed production versions remain READY on earlier commits.

- [ ] After the Vercel limit resets, deploy the approved `main` commit to all five projects (website, API, Admin, Customer Console, Support).
- [ ] Record the exact deployed commit and deployment ID for every project.
- [ ] `GET /health/ready` returns 200 with `database: up`.
- [ ] `GET /v1/public/pricing` returns the approved Email price and does not expose WhatsApp as live.
- [ ] Verify each UI on its custom domain; CSS/JS assets return 200 and browser console has no runtime errors.

| Project | Custom domain | Latest confirmed production deployment |
|---|---|---|
| Website | `www.otpprovider.com` | READY on an earlier commit |
| API | `otpprovider-launch-api.vercel.app` | READY on an earlier commit |
| Admin | `admin.otpprovider.com` | READY on an earlier commit |
| Customer Console | `console.otpprovider.com` | READY on an earlier commit |
| Support | `support.otpprovider.com` | READY on an earlier commit |

Custom domains for Website, Admin, Customer Console, and Support are verified in Vercel. No custom API subdomain is configured.

## Production workflows

| # | Workflow | Latest status |
|---|---|---|
| 1 | Register, verify email, sign in, enroll MFA | NOT TESTED end-to-end in production |
| 2 | Deposit request creates linked ticket | Migration and SQL path exist; production UI flow NOT TESTED |
| 3 | Support submits evidence; Support cannot credit | SQL/permission tests exist; production UI flow NOT TESTED |
| 4 | Admin approves; wallet credited exactly once | SQL/permission tests exist; production UI flow NOT TESTED |
| 5 | Real Email OTP request, delivered callback, correct code verifies | NOT TESTED in production; no production `otp_deliveries` exist yet |
| 6 | Resend delivered webhook charges exactly once | Latest webhook callback succeeded (HTTP 200); full OTP-linked billing NOT TESTED |
| 7 | Bounced/failed email releases reservation without charge | NOT TESTED with a real provider callback |
| 8 | Customer isolation for balances, deposits, tickets, and API keys | Automated coverage exists; production acceptance test NOT TESTED |
| 9 | WhatsApp device health and Admin test receipt | PASS for the Admin test path only |
| 10 | WhatsApp customer send and charge after receipt | BLOCKED; not implemented end-to-end and intentionally disabled |
| 11 | Inbound Mail Center | NOT IMPLEMENTED; Receiving disabled |
| 12 | Backup restore drill | NOT TESTED; Neon has no snapshots or snapshot schedule, and the application backups registry is empty |

## Database and billing invariants checked 2026-11-24
- [x] Production migrations 0001 through 0010 are recorded.
- [x] Wallet reconciliation reports zero wallet/ledger mismatches.
- [x] No negative wallet discrepancy was found in the latest reconciliation.
- [x] WhatsApp provider and device routing remain disabled.
- [ ] Test an actual OTP delivery and verify one charge, duplicate-event idempotency, and a matching ledger entry before opening Email OTP to general traffic.
- [ ] Test a restore from a real backup before relying on disaster recovery.
