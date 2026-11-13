#!/usr/bin/env bash
# Applies migrations to DATABASE_URL_DIRECT (must be an EMPTY test database) and runs SQL tests.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL_DIRECT:?set DATABASE_URL_DIRECT to a disposable test database}"
node scripts/migrate.mjs
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f tests/billing/ledger.test.sql
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f tests/admin/admin-sql.test.sql
