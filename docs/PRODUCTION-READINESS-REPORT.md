# OTPProvider production readiness report

Status legend: **VERIFIED** (observed result), **IMPLEMENTED, NOT PRODUCTION-VERIFIED** (code merged and CI green, not exercised live), **BLOCKED** (needs an external action), **NOT IMPLEMENTED**.
Overall decision today: **NOT READY FOR PRODUCTION** for opening to paying customers. Reasons are in section 3.

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

## 2. Known gaps against the master prompt

| Item | Status | Note |
|---|---|---|
| Translation of all admin pages | PARTIAL | Shell, navigation, overview and Translation page are localized; other admin pages are still English and fall back to it |
| Real machine translation | BLOCKED | Needs `TRANSLATION_PROVIDER` (`deepl` or `google`) and `TRANSLATION_API_KEY` in the API environment. Never tested against the real provider from this environment |
| WhatsApp multi-device QR management from Admin | NOT VERIFIED | Gateway lives on Railway; this session has no Railway access to inspect or test it |
| WhatsApp delivery receipts and customer billing | NOT VERIFIED | Keep customer WhatsApp sending disabled until a real receipt and billing test passes |
| Mail Center (inbox, threads, attachments) | NOT IMPLEMENTED in main | PR #22 and #23 are not merged; the conflict resolution is still to do |
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
