# OTPProvider production readiness report

## 0b. Live recheck 2026-11-24 (current session)

| Item | Live evidence | Status |
|---|---|---|
| Railway WhatsApp gateway | Production deployment `57dee11a` is SUCCESS; one replica online; no active Railway warnings or pending deploys | VERIFIED |
| WhatsApp Admin test receipt | One allow-listed test message recorded `accepted`, `delivered`, and `server_ack` in `wa_message_receipts`; Admin receipt endpoint returned HTTP 200 | VERIFIED FOR ADMIN TEST ONLY |
| WhatsApp customer routing | Provider remains disabled; device `routing_eligible=false`; customer sending is blocked; no `otp_deliveries` are linked to receipt message IDs | BLOCKED |
| WhatsApp charge integration | `wa_message_receipts` has no foreign key or reconciliation path to `otp_deliveries`; wallet charge function only charges an `otp_deliveries` row in `delivered` state | NOT IMPLEMENTED |
| Email provider | Resend sender domain `mail.otpprovider.com` is verified and sending-enabled; most recent `email.delivered` webhook attempt returned HTTP 200 | PARTIALLY VERIFIED |
| Email OTP billing test | Production currently has no `otp_deliveries`; the existing OTP requests are old test-mode records | NOT PRODUCTION-VERIFIED |
| Wallet ledger | `wallet_reconciliation()` returned zero mismatches across production wallets | VERIFIED |
| Production database | Migrations 0001–0010 are recorded; receipt table exists (created by the gateway) | VERIFIED |
| Vercel deployment rate limit | Latest main commit `9cbe312` has Vercel status failures for all five projects due to build-rate-limit; deployed production versions remain on earlier READY commits | BLOCKED BY PLATFORM LIMIT |
| Domain configuration | Website, Admin, Customer Console, and Support custom domains are verified in Vercel; API currently uses its Vercel hostname | VERIFIED CONFIGURATION |
| Restore / Android release | Backup restore drill and current signed Android release workflow were not executed in this recheck | NOT VERIFIED |

The current branch `fix/resend-complaint-nonbillable` also narrows email billing evidence to the explicit `email.delivered` webhook. An `email.complained` event is recorded as a complaint signal only; it must not charge the wallet or release the reservation as a successful delivery.

**Current launch decision:** Do not open general customer traffic yet. Email is the only candidate channel for a controlled production acceptance test after a verified customer login, a real OTP request, a delivered callback, and a wallet ledger check. WhatsApp remains off until the receipt-to-delivery association and idempotent customer billing path are implemented and tested. Do not use the Admin test-send receipt as proof that customer OTP billing is ready.


Status legend: **VERIFIED** (observed result), **IMPLEMENTED, NOT PRODUCTION-VERIFIED** (code merged and CI green, not exercised live), **BLOCKED** (needs an external action), **NOT IMPLEMENTED**.
Overall decision today: **NOT READY FOR PRODUCTION** for opening to paying customers. Reasons are in section 3.

## 0. Update 2026-11-24 (checked live)

| Item | Status |
|---|---|
| `main` `e9a993a`: all CI checks green | VERIFIED |
| Migration 0010 (ticket-linked top-ups) applied to production, columns/indexes/trigger confirmed | VERIFIED |
| Production DB: 0 negative wallets, wallets match ledger (0 of 25 differ) | VERIFIED |
| `/health/ready` on production API: 200, database up | VERIFIED |
| Resend webhook code: Svix HMAC, timing-safe compare, 5 minute window, row lock, charge only on `email.delivered` | VERIFIED BY CODE REVIEW; NOT TESTED with a live event |
| Vercel: no deployment of `main` since `79a23ff` (API, website) / `50786dd` (admin, console, support); platform says "retry in 24 hours" | BLOCKED BY EXTERNAL ACCESS |
| WhatsApp customer sending disabled in code (423 / `delivery_receipt_reconciliation_not_enabled`); gateway runtime health | Disabled VERIFIED BY CODE; health BLOCKED (no Railway access) |
| Resend: `mail.otpprovider.com` verified; `otpprovider.com` DKIM failed; Receiving disabled on both | VERIFIED (read-only) |
| `schema_migrations` has no row for 0008 although its objects exist in production | Tracking drift, see PR notes |
| Mail Center inbound email | NOT IMPLEMENTED (Receiving disabled) |
| Backup restore drill, Android release builds | NOT TESTED |

Launch scope: Email OTP only. WhatsApp stays on the personal QR-linked device and customer sending stays disabled until delivery receipts, reconciliation and billing are verified. See `docs/operations/GO-LIVE-CHECKLIST.md`.

## 1. Delivered and verified (CI green on every merged PR; evidence = PR/commit)

