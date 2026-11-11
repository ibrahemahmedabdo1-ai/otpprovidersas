-- Ledger/constraint tests. Run inside a fresh migrated database. Any failure raises and exits non-zero.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE results(name text, ok boolean);
DO $$
DECLARE u uuid; o uuid; w uuid; p uuid; prov uuid; r uuid; d uuid; ok boolean; n bigint; wal wallets%ROWTYPE;
BEGIN
  INSERT INTO users(email,role,status,mfa_required) VALUES ('cust@test.dev','customer','active',false) RETURNING id INTO u;
  INSERT INTO organizations(name,owner_user_id) VALUES ('T',u) RETURNING id INTO o;
  INSERT INTO wallets(organization_id) VALUES (o) RETURNING id INTO w;
  INSERT INTO projects(organization_id,name) VALUES (o,'P') RETURNING id INTO p;
  INSERT INTO providers(key,channel,kind) VALUES ('resend','email','RESEND') RETURNING id INTO prov;
  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (p,w,'live','email','h','e','c',5,now()+interval '5 min','corr') RETURNING id INTO r;
  INSERT INTO otp_deliveries(otp_request_id,provider_id) VALUES (r,prov) RETURNING id INTO d;

  -- deposit credit
  PERFORM post_ledger_entry(w,'deposit','paid',10000000,'dep:1');
  SELECT * INTO wal FROM wallets WHERE id=w;
  IF wal.paid_micro_usd <> 10000000 THEN RAISE EXCEPTION 'FAIL deposit credit'; END IF;
  RAISE NOTICE 'PASS deposit credit';

  -- idempotent posting
  IF post_ledger_entry(w,'deposit','paid',10000000,'dep:1') THEN RAISE EXCEPTION 'FAIL duplicate key accepted'; END IF;
  SELECT paid_micro_usd INTO n FROM wallets WHERE id=w;
  IF n <> 10000000 THEN RAISE EXCEPTION 'FAIL duplicate changed balance'; END IF;
  RAISE NOTICE 'PASS idempotent posting';

  -- reserve, then charge only after delivered
  PERFORM reserve_for_delivery(w,d,50000);
  BEGIN PERFORM charge_confirmed_delivery(w,d,50000); RAISE EXCEPTION 'FAIL charged before delivery';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS no charge before confirmed delivery';

  -- unknown outcome: reservation cannot be released, nothing charged
  UPDATE otp_deliveries SET status='unknown' WHERE id=d;
  BEGIN PERFORM release_failed_delivery(w,d,50000); RAISE EXCEPTION 'FAIL released on unknown';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  SELECT * INTO wal FROM wallets WHERE id=w;
  IF wal.reserved_micro_usd <> 50000 OR wal.paid_micro_usd <> 10000000 THEN RAISE EXCEPTION 'FAIL unknown changed balances'; END IF;
  RAISE NOTICE 'PASS unknown outcome keeps reservation pending';

  -- confirmed delivery: charge exactly once
  UPDATE otp_deliveries SET status='delivered' WHERE id=d;
  IF NOT charge_confirmed_delivery(w,d,50000) THEN RAISE EXCEPTION 'FAIL first charge'; END IF;
  IF charge_confirmed_delivery(w,d,50000) THEN RAISE EXCEPTION 'FAIL double charge'; END IF;
  SELECT * INTO wal FROM wallets WHERE id=w;
  IF wal.paid_micro_usd <> 9950000 OR wal.reserved_micro_usd <> 0 THEN RAISE EXCEPTION 'FAIL charge math %/%', wal.paid_micro_usd, wal.reserved_micro_usd; END IF;
  RAISE NOTICE 'PASS charge once, duplicate billing prevented';

  -- overdraft rejected
  BEGIN PERFORM post_ledger_entry(w,'adjustment','paid',-99000000,'adj:over'); RAISE EXCEPTION 'FAIL overdraft allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS overdraft rejected';

  -- failed delivery releases reservation
  INSERT INTO otp_deliveries(otp_request_id,provider_id,attempt_no) VALUES (r,prov,2) RETURNING id INTO d;
  PERFORM reserve_for_delivery(w,d,50000);
  UPDATE otp_deliveries SET status='failed' WHERE id=d;
  PERFORM release_failed_delivery(w,d,50000);
  SELECT reserved_micro_usd INTO n FROM wallets WHERE id=w;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL release'; END IF;
  RAISE NOTICE 'PASS failed delivery releases reservation';

  -- ledger immutability
  BEGIN UPDATE ledger_entries SET amount_micro_usd=1; RAISE EXCEPTION 'FAIL ledger update allowed';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  BEGIN DELETE FROM ledger_entries; RAISE EXCEPTION 'FAIL ledger delete allowed';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  RAISE NOTICE 'PASS ledger immutable (update/delete blocked)';

  -- deposit approval requires verified receipt
  BEGIN
    INSERT INTO deposits(wallet_id,amount_micro_usd,status,receipt_verified,decided_by,decided_at) VALUES (w,1000000,'approved',false,u,now());
    RAISE EXCEPTION 'FAIL approved without receipt';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS deposit approval requires verified receipt';

  -- billed only when delivered
  BEGIN UPDATE otp_deliveries SET billed=true WHERE status='failed'; RAISE EXCEPTION 'FAIL billed failed delivery';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS cannot bill undelivered message';

  -- staff must require MFA
  BEGIN INSERT INTO users(email,role,mfa_required) VALUES ('s@test.dev','support_staff',false); RAISE EXCEPTION 'FAIL staff without MFA';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS staff require MFA';

  -- price cannot be active without approver
  BEGIN INSERT INTO prices(channel,unit_price_micro_usd,version,status) VALUES ('email',1000,1,'active'); RAISE EXCEPTION 'FAIL unapproved price active';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS price activation needs approver';

  -- unverified office cannot be published
  BEGIN INSERT INTO offices(city,country,published) VALUES ('Jakarta','ID',true); RAISE EXCEPTION 'FAIL unverified office published';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS unverified office cannot be published';

  -- audit log immutable
  INSERT INTO audit_events(action) VALUES ('t');
  BEGIN DELETE FROM audit_events; RAISE EXCEPTION 'FAIL audit delete allowed';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  RAISE NOTICE 'PASS audit log immutable';
END $$;
ROLLBACK;
