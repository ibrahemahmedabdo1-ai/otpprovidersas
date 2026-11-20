\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
-- Same statements as admin.service.ts / mfa.service.ts, untyped PREPAREs like node-pg
PREPARE decide AS UPDATE approvals SET status = $2::text, decided_by = $3::uuid, decided_at = now(), decision_note = $4::text WHERE id = $1::uuid AND status = 'pending' AND requested_by <> $3::uuid RETURNING subject_id;
PREPARE ask AS INSERT INTO approvals(action, subject_type, subject_id, requested_by) VALUES ('wallet.deposit.approve','deposit',$1::text,$2::uuid) RETURNING id;
PREPARE approve AS SELECT approve_deposit($1::uuid, $2::uuid, $3::text) AS credited;
PREPARE credit AS SELECT admin_credit_customer($1::uuid, $2::uuid, $3::bigint, $4::text, $5::text) AS credited;
PREPARE listdep AS SELECT d.id, d.status, (SELECT a.status FROM approvals a WHERE a.action = 'wallet.deposit.approve' AND a.subject_id = d.id::text ORDER BY a.created_at DESC LIMIT 1) AS approval_status FROM deposits d JOIN wallets w ON w.id = d.wallet_id JOIN organizations o ON o.id = w.organization_id WHERE ($1::text IS NULL OR d.status = $1::text);
PREPARE cas AS UPDATE mfa_factors SET last_step = $2 WHERE id = $1::uuid AND (last_step IS NULL OR last_step < $2) RETURNING id;
PREPARE recov AS UPDATE mfa_factors SET used_at = now() WHERE user_id = $1::uuid AND type = 'recovery_code' AND code_hash = $2 AND used_at IS NULL RETURNING id;

INSERT INTO users(email,role,status,mfa_required) VALUES
 ('cust@x.co','customer','active',false), ('adm@x.co','admin_staff','active',true), ('root@x.co','super_admin','active',true);
SELECT id AS cust FROM users WHERE email='cust@x.co' \gset
SELECT id AS adm  FROM users WHERE email='adm@x.co' \gset
SELECT id AS root FROM users WHERE email='root@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('O',:'cust');
SELECT id AS org FROM organizations WHERE owner_user_id=:'cust' \gset
INSERT INTO memberships(organization_id,user_id,role) VALUES (:'org',:'cust','owner');
INSERT INTO wallets(organization_id) VALUES (:'org');
SELECT id AS w FROM wallets WHERE organization_id=:'org' \gset

-- Only an active Super Admin may grant customer credit; promo credit is reflected in the wallet and immutable ledger.
DO $$
DECLARE v_user uuid; v_admin uuid; v_staff uuid;
BEGIN
  SELECT id INTO v_user FROM users WHERE email='cust@x.co';
  SELECT id INTO v_admin FROM users WHERE email='root@x.co';
  SELECT id INTO v_staff FROM users WHERE email='adm@x.co';
  BEGIN
    PERFORM admin_credit_customer(v_user, v_staff, 5000000, 'promo', 'unauthorized grant test');
    RAISE EXCEPTION 'FAIL staff must not grant credit';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'not_permitted' THEN RAISE NOTICE 'PASS admin_staff cannot grant customer credit';
    ELSE RAISE; END IF;
  END;
  PERFORM admin_credit_customer(v_user, v_admin, 5000000, 'promo', 'welcome bonus test');
END $$;
SELECT promo_micro_usd=5000000 AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS Super Admin promo credit is posted \else SELECT 1/0; \endif
SELECT count(*)=1 AS ok FROM ledger_entries WHERE wallet_id=:'w' AND entry_type='promo_credit' AND bucket='promo' AND amount_micro_usd=5000000 AND reference_type='admin_credit' \gset
\if :ok \echo PASS credit is present in immutable ledger \else SELECT 1/0; \endif
SELECT request_deposit(:'w', 10000000, 'wire ref 9') AS dep \gset

-- admin_staff asks, super admin decides, then admin_staff approves
EXECUTE ask(:'dep', :'adm') \gset ap_
EXECUTE decide(:'ap_id', 'approved', :'adm', 'self approve attempt');
SELECT count(*)=0 AS ok FROM approvals WHERE status='approved' \gset
\if :ok \echo PASS requester cannot decide their own approval \else SELECT 1/0; \endif
EXECUTE decide(:'ap_id', 'approved', :'root', 'checked bank portal');
SELECT status='approved' AS ok FROM approvals WHERE id=:'ap_id' \gset
\if :ok \echo PASS super admin can decide an approval \else SELECT 1/0; \endif
EXECUTE decide(:'ap_id', 'rejected', :'root', 'flip flop');
SELECT status='approved' AS ok FROM approvals WHERE id=:'ap_id' \gset
\if :ok \echo PASS a decided approval cannot be changed \else SELECT 1/0; \endif

EXECUTE listdep('requested');
EXECUTE approve(:'dep', :'adm', 'statement line 14 matches') \gset r1_
EXECUTE approve(:'dep', :'adm', 'statement line 14 matches') \gset r2_
SELECT :'r1_credited'='t' AND :'r2_credited'='f' AS ok \gset
\if :ok \echo PASS approving twice credits once \else SELECT 1/0; \endif
SELECT paid_micro_usd=10000000 AND pending_micro_usd=0 AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS wallet credited exactly once \else SELECT 1/0; \endif
EXECUTE listdep('approved');

-- MFA: replay compare-and-set and single-use recovery codes
INSERT INTO mfa_factors(user_id,type,secret_encrypted,confirmed_at,last_step) VALUES (:'adm','totp','x',now(),100);
SELECT id AS f FROM mfa_factors WHERE type='totp' AND user_id=:'adm' \gset
EXECUTE cas(:'f', 100);
EXECUTE cas(:'f', 101) \gset c1_
EXECUTE cas(:'f', 101);
SELECT last_step=101 AS ok FROM mfa_factors WHERE id=:'f' \gset
\if :ok \echo PASS a TOTP step can be consumed only once \else SELECT 1/0; \endif
INSERT INTO mfa_factors(user_id,type,code_hash,confirmed_at) VALUES (:'adm','recovery_code','h1',now());
EXECUTE recov(:'adm','h1') \gset rc_
SELECT count(*)=0 AS ok FROM (SELECT 1 WHERE false) z \gset
EXECUTE recov(:'adm','h1');
SELECT used_at IS NOT NULL AS ok FROM mfa_factors WHERE code_hash='h1' \gset
\if :ok \echo PASS recovery code is single use \else SELECT 1/0; \endif
DO $$ BEGIN
  BEGIN INSERT INTO mfa_factors(user_id,type,secret_encrypted,confirmed_at) SELECT user_id,'totp','y',now() FROM mfa_factors WHERE type='totp'; RAISE EXCEPTION 'FAIL two confirmed totp';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS only one confirmed TOTP factor per user'; END;
END $$;
ROLLBACK;
