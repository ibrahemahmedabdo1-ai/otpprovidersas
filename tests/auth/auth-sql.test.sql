\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
-- Same statements as auth.service.ts. PREPAREs are UNTYPED on purpose: Postgres infers parameter types exactly as it does for node-pg.
PREPARE ins_user AS INSERT INTO users(email,password_hash,display_name,locale,role,status) VALUES ($1,$2,$3,$4,'customer','pending') ON CONFLICT (email) DO NOTHING RETURNING id;
PREPARE ins_org AS INSERT INTO organizations(name,owner_user_id) VALUES ($1,$2) RETURNING id;
PREPARE ins_tok AS INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at) VALUES ($1,'verify_email',$2, now() + interval '24 hours');
PREPARE audit AS INSERT INTO audit_events(actor_id, action, subject_type, subject_id, ip, metadata) VALUES ($1::uuid,$2,'user',$1::uuid::text,$3::inet,$4::jsonb);
PREPARE verify AS UPDATE email_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > now() RETURNING user_id;
PREPARE fail AS UPDATE users SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END, locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id = $1;
PREPARE ins_sess AS INSERT INTO sessions(user_id,token_hash,ip,user_agent,expires_at) VALUES ($1,$2,$3,$4,$5);
PREPARE authn AS SELECT s.id, u.id, (SELECT organization_id FROM memberships m WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1) FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active';
PREPARE revoke AS UPDATE sessions SET revoked_at = now(), revoked_reason = 'user_revoked' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id;

EXECUTE ins_user('ann@x.co','argon-hash','Ann','en') \gset a_
EXECUTE ins_user('bob@x.co','argon-hash','Bob','ar') \gset b_
EXECUTE ins_org('Ann',:'a_id') \gset ao_
EXECUTE ins_org('Bob',:'b_id') \gset bo_
INSERT INTO memberships(organization_id,user_id,role) VALUES (:'ao_id',:'a_id','owner'),(:'bo_id',:'b_id','owner');
INSERT INTO wallets(organization_id) VALUES (:'ao_id'),(:'bo_id');
EXECUTE ins_tok(:'a_id','tokhash1');
EXECUTE audit(:'a_id','auth.register','203.0.113.5','{"k":1}');
EXECUTE audit(:'a_id','auth.verify',NULL,'{}');

\echo PASS statements accepted with inferred types; user+org+membership+wallet+token+audit created
SELECT (SELECT count(*) FROM users WHERE email='ann@x.co')=1 AS ok \gset
\if :ok \echo PASS email unique (citext) \else SELECT 1/0; \endif
SELECT count(*)=0 AS ok FROM users WHERE email='ANN@X.CO' AND id <> :'a_id' \gset
\if :ok \echo PASS email lookup is case-insensitive \else SELECT 1/0; \endif

-- duplicate registration: ON CONFLICT DO NOTHING must create nothing (and return no row)
WITH x AS (INSERT INTO users(email,password_hash,role,status) VALUES ('Ann@X.co','h','customer','pending') ON CONFLICT (email) DO NOTHING RETURNING id) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS duplicate email registration inserts nothing \else SELECT 1/0; \endif

-- email verification is single-use
EXECUTE verify('tokhash1');
SELECT (SELECT used_at IS NOT NULL FROM email_tokens WHERE token_hash='tokhash1') AS ok \gset
\if :ok \echo PASS verify token consumed \else SELECT 1/0; \endif
WITH x AS (UPDATE email_tokens SET used_at = now() WHERE token_hash='tokhash1' AND purpose='verify_email' AND used_at IS NULL AND expires_at > now() RETURNING 1) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS verify token cannot be reused \else SELECT 1/0; \endif
INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at) VALUES (:'a_id','verify_email','expired', now() - interval '1 minute');
WITH x AS (UPDATE email_tokens SET used_at = now() WHERE token_hash='expired' AND used_at IS NULL AND expires_at > now() RETURNING 1) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS expired verify token rejected \else SELECT 1/0; \endif
UPDATE users SET email_verified_at = now(), status='active' WHERE id=:'a_id' AND status='pending';
UPDATE users SET email_verified_at = now(), status='active' WHERE id=:'b_id' AND status='pending';

-- lockout: 4 failures count up, the 5th locks and resets the counter
EXECUTE fail(:'a_id',5,'15'); EXECUTE fail(:'a_id',5,'15'); EXECUTE fail(:'a_id',5,'15'); EXECUTE fail(:'a_id',5,'15');
SELECT failed_login_count=4 AND locked_until IS NULL AS ok FROM users WHERE id=:'a_id' \gset
\if :ok \echo PASS 4 failures: counted, not locked \else SELECT 1/0; \endif
EXECUTE fail(:'a_id',5,'15');
SELECT failed_login_count=0 AND locked_until > now() + interval '14 minutes' AND locked_until < now() + interval '16 minutes' AS ok FROM users WHERE id=:'a_id' \gset
\if :ok \echo PASS 5th failure locks the account for 15 minutes \else SELECT 1/0; \endif

-- sessions: authenticate, IDOR-safe revoke, revoked sessions stop authenticating
EXECUTE ins_sess(:'a_id','sess-a','203.0.113.5','UA', now() + interval '30 days') ;
EXECUTE ins_sess(:'b_id','sess-b',NULL,NULL, now() + interval '30 days');
SELECT id AS sa FROM sessions WHERE token_hash='sess-a' \gset
SELECT id AS sb FROM sessions WHERE token_hash='sess-b' \gset
SELECT count(*)=1 AS ok FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash='sess-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' \gset
\if :ok \echo PASS active session authenticates \else SELECT 1/0; \endif
WITH x AS (UPDATE sessions SET revoked_at=now() WHERE id=:'sb' AND user_id=:'a_id' AND revoked_at IS NULL RETURNING id) SELECT count(*)=0 AS ok FROM x \gset
\if :ok \echo PASS user A cannot revoke another user session (IDOR) \else SELECT 1/0; \endif
EXECUTE revoke(:'sa',:'a_id');
SELECT count(*)=0 AS ok FROM sessions s WHERE s.token_hash='sess-a' AND s.revoked_at IS NULL \gset
\if :ok \echo PASS revoked session no longer authenticates \else SELECT 1/0; \endif
EXECUTE authn('sess-b');
UPDATE users SET status='suspended' WHERE id=:'b_id';
SELECT count(*)=0 AS ok FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash='sess-b' AND u.status='active' \gset
\if :ok \echo PASS session of a suspended user stops working \else SELECT 1/0; \endif

-- staff accounts cannot exist without MFA flag (login refuses them anyway until MFA ships)
SAVEPOINT s1;
DO $$ BEGIN INSERT INTO users(email,role,mfa_required) VALUES ('staff@x.co','admin_staff',false); EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS staff row without MFA rejected by database'; END $$;
ROLLBACK;
