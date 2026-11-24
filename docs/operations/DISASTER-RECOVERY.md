# Disaster recovery

| Asset | Where | Recovery |
|---|---|---|
| Database | Neon (point-in-time restore within the plan's retention window) | Create a restore **branch** from a timestamp, verify it, then repoint only after owner approval. Never restore over production. |
| Code | GitHub `main` | Re-deploy any commit; `main` is protected, no force-push. |
| Migrations | `packages/database/migrations`, tracked in `schema_migrations` | Forward-only. Applied files are never edited. |
| Secrets | Vercel / Railway / GitHub environment settings | Owner holds originals in a password manager. Rotate on loss. |
| WhatsApp session | Railway volume, encrypted with `SESSION_ENCRYPTION_KEY` | Without the key the session is unrecoverable and needs a new QR pairing (owner approval). Back up the key separately from the volume. |
| Email | Resend | Domain `mail.otpprovider.com`; re-create webhook and update `RESEND_WEBHOOK_SECRET` if lost. |

Targets (proposed, owner to confirm): RPO = Neon retention granularity, RTO = under 4 hours for API and database.

## Restore drill (NOT YET PERFORMED)
1. Create a Neon branch from a recent timestamp.
2. Run the ledger/wallet consistency query and row counts on the branch.
3. Delete the branch. Record the date and results here.
