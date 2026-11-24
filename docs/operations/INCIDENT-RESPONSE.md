# Incident response

1. **Detect:** `/health/ready`, Admin overview, Resend dashboard, Railway gateway `/health`, GitHub Actions `health-ping`.
2. **Classify:** SEV1 money or data wrong, or secrets exposed. SEV2 a channel is down. SEV3 degraded or cosmetic.
3. **Contain first:**
   - Wrong charges: stop the cause (disable the provider in Admin) before correcting balances. Correct only through ledger entries; never edit balances directly.
   - Suspected secret leak: rotate that secret (API key, `RESEND_WEBHOOK_SECRET`, database password) and review `audit_log`. Do not rotate `SESSION_ENCRYPTION_KEY` without a migration plan.
   - WhatsApp misbehaving: keep `WA_CUSTOMER_SEND_ENABLED=false`. Do not log out the device or re-pair without the owner's approval.
4. **Roll back a bad deploy:** promote the previous READY Vercel deployment of that project. Migrations are forward-only and additive, so keep schema and roll back code.
5. **Record:** time, impact, cause, fix, follow-up. Store evidence without secrets or customer data.
6. **Verify:** health endpoints, one real Email OTP, wallet vs ledger consistency query, and delivery webhook flow.

Wallet consistency check (read-only): sum of ledger `paid`/`promo` entries per wallet must equal the wallet's `paid_micro_usd + promo_micro_usd`.
