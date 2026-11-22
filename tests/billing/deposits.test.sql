\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
-- Same statements as wallet.service.ts, untyped PREPAREs like node-pg
PREPARE req_dep AS SELECT request_deposit($1::uuid, $2::bigint, $3::text) AS id;
PREPARE wal AS SELECT paid_micro_usd, promo_micro_usd, reserved_micro_usd, pending_micro_usd FROM wallets WHERE organization_id = $1;
PREPARE txs AS SELECT id, entry_type, bucket, amount_micro_usd, memo, created_at FROM ledger_entries WHERE wallet_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint) ORDER BY id DESC LIMIT $3::int;

INSERT INTO users(email,role,status,mfa_required) VALUES
 ('cust@x.co','customer','active',false), ('sup@x.co','support_staff','active',true),
 ('adm@x.co','admin_staff','active',true), ('root@x.co','super_admin','active',true);
SELECT id AS cust FROM users WHERE email='cust@x.co' \gset
SELECT id AS sup  FROM users WHERE email='sup@x.co' \gset
SELECT id AS adm  FROM users WHERE email='adm@x.co' \gset
SELECT id AS root FROM users WHERE email='root@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('O',:'cust');
SELECT id AS org FROM organizations WHERE name='O' \gset
INSERT INTO wallets(organization_id) VALUES (:'org');
SELECT id AS w FROM wallets WHERE organization_id=:'org' \gset

EXECUTE req_dep(:'w', 25000000, 'bank transfer ref 123') \gset d1_
-- Link the deposit to its support conversation. System messages must not impersonate a user.
INSERT INTO tickets(organization_id,created_by,subject,priority) VALUES (:'org',:'cust','Top-up test','high') RETURNING id AS ticket_id \gset
INSERT INTO conversations(ticket_id,organization_id) VALUES (:'ticket_id',:'org') RETURNING id AS conversation_id \gset
UPDATE deposits SET ticket_id=:'ticket_id'::uuid WHERE id=:'d1_id'::uuid;
INSERT INTO messages(conversation_id,author_id,reply_identity,internal,body) VALUES (:'conversation_id',NULL,'system',false,'Top-up request received');

EXECUTE wal(:'org');
SELECT pending_micro_usd=25000000 AND paid_micro_usd=0 AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS deposit request records pending only, no credit \else SELECT 1/0; \endif

-- who may approve
DO $$ DECLARE d uuid; s uuid; c uuid; a uuid; BEGIN
  SELECT id INTO d FROM deposits LIMIT 1;
  SELECT id INTO s FROM users WHERE email='sup@x.co'; SELECT id INTO c FROM users WHERE email='cust@x.co'; SELECT id INTO a FROM users WHERE email='adm@x.co';
  BEGIN PERFORM approve_deposit(d, s, 'funds seen on bank statement'); RAISE EXCEPTION 'FAIL support approved';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_permitted' THEN RAISE; END IF; RAISE NOTICE 'PASS support staff cannot approve a deposit'; END;
  BEGIN PERFORM approve_deposit(d, c, 'funds seen on bank statement'); RAISE EXCEPTION 'FAIL customer approved';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_permitted' THEN RAISE; END IF; RAISE NOTICE 'PASS a customer cannot approve their own deposit'; END;
  BEGIN PERFORM approve_deposit(d, a, 'funds seen on bank statement'); RAISE EXCEPTION 'FAIL admin staff approved without super admin approval';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'super_admin_approval_required' THEN RAISE; END IF; RAISE NOTICE 'PASS admin staff need an approved Super Admin approval'; END;
END $$;
SELECT paid_micro_usd=0 AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS refused approvals changed nothing \else SELECT 1/0; \endif

-- a screenshot is not proof: a receipt note is mandatory
DO $$ DECLARE d uuid; r uuid; BEGIN
  SELECT id INTO d FROM deposits LIMIT 1; SELECT id INTO r FROM users WHERE email='root@x.co';
  BEGIN PERFORM approve_deposit(d, r, ''); RAISE EXCEPTION 'FAIL approved without receipt verification';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'receipt_verification_required' THEN RAISE; END IF; RAISE NOTICE 'PASS receipt verification note is mandatory'; END;
