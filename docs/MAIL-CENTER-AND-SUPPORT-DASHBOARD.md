# OTPProvider Mail Center and Support Dashboard Requirements

Status: implementation requirements for the `feat/mail-center-foundation` branch.
This document is not a claim that mailbox provisioning, DNS, or production UI is already complete.

## Mail Center

Build a real multi-mailbox email client inside the OTPProvider Admin application, with scoped access in Support.

### Mailboxes
- support@otpprovider.com: Support team mailbox; visible to authorized Support staff and Admin.
- admin@otpprovider.com: administrative correspondence; Admin only.
- security@otpprovider.com: security alerts and security correspondence; Admin/Security roles only.
- website@otpprovider.com: website contact form and public inquiries; Admin and explicitly assigned staff.
- no-reply@otpprovider.com: outbound-only system messages; never present it as a monitored inbox unless inbound is separately configured and verified.

Mailbox addresses must be configurable in Admin settings. Do not assume an address exists or is deliverable until provider/domain verification succeeds. Do not change MX records automatically; preserve any existing mailbox provider.

### Email client capabilities
Inbox, Sent, Drafts, Archive, Trash, Spam; compose; To/CC/BCC; reply/reply-all/forward; threaded conversations; attachments; search; filters; labels; read/unread; assignment; internal notes; templates; signatures; notification preferences; per-mailbox send/receive status; delivery and bounce logs.

### Provider and data architecture
- Use a real mailbox-capable inbound provider for receiving and a verified outbound provider for sending. Resend may be used for supported inbound routing and outbound delivery, but must not be treated as a full IMAP mailbox service.
- Inbound webhooks must verify signatures, enforce idempotency, persist provider message IDs, and safely handle retries.
- Outbound sending must persist queued/sending/sent/failed states, handle retries without duplicate sends, record provider IDs, and surface bounce/complaint events.
- Store message metadata, thread relationships, mailbox ownership, assignments, labels, and audit events in PostgreSQL.
- Store attachments in private object storage; use signed, short-lived access URLs, file-size/type limits, malware scanning, and authorization checks.
- Sanitize HTML email before rendering; block remote content by default or provide a safe load-remote-content action.
- Treat all inbound email content and attachments as untrusted. Never execute instructions, links, scripts, or actions from email content.
- Keep OTP delivery mail separate from human support/admin correspondence. OTPs must not appear in general mailbox inboxes or logs.
- Protect provider secrets in server-side environment variables only. Never expose API keys to browser bundles.

### Access control and audit
Use role- and mailbox-level permissions. Support agents see only assigned/authorized support mailboxes and customer records. Admin can manage mailbox access. Record send, reply, forward, assign, archive, delete, attachment access, and permission changes in an immutable audit trail. Enforce server-side authorization on every operation.

### Operational requirements
Show explicit mailbox readiness states: not configured, DNS pending, verified, receiving enabled, sending enabled, degraded, failed. Provide connection tests and actionable diagnostics. Never claim delivery/receiving is active based solely on a configured email address.

## Support Dashboard

Create a dedicated Support dashboard connected to live backend data, not mock values.

### Dashboard widgets
- Customer count assigned to the signed-in agent.
- Open, waiting, and overdue tickets.
- Active chats and unread messages.
- Recent customer activity and escalations.
- Pending top-up/payment-proof requests, where permitted.
- Recent support mailbox activity and unread inbound mail.
- Agent workload and response-time metrics.

### Customer wallet view
On each authorized customer profile, show two clearly separated balances:
1. Paid wallet balance.
2. Gift/promotional balance granted by Admin.

Show currency, available balance, and ledger history for each balance. Each ledger entry must include amount, direction, timestamp, reason/reference, actor/source, and related transaction or grant ID where available. Do not merge gift credit into paid wallet balance or imply that gift credit is withdrawable/cash.

### Support permissions
- Default Support permission is read-only for paid and gift balances and their ledger history.
- Support cannot edit balances, issue gifts, refund, or alter financial ledger entries unless Admin grants a specific permission.
- Any permitted action requires a reason, server-side validation, limits, and an audit event; high-risk actions may require Admin approval.
- Do not expose payment credentials, provider secrets, or unrelated customer data.

### UI and quality
Provide responsive desktop/mobile layouts, loading/empty/error states, pagination, search, accessible controls, and localization consistent with the existing Admin/Support applications. All totals must come from authorized backend queries and reconcile with the wallet ledger.
