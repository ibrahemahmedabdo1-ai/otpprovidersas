# Operations runbook

## Launch checklist (every line must be true before taking real users)
- [ ] Migrations applied; a Neon restore was rehearsed on a branch
- [ ] All secrets set, unique, stored in a password manager; the ones ever pasted in chat are rotated
- [ ] Real Super Admin created via CLI with MFA enrolled and recovery codes stored offline; throwaway/test admins suspended
- [ ] Email provider configured and a verification + password-reset email actually arrives (currently BLOCKED: no Resend adapter)
- [ ] `CORS_ALLOWED_ORIGINS` lists only your web origins
- [ ] Legal documents in `docs/legal` reviewed by a lawyer and published on the website
- [ ] Live OTP sending stays OFF until a real provider adapter is built and tested

## Money rules (never bypass)
- Customers only *request* top-ups. An admin credits a wallet only after seeing the money in the receiving account; the approval needs a receipt note. admin_staff also needs a Super Admin approval; support can never approve or change balances.
- The ledger and audit log are append-only (database triggers). Corrections are new entries, never edits.

## Routine
| Task | How |
|---|---|
| Deposit review | Admin console, Deposits. Verify in the bank/wallet first |
| Approval requests | Admin console, Approvals (Super Admin) |
| Ticket handling | Support console. Internal notes are never shown to customers |
| Suspend a staff user | `UPDATE users SET status='suspended'` then revoke sessions (do it with a second person watching) |
| Rotate a secret | Change the env var, redeploy. `AUTH_SECRET`/`SESSION_SECRET`/peppers invalidate existing sessions/keys by design |

## Incident basics
1. Contain: suspend the affected user or key, rotate secrets that may be exposed.
2. Preserve: do not edit the audit log; export relevant rows.
3. Notify affected customers as your privacy policy and local law require.

## WhatsApp OTP: risk notice (read before enabling)
WhatsApp OTP here uses a QR-linked device (an unofficial mode), not the official Business API. Consequences: delivery is NOT guaranteed; WhatsApp can limit, ban or disconnect the number at any time; messages can be delayed or lost; it can violate WhatsApp's terms depending on use. It is OFF by default, isolated from other channels, and must never be advertised as a guaranteed delivery channel. Enable it only for projects that accepted the risk, with a fallback to email. The adapter is NOT IMPLEMENTED yet; this section is the policy it must follow.
