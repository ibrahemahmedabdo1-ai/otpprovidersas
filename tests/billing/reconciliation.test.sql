-- wallet_reconciliation(): balanced books report nothing; a tampered wallet is reported. Rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE u uuid; o uuid; w uuid; p uuid; prov uuid; r uuid; d uuid; n int;
BEGIN
  INSERT INTO users(email,role,status,mfa_required) VALUES ('recon@test.dev','customer','active',false) RETURNING id INTO u;
  INSERT INTO organizations(name,owner_user_id) VALUES ('R',u) RETURNING id INTO o;
  INSERT INTO wallets(organization_id) VALUES (o) RETURNING id INTO w;
  INSERT INTO projects(organization_id,name) VALUES (o,'P') RETURNING id INTO p;
  INSERT INTO providers(key,channel,kind) VALUES ('resend-recon','email','RESEND') RETURNING id INTO prov;
  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (p,w,'live','email','h','e','c',5,now()+interval '5 min','corr') RETURNING id INTO r;
  INSERT INTO otp_deliveries(otp_request_id,provider_id) VALUES (r,prov) RETURNING id INTO d;

  PERFORM post_ledger_entry(w,'deposit','paid',10000000,'recon:dep');
  PERFORM post_ledger_entry(w,'promo_credit','promo',2000000,'recon:promo');
  PERFORM reserve_for_delivery(w,d,50000);
  SELECT count(*) INTO n FROM wallet_reconciliation() WHERE wallet_id = w;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL reserved state should reconcile (% rows)', n; END IF;
  RAISE NOTICE 'PASS reserved state reconciles';

  UPDATE otp_deliveries SET status='delivered' WHERE id=d;
  PERFORM charge_confirmed_delivery(w,d,50000);
  SELECT count(*) INTO n FROM wallet_reconciliation() WHERE wallet_id = w;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL after charge should reconcile (% rows)', n; END IF;
  RAISE NOTICE 'PASS charged state reconciles';

  UPDATE wallets SET paid_micro_usd = paid_micro_usd + 1 WHERE id = w;
  SELECT count(*) INTO n FROM wallet_reconciliation() WHERE wallet_id = w AND bucket = 'paid';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL tampered wallet not reported'; END IF;
  RAISE NOTICE 'PASS tampered wallet is reported';
END $$;
ROLLBACK;
