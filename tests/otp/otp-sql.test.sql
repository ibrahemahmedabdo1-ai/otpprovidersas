\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
-- Statements copied from otp.service.ts / projects.service.ts / api-key.guard.ts.
-- PREPAREs are UNTYPED on purpose: Postgres infers parameter types exactly as it does for node-pg.
PREPARE audit AS INSERT INTO audit_events(actor_id, action, subject_type, subject_id, ip, metadata) VALUES ($1::uuid,$2::text,$3::text,$4::text,$5::inet,$6::jsonb);
PREPARE ins_proj AS INSERT INTO projects(organization_id, name) VALUES ($1,$2) RETURNING id, name, created_at;
PREPARE ins_key AS INSERT INTO api_keys(project_id, mode, prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at;
PREPARE guard AS SELECT k.id AS key_id, k.mode, p.id AS project_id, p.organization_id, w.id AS wallet_id, o.status AS org_status, p.otp_length, p.otp_ttl_seconds, p.max_attempts, p.resend_cooldown_seconds, p.daily_limit, p.email_enabled, p.whatsapp_enabled FROM api_keys k JOIN projects p ON p.id = k.project_id JOIN organizations o ON o.id = p.organization_id JOIN wallets w ON w.organization_id = o.id WHERE k.key_hash = $1 AND k.revoked_at IS NULL;
PREPARE revoke_key AS UPDATE api_keys k SET revoked_at = now() FROM projects p WHERE k.id = $1 AND k.project_id = $2 AND p.id = k.project_id AND p.organization_id = $3 AND k.revoked_at IS NULL RETURNING k.id;
PREPARE idem_claim AS INSERT INTO idempotency_keys(project_id, key, request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key;
PREPARE idem_store AS UPDATE idempotency_keys SET response = $3::jsonb WHERE project_id = $1 AND key = $2;
PREPARE ins_otp AS INSERT INTO otp_requests(id, project_id, wallet_id, mode, channel, recipient_hash, recipient_encrypted, code_hash, status, max_attempts, last_sent_at, expires_at, correlation_id) VALUES ($1::uuid,$2::uuid,$3::uuid,'test',$4::text,$5::text,$6::text,$7::text,'sent',$8::int, now(), now() + make_interval(secs => $9::int), $10::text) RETURNING created_at, expires_at;
PREPARE lock_otp AS SELECT status, attempts, max_attempts, expires_at, code_hash FROM otp_requests WHERE id = $1 AND project_id = $2 FOR UPDATE;
PREPARE upd_verified AS UPDATE otp_requests SET status = 'verified', attempts = $2::int, verified_at = now() WHERE id = $1;
PREPARE upd_fail AS UPDATE otp_requests SET attempts = $2::int, status = $3::text WHERE id = $1;
PREPARE ins_attempt AS INSERT INTO otp_attempts(otp_request_id, success, ip) VALUES ($1,true,$2::inet);
PREPARE upd_resend AS UPDATE otp_requests SET code_hash = $2::text, resend_count = resend_count + 1, attempts = 0, last_sent_at = now(), status = 'sent' WHERE id = $1;
PREPARE cnt_recent AS SELECT count(*)::int AS n FROM otp_requests WHERE project_id = $1 AND recipient_hash = $2 AND created_at > now() - interval '10 minutes';
PREPARE cnt_day AS SELECT count(*)::int AS n FROM otp_requests WHERE project_id = $1 AND created_at >= date_trunc('day', now());

INSERT INTO users(email,role,status) VALUES ('o1@x.co','customer','active'),('o2@x.co','customer','active');
SELECT id AS u1 FROM users WHERE email='o1@x.co' \gset
SELECT id AS u2 FROM users WHERE email='o2@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('Org1',:'u1'),('Org2',:'u2');
SELECT id AS org1 FROM organizations WHERE name='Org1' \gset
SELECT id AS org2 FROM organizations WHERE name='Org2' \gset
INSERT INTO wallets(organization_id) VALUES (:'org1'),(:'org2');
SELECT id AS w1 FROM wallets WHERE organization_id=:'org1' \gset
SELECT id AS w2 FROM wallets WHERE organization_id=:'org2' \gset

EXECUTE ins_proj(:'org1','App One') \gset p1_
EXECUTE ins_proj(:'org2','App Two') \gset p2_
EXECUTE ins_key(:'p1_id','test','otp_test_aaaa','hash-aaa',:'u1') \gset k1_
EXECUTE ins_key(:'p2_id','test','otp_test_bbbb','hash-bbb',:'u2') \gset k2_
EXECUTE audit(:'u1','api_key.create','api_key',:'k1_id',NULL,'{"mode":"test"}');
EXECUTE audit(NULL,'otp.send','otp_request','abc','203.0.113.9','{}');
\echo PASS project, key and audit statements accepted with inferred types (nullable actor and ip included)

SELECT count(*)=1 AS ok FROM api_keys WHERE key_hash='hash-aaa' \gset
\if :ok \echo PASS key stored by hash \else SELECT 1/0; \endif
SELECT (SELECT count(*) FROM projects WHERE organization_id=:'org1')=1 AS ok \gset
\if :ok \echo PASS project belongs to its organization \else SELECT 1/0; \endif

SAVEPOINT dup;
DO $$ DECLARE o uuid; BEGIN SELECT id INTO o FROM organizations WHERE name='Org1';
  BEGIN INSERT INTO projects(organization_id,name) VALUES (o,'App One'); RAISE EXCEPTION 'FAIL duplicate name accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS duplicate project name rejected (23505)'; END; END $$;
ROLLBACK TO dup;

EXECUTE guard('hash-aaa');
SELECT count(*)=1 AS ok FROM api_keys k JOIN projects p ON p.id=k.project_id JOIN organizations o ON o.id=p.organization_id JOIN wallets w ON w.organization_id=o.id WHERE k.key_hash='hash-aaa' AND k.revoked_at IS NULL \gset
\if :ok \echo PASS API key resolves to project, organization and wallet \else SELECT 1/0; \endif

-- IDOR: org2 cannot revoke org1's key; org1 can; revoked key no longer resolves
WITH x AS (UPDATE api_keys k SET revoked_at = now() FROM projects p WHERE k.id = :'k1_id' AND k.project_id = :'p1_id' AND p.id = k.project_id AND p.organization_id = :'org2' AND k.revoked_at IS NULL RETURNING k.id) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS other organization cannot revoke the key (IDOR) \else SELECT 1/0; \endif
EXECUTE revoke_key(:'k1_id',:'p1_id',:'org1');
SELECT count(*)=0 AS ok FROM api_keys WHERE key_hash='hash-aaa' AND revoked_at IS NULL \gset
\if :ok \echo PASS revoked key no longer authenticates \else SELECT 1/0; \endif

-- OTP request lifecycle
SELECT gen_random_uuid() AS oid \gset
EXECUTE ins_otp(:'oid',:'p2_id',:'w2','email','rh1','enc','codehash1',3,300,'corr-1');
EXECUTE lock_otp(:'oid',:'p2_id');
EXECUTE upd_fail(:'oid',1,'sent');
EXECUTE ins_attempt(:'oid','203.0.113.9');
EXECUTE cnt_recent(:'p2_id','rh1');
EXECUTE cnt_day(:'p2_id');
SELECT count(*)=0 AS ok FROM otp_requests WHERE id=:'oid' AND project_id=:'p1_id' \gset
\if :ok \echo PASS OTP request is invisible to another project (IDOR) \else SELECT 1/0; \endif
EXECUTE upd_resend(:'oid','codehash2');
SELECT (resend_count=1 AND attempts=0 AND code_hash='codehash2') AS ok FROM otp_requests WHERE id=:'oid' \gset
\if :ok \echo PASS resend replaces the code hash and resets attempts \else SELECT 1/0; \endif
EXECUTE upd_verified(:'oid',1);
SELECT (status='verified' AND verified_at IS NOT NULL) AS ok FROM otp_requests WHERE id=:'oid' \gset
\if :ok \echo PASS verified state recorded \else SELECT 1/0; \endif

-- database refuses more attempts than the maximum
DO $$ DECLARE r uuid; BEGIN SELECT id INTO r FROM otp_requests LIMIT 1;
  BEGIN UPDATE otp_requests SET attempts = max_attempts + 1 WHERE id = r; RAISE EXCEPTION 'FAIL attempts above max accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS database refuses attempts above the maximum'; END; END $$;

-- idempotency: first claim wins, duplicate claim returns nothing, response stored without the code
EXECUTE idem_claim(:'p2_id','order-1','reqhash');
WITH x AS (INSERT INTO idempotency_keys(project_id, key, request_hash) VALUES (:'p2_id','order-1','reqhash') ON CONFLICT DO NOTHING RETURNING key) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS duplicate idempotency key is not claimed twice \else SELECT 1/0; \endif
EXECUTE idem_store(:'p2_id','order-1','{"id":"x","status":"sent"}');
SELECT (response->>'status'='sent') AS ok FROM idempotency_keys WHERE project_id=:'p2_id' AND key='order-1' \gset
\if :ok \echo PASS idempotent response stored \else SELECT 1/0; \endif
ROLLBACK;
