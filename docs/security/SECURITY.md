# Security model (summary)

| Topic | Implementation | Status |
|---|---|---|
| Passwords | Argon2id, 12-128 chars, common-password and email-part checks, equal-time responses for unknown users | PASS (tests) |
| Sessions | Opaque random tokens, only SHA-256 stored; httpOnly SameSite cookie (web) or Bearer (mobile); Origin check for cookie CSRF | PASS (smoke) |
| Staff MFA | Mandatory TOTP, replay protection per time step, 10 single-use recovery codes (HMAC stored); pending sessions blocked from everything but MFA routes | PASS (tests + smoke) |
| Lockout and rate limits | Per account and per IP; in-memory (single instance only) | PARTIAL: needs shared store to scale |
| Roles | customer, support_staff, admin_staff, super_admin; enforced in controllers and again inside SQL functions for money | PASS (SQL tests) |
| Money | Integer micro-USD, append-only ledger, charge only on confirmed delivery, idempotent posting | PASS (SQL tests) |
| API keys | Only a hash stored, shown once, test mode only | PASS |
| Customer data in tickets | Customers never receive internal notes or staff email addresses | NOT TESTED (smoke script written) |
| Secrets in logs | Not logged; mail failures log only the error message | review before launch |
| Dependencies | Next.js pinned to 15.5.29 (earlier 15.x flagged vulnerable) | run `pnpm audit` regularly |
| Web headers | CSP and no-store on consoles, noindex on private apps | PASS (config), NOT TESTED in browser |

Out of scope / not done: penetration test, WAF, DDoS protection, SOC2-type controls, secrets manager integration, backup restore drill.