END $$;

-- admin staff WITH an approved super admin approval (decided by someone else)
INSERT INTO approvals(action, subject_type, subject_id, requested_by, status, decided_by, decided_at) VALUES ('wallet.deposit.approve','deposit',:'d1_id',:'adm','approved',:'root',now());
SELECT approve_deposit(:'d1_id'::uuid, :'adm'::uuid, 'Bank statement line 42 shows 25.00 USD received') AS credited \gset
\if :credited \echo PASS admin staff can approve with a Super Admin approval \else SELECT 1/0; \endif
SELECT (paid_micro_usd=25000000 AND pending_micro_usd=0) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS wallet credited and pending cleared \else SELECT 1/0; \endif
SELECT approve_deposit(:'d1_id'::uuid, :'root'::uuid, 'second click on approve button') AS again \gset
SELECT (:'again' = 'f') AS ok \gset
\if :ok \echo PASS approving twice credits once \else SELECT 1/0; \endif
SELECT (paid_micro_usd=25000000) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS balance unchanged after repeated approval \else SELECT 1/0; \endif
SELECT (count(*)=1) AS ok FROM ledger_entries WHERE idempotency_key = 'deposit:' || :'d1_id' AND amount_micro_usd=25000000 AND actor_id=:'adm' \gset
SELECT (count(*)=2) AS ok FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.ticket_id=:'ticket_id'::uuid AND m.author_id IS NULL AND m.reply_identity='system' AND m.internal=false \gset
\if :ok \echo PASS system greeting and approval notice are visible without impersonation \else SELECT 1/0; \endif
SELECT (count(*)=1) AS ok FROM notifications WHERE user_id=:'cust'::uuid AND kind='deposit_approved' \gset
\if :ok \echo PASS approval creates a customer notification \else SELECT 1/0; \endif

\if :ok \echo PASS exactly one immutable ledger entry, attributed to the approving admin \else SELECT 1/0; \endif

-- reject path and super admin direct approval
EXECUTE req_dep(:'w', 5000000, 'second') \gset d2_
EXECUTE req_dep(:'w', 7000000, 'third') \gset d3_
SELECT reject_deposit(:'d2_id'::uuid, :'adm'::uuid, 'no matching transfer found') AS rej \gset
\if :rej \echo PASS rejection recorded \else SELECT 1/0; \endif
SELECT (pending_micro_usd=7000000 AND paid_micro_usd=25000000) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS rejection releases pending without crediting \else SELECT 1/0; \endif
SELECT approve_deposit(:'d3_id'::uuid, :'root'::uuid, 'Verified in bank portal by owner') AS c3 \gset
SELECT (paid_micro_usd=32000000 AND pending_micro_usd=0) AS ok FROM wallets WHERE id=:'w' \gset
\if :ok \echo PASS super admin can approve directly \else SELECT 1/0; \endif
DO $$ DECLARE d uuid; r uuid; BEGIN
  SELECT id INTO d FROM deposits WHERE status='rejected' LIMIT 1; SELECT id INTO r FROM users WHERE email='root@x.co';
  BEGIN PERFORM approve_deposit(d, r, 'trying to approve a rejected deposit'); RAISE EXCEPTION 'FAIL approved a rejected deposit';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'deposit_not_open' THEN RAISE; END IF; RAISE NOTICE 'PASS a rejected deposit cannot be approved later'; END;
END $$;

-- limit on open requests
DO $$ DECLARE w uuid; i int; BEGIN SELECT id INTO w FROM wallets LIMIT 1;
  FOR i IN 1..5 LOOP PERFORM request_deposit(w, 1000000, 'x'); END LOOP;
  BEGIN PERFORM request_deposit(w, 1000000, 'x'); RAISE EXCEPTION 'FAIL unlimited open deposits';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'too_many_open_deposits' THEN RAISE; END IF; RAISE NOTICE 'PASS at most 5 open deposit requests per wallet'; END;
END $$;

-- transaction history pagination statement
EXECUTE txs(:'w', NULL, 10);
EXECUTE txs(:'w', 999999, 10);
\echo PASS transaction history statement accepted with inferred types
ROLLBACK;
