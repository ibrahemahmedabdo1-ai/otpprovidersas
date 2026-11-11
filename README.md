# OTPProvider (foundation, incomplete — see DELIVERY-REPORT.md)
Test the database layer: `DATABASE_URL_DIRECT=postgresql://... bash scripts/test-database.sh` (empty disposable DB).
Test packages: `cd packages/<name> && node --test "src/**/*.test.ts"` (Node 22.18+). otp-engine needs `@otp/security` linked via `pnpm install`.
Regenerate icons: `node scripts/generate-icons.mjs` (needs `sharp`).
