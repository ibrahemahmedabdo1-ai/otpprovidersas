# OTPProvider Admin Dashboard — product and implementation specification

## Goal
Deliver a high-quality, operational Super Admin dashboard backed by live API/database data. This dashboard is the command center for the Email OTP + WhatsApp OTP business. Do not render fabricated metrics or placeholder balances as production data.

## Main dashboard layout
- Responsive collapsible sidebar and top bar; global search, notifications, current admin, language switcher (Arabic, English, Russian, Spanish, German, Chinese), light/dark theme, RTL/LTR.
- Date-range filter and timezone-aware reporting.
- KPI cards: total customers, active customers, OTP requests, successful deliveries, delivery rate, paid wallet liability, gift-credit liability, revenue/credits sold, pending top-ups, open tickets, provider health.
- Charts: OTP volume and delivery success over time; Email vs WhatsApp mix; country usage; paid vs gift credits; customer growth; failure reasons.
- Live operational feed: provider status changes, failed deliveries, webhook failures, unusual account activity, top-up approvals, staff actions.
- Health panel: API, database, email sending, email inbound, WhatsApp provider routes, queue/scheduler, webhook processing, storage, latest backup status. Each signal must come from a health check and show last checked time.

## Core admin modules
1. Customers: search/filter, profile, status, verification, usage, wallet ledgers, gift ledger, sessions, API keys, restrictions, notes, support history.
2. Wallet & finance: paid balance and gift balance kept separate; immutable ledger; manual top-up review; approval workflow; refunds/adjustments only through audited ledger entries; CSV export with permission.
3. Packages, pricing & country catalog: country flag/name, Email OTP price, WhatsApp OTP price, availability, active routes; admin edit/approval and change history.
4. Providers & routing: provider credentials stored only as server-side secrets; route health, latency, delivery success, cost, weighted/balanced selection, failover, retry policies, circuit breakers, test mode.
5. OTP operations: request search, delivery status, timestamps, country, service, provider route, failure reason. Mask recipient/OTP secrets; never expose OTP values in ordinary admin views or logs.
6. Support: tickets, live chats, customer escalations, staff assignments, service-level timers, internal notes, customer timeline.
7. Mail Center: separate mailboxes support@, admin@, security@, website@ and outbound-only no-reply@. Full inbox/sent/drafts/archive/trash/spam, compose, CC/BCC, reply/reply-all/forward, threads, attachments, search, labels, templates, signatures, assignment, provider logs and connection health. Support users see only support mailbox; Admin sees mailboxes permitted by role.
8. Security & audit: sign-in events, MFA, sessions, suspicious activity, rate limits, abuse alerts, audit trail, webhook validation, secret rotation reminders.
9. Reports: usage, delivery, revenue, wallet liability, gift grants, country, providers, staff performance; date filters and exports.
10. Staff & permissions: roles and granular permissions, mailbox scope, approval thresholds, session revocation, staff activity.
11. System settings: localization, themes, branding, email routing, notification rules, rate limits, maintenance mode, retention and backup configuration.

## Finance and wallet invariants
- Paid wallet and gift balance must always be displayed separately.
- Gift balance is promotional/non-cash and is not withdrawable.
- Support defaults to read-only access to both balances and their ledger histories.
- Every credit/debit is a ledger transaction with amount, currency, source, actor, reason, reference, timestamp, and idempotency key.
- Never update a balance directly from the UI. Use transactional backend ledger functions.
- Admin adjustments require reason and audit entry; high-risk changes require a second approver if configured.
- Dashboard totals must be reconciled against ledger sums, not independently maintained counters.

## Mail safety and reliability
- Resend is a sending/inbound-webhook component, not a conventional IMAP mailbox. Provision a mailbox-capable receiving service if users need normal address-based receiving and sending.
- Do not change MX records without confirming the existing mail host and an approved migration plan.
- Inbound webhook: verify provider signature against raw body, idempotently persist provider event/message ID, safely retry, quarantine malformed payloads.
- Outbound: queue, idempotency, rate limits, status tracking, bounce/complaint handling, retry with backoff.
- HTML sanitization, remote images blocked by default, attachment scanning, private object storage, signed expiring downloads.
- Treat email body and attachments as untrusted; no automatic command execution or privileged actions from message content.
- Keep OTP transactional messages isolated from human correspondence and never expose OTP secrets in Mail Center.

## Security and operations
- Enforce authorization on every API route and record access to sensitive customer, finance, security, and mailbox data.
- MFA mandatory for Super Admin; step-up auth for critical operations.
- CSRF/origin protection, rate limiting, secure cookies, strict input validation, output encoding, secret management, least privilege.
- Operational health must distinguish configured, verified, enabled, degraded, and failed. Do not label a mailbox or provider active unless an actual send/receive test passes.
- Provide empty, loading, error, permission-denied and stale-data states; never disguise missing backend data as zero.
- All charts and counts must be computed server-side from authorized, indexed queries and display their date range and last refresh.

## Acceptance criteria
- Support agent can see their workload, assigned tickets, chats, authorized customer details, and separate paid/gift balances with ledger history; cannot modify finance by default.
- Admin can see global business KPIs and service health sourced from live APIs.
- Admin can manage all authorized mailboxes and send/receive real messages once provider/DNS setup is verified.
- Role tests prove Support cannot read Admin/Security/Website mailboxes or perform restricted finance operations.
- Tests cover wallet ledger integrity, mailbox authorization, inbound webhook signature/idempotency, outbound retry behavior, attachment access, HTML sanitization, and dashboard data aggregation.
- Production deployment is blocked until CI, migration checks, provider readiness checks, and real send/receive smoke tests pass.