| Area | Evidence | Status |
|---|---|---|
| Country pricing table, WhatsApp price for all countries, email price | PR #12 to #15; `/v1/public/pricing` and `/ar/pricing` checked on production | VERIFIED |
| Super Admin works in customer, support and admin consoles | PR #14, #16, #17 | IMPLEMENTED, NOT PRODUCTION-VERIFIED (owner login pending) |
| Admin-only password recovery (customers); staff passwords via script only | PR #14 | IMPLEMENTED, NOT PRODUCTION-VERIFIED |
| Single sign-in from the website with one-time hand-off | PR #18, #19, migration 0007 applied to production | IMPLEMENTED, NOT PRODUCTION-VERIFIED |
| Coupons (Super Admin creates, customer redeems, DB-enforced limits) | PR #20, migration 0008 applied to production, SQL tests | IMPLEMENTED, NOT PRODUCTION-VERIFIED |
| Real dashboard statistics (customer and admin) | PR #26; 5 unit tests; all numbers aggregated from live tables | IMPLEMENTED, NOT PRODUCTION-VERIFIED |
| Admin language switcher saved in DB (6 languages, RTL) | PR #27; `users.locale`; shell, navigation, overview and translation page localized | IMPLEMENTED, NOT PRODUCTION-VERIFIED |
| Support auto-translation + Admin Translation Management | PR #27; migration 0009 applied to production (3 columns, 3 tables confirmed); 15 unit tests + SQL tests | IMPLEMENTED; real translation **BLOCKED** until a provider key is set |
| Ledger immutability, idempotent billing, charge only on confirmed delivery | existing SQL tests (ledger, deposits, reconciliation) pass in CI | VERIFIED (database level) |

## 1b. Production deployment status (checked 2026-11-23 via Vercel)

| Project | Deployed commit | State |
|---|---|---|
| API | `79a23ff` (PR #30) | READY. `GET /v1/public/pricing` returns 200 on the new deployment |
| Website | `79a23ff` | READY |
| Admin, Console, Support | `50786dd` (PR #27) | READY (later commits did not rebuild them) |

Incident: the API build of `50786dd` failed (TS2339 on `Response`), so the API kept serving the previous version until PR #30 fixed it. The new routes (`/v1/admin/stats`, `/v1/admin/translation`, `/v1/preferences`) are authenticated and could not be exercised from this environment, so they are not production-verified.

Note on main: a copy change (`c32c513`, `bfd7784`) removed the website notice that WhatsApp delivery is not guaranteed and may be restricted by WhatsApp. This is a business decision, but it should be reviewed against what the service can actually promise before opening to customers.

## 2. Known gaps against the master prompt

| Item | Status | Note |
|---|---|---|
| Translation of all admin pages | PARTIAL | Shell, navigation, overview and Translation page are localized; other admin pages are still English and fall back to it |
| Real machine translation | BLOCKED | Needs `TRANSLATION_PROVIDER` (`deepl` or `google`) and `TRANSLATION_API_KEY` in the API environment. Never tested against the real provider from this environment |
| WhatsApp multi-device QR management from Admin | NOT VERIFIED | Gateway lives on Railway; this session has no Railway access to inspect or test it |
| WhatsApp delivery receipts and customer billing | NOT VERIFIED | Keep customer WhatsApp sending disabled until a real receipt and billing test passes |
| Mail Center (inbox, threads, attachments) | NOT IMPLEMENTED in main | PR #22 only adds a basic dashboard, pricing component and docs; it conflicts in 5 files with work already on main (country pricing table, dashboards) and merging it as is would regress them. PR #23 (top-up flow, system map, notifications) is stacked on #22 and ships a migration named `0007_support_linked_deposits.sql`, which collides with the already applied `0007_sso_handoff`; it must be ported onto main as migration 0010 after review, not merged as is |
| Private evidence storage with malware scan and signed URLs | NOT IMPLEMENTED | Deposit evidence is still a text note |
| System Map with real health history, incident management, security center | NOT IMPLEMENTED | Overview shows provider health from `provider_health` only |
| Backup and restore test | NOT DONE | |
| Android: analyze, tests and debug APK for all three apps | NOT RE-VERIFIED this round | Android workflow runs only on main |
| Release signing for Android | BLOCKED | Owner must run `scripts/make-android-keystores.sh` and add the GitHub secrets |

## 3. Blocking items before opening to customers

1. Rotate the Super Admin password (it was pasted in chat) with `reset-primary-accounts` and enrol MFA on every staff account.
2. Verify real logins on production through the website sign-in and each console.
3. WhatsApp: prove delivery receipts on a real, owner-approved test number before enabling customer billing.
4. Merge or redo PR #22 and #23 (Mail Center and top-up handoff) after conflict resolution.
5. Private evidence storage and malware scanning.
6. Set the translation provider key if automatic translation is wanted.
7. Confirm `CORS_ALLOWED_ORIGINS` contains the website origin and the panel URL variables are set.
8. Backup and restore drill on a Neon branch.

## 4. Issues found and fixed during this work

| Severity | Issue | Fix | Evidence |
|---|---|---|---|
| High | Customer console signed out accounts that need MFA | MFA screen added | PR #16 |
| Medium | Settings page showed a fixed "Customer" role | Real role label | PR #17 |
| High | Coupon creation violated `promotions.created_by NOT NULL` | Pass the actor id | PR #20 (caught by CI) |
| Medium | Translation constraint accepted a language without a source (NULL passes a CHECK) | Constraint requires both columns | PR #27 (caught by the new SQL test) |
| Medium | Admin and support API helpers could not send PUT or PATCH | Methods added | PR #27 (caught by typecheck) |

## 5. Production database changes applied manually (all additive)

0007 `sso_handoffs`, 0008 coupons, 0009 translation. No data was dropped or rewritten. A temporary live API key used for a test was revoked.
