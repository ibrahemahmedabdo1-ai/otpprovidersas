# Deployment guide (sandbox launch)

Status: documented, NOT yet performed by the author. Nothing here has been deployed or load-tested.

## Pieces
| Piece | Where | Notes |
|---|---|---|
| Database | Neon PostgreSQL | Pooled URL for the API, direct URL for migrations |
| API (NestJS) | Any container host (Fly.io, Render, Railway, a VPS) | A long-running Node process; use `infrastructure/docker/backend.Dockerfile`. Vercel serverless is not the right fit for the API |
| Website, customer, admin, support web | Vercel (one project per app) | Root directory `apps/<name>`, framework Next.js |
| Android apps | GitHub Actions (`android.yml`) | Debug-signed until you add a real keystore |

## 1. Neon
1. Create a project and database. Keep the *pooled* string for `DATABASE_URL` and the *direct* string for `DATABASE_URL_DIRECT`.
2. Apply migrations in order from `packages/database/migrations/` (0001 to 0003 and any newer file): `pnpm db:migrate` needs `psql`; otherwise paste each file into the Neon SQL Editor in order. Never mix the two methods on one database (the runner records versions; manual pasting does not).
3. Enable point-in-time restore on the plan you choose and test a restore on a branch before launch.

## 2. API
Set these as real environment variables on the host (never commit them). Generate each secret with `openssl rand -base64 48` (`ENCRYPTION_KEY` with `-base64 32`):
`NODE_ENV=production`, `DATABASE_URL`, `AUTH_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `WEBHOOK_SIGNING_SECRET`, `API_KEY_PEPPER`, `OTP_HASH_PEPPER`, `APP_BASE_URL` (customer web origin, used in email links), `CORS_ALLOWED_ORIGINS` (comma list of the web origins; never `*`).
The API refuses to start in production when a required value is missing or weak.
Health checks: `GET /health/live`, `GET /health/ready`.
Behind a proxy, make sure the platform forwards the client IP (rate limits and audit use it).
**Email:** set `RESEND_API_KEY` and `EMAIL_FROM` (a verified Resend sending domain) to enable real email. Without them production uses `DisabledMailer` and registration/password-reset emails are NOT sent. The Resend adapter is written but NOT TESTED against the live service.

## 3. First Super Admin
On a trusted machine with the production `DATABASE_URL` in the environment: `pnpm create-staff` (type the password in the terminal, never in chat or a ticket). Enroll MFA at first sign-in and store the recovery codes offline. Do not create a second Super Admin unless you mean to.

## 4. Vercel (four projects)
| Project | Root directory | Environment |
|---|---|---|
| website | `apps/website` | `NEXT_PUBLIC_SITE_URL` (the public origin) |
| customer web | `apps/customer-web` | `API_BASE_URL` (API origin) |
| admin web | `apps/admin-web` | `API_BASE_URL` |
| support web | `apps/support-web` | `API_BASE_URL` |
The web apps proxy `/api/*` to `API_BASE_URL`, so browser cookies stay same-origin. Put the admin and support consoles on their own hostnames and restrict them further (Vercel deployment protection, IP allow-list, or a VPN) if you can.

## 5. Android
Run the "Android apps" workflow. For store builds add a keystore: create secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` and extend the workflow to sign (not done yet: BLOCKED on the keystore). Set the repository variable `API_BASE_URL` to the production API origin.

## 6. Before real users
See `docs/operations/RUNBOOK.md` (launch checklist). Search visibility steps are in `docs/seo.md`.
