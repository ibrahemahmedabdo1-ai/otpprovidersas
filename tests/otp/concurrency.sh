#!/usr/bin/env bash
# 30 concurrent verification attempts against ONE otp request (max 3 attempts).
# Uses the same pattern as otp.service.ts: SELECT ... FOR UPDATE, then count the attempt.
# Expected: exactly 3 attempts are recorded, never more. Run on a disposable, migrated database.
set -euo pipefail
: "${DATABASE_URL_DIRECT:?set DATABASE_URL_DIRECT to a disposable migrated database}"
Q() { psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -q -At "$@"; }

SUFFIX=$RANDOM$RANDOM
Q -c "INSERT INTO users(email,role,status) VALUES ('conc$SUFFIX@x.co','customer','active')"
UID_=$(Q -c "SELECT id FROM users WHERE email='conc$SUFFIX@x.co'")
Q -c "INSERT INTO organizations(name,owner_user_id) VALUES ('conc$SUFFIX','$UID_')"
ORG=$(Q -c "SELECT id FROM organizations WHERE name='conc$SUFFIX'")
Q -c "INSERT INTO wallets(organization_id) VALUES ('$ORG')"
Q -c "INSERT INTO projects(organization_id,name) VALUES ('$ORG','p')"
PROJ=$(Q -c "SELECT id FROM projects WHERE organization_id='$ORG'")
WAL=$(Q -c "SELECT id FROM wallets WHERE organization_id='$ORG'")
OTP=$(Q -c "INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,status,max_attempts,expires_at,correlation_id) VALUES ('$PROJ','$WAL','test','email','h','e','c','sent',3, now()+interval '5 minutes','corr') RETURNING id" | head -1)

ATTEMPT_SQL="BEGIN;
SELECT attempts, max_attempts FROM otp_requests WHERE id='$OTP' FOR UPDATE \gset
SELECT (:attempts < :max_attempts) AS can \gset
\if :can
UPDATE otp_requests SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= max_attempts THEN 'locked' ELSE status END WHERE id='$OTP';
INSERT INTO otp_attempts(otp_request_id, success) VALUES ('$OTP', false);
\endif
COMMIT;"
for i in $(seq 1 30); do echo "$ATTEMPT_SQL" | psql "$DATABASE_URL_DIRECT" -q -At >/dev/null 2>&1 & done
wait

ROW=$(Q -c "SELECT attempts || '|' || status FROM otp_requests WHERE id='$OTP'")
REC=$(Q -c "SELECT count(*) FROM otp_attempts WHERE otp_request_id='$OTP'")
echo "attempts column: ${ROW%%|*}   status: ${ROW##*|}   attempt rows: $REC"
if [ "${ROW%%|*}" = "3" ] && [ "${ROW##*|}" = "locked" ] && [ "$REC" = "3" ]; then echo "PASS 30 concurrent guesses produced exactly 3 counted attempts and a lock"; else echo "FAIL attempts were not serialised"; exit 1; fi
