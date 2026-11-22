\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
INSERT INTO users(email,role,status,mfa_required) VALUES ('c1@x.co','customer','active',false),('c2@x.co','customer','active',false),('sup@x.co','support_staff','active',true);
SELECT id AS c1 FROM users WHERE email='c1@x.co' \gset
SELECT id AS c2 FROM users WHERE email='c2@x.co' \gset
SELECT id AS sup FROM users WHERE email='sup@x.co' \gset
INSERT INTO organizations(name,owner_user_id) VALUES ('O1',:'c1'),('O2',:'c2');
INSERT INTO memberships(organization_id,user_id,role) SELECT id, owner_user_id, 'owner' FROM organizations;
INSERT INTO wallets(organization_id) SELECT id FROM organizations ON CONFLICT DO NOTHING;
INSERT INTO promotions(name,kind,value,active) VALUES ('Welcome','extra_credit',5000000,true),('Old','extra_credit',1000000,false),('Pct','percent_discount',10,true);
INSERT INTO coupons(code,promotion_id,max_redemptions,max_per_org) SELECT 'WELCOME5', id, 2, 1 FROM promotions WHERE name='Welcome';
INSERT INTO coupons(code,promotion_id) SELECT 'OLD', id FROM promotions WHERE name='Old';
INSERT INTO coupons(code,promotion_id) SELECT 'PCT', id FROM promotions WHERE name='Pct';
INSERT INTO coupons(code,promotion_id,expires_at) SELECT 'EXPIRED', id, now() - interval '1 day' FROM promotions WHERE name='Welcome';

SELECT redeem_coupon(:'c1', ' welcome5 ') AS got \gset
SELECT (:got = 5000000 AND promo_micro_usd = 5000000 AND paid_micro_usd = 0) AS ok FROM wallets WHERE organization_id=(SELECT id FROM organizations WHERE name='O1') \gset
\if :ok \echo PASS redeeming adds the promo credit (case-insensitive code) and never touches paid balance \else SELECT 1/0; \endif

DO $$ DECLARE u1 uuid; u2 uuid; s uuid; BEGIN
  SELECT id INTO u1 FROM users WHERE email='c1@x.co'; SELECT id INTO u2 FROM users WHERE email='c2@x.co'; SELECT id INTO s FROM users WHERE email='sup@x.co';
  BEGIN PERFORM redeem_coupon(u1,'WELCOME5'); RAISE EXCEPTION 'FAIL second use by same org';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_already_used' THEN RAISE; END IF; RAISE NOTICE 'PASS per-organization limit enforced'; END;
  BEGIN PERFORM redeem_coupon(u1,'OLD'); RAISE EXCEPTION 'FAIL inactive promotion';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_invalid' THEN RAISE; END IF; RAISE NOTICE 'PASS inactive promotion refused'; END;
  BEGIN PERFORM redeem_coupon(u1,'PCT'); RAISE EXCEPTION 'FAIL non-credit kind';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_invalid' THEN RAISE; END IF; RAISE NOTICE 'PASS only credit coupons are redeemable'; END;
  BEGIN PERFORM redeem_coupon(u1,'EXPIRED'); RAISE EXCEPTION 'FAIL expired';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_invalid' THEN RAISE; END IF; RAISE NOTICE 'PASS expired coupon refused'; END;
  BEGIN PERFORM redeem_coupon(u1,'NOPE'); RAISE EXCEPTION 'FAIL unknown';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_invalid' THEN RAISE; END IF; RAISE NOTICE 'PASS unknown code refused'; END;
  BEGIN PERFORM redeem_coupon(s,'WELCOME5'); RAISE EXCEPTION 'FAIL support staff redeemed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_permitted' THEN RAISE; END IF; RAISE NOTICE 'PASS support staff cannot redeem'; END;
  PERFORM redeem_coupon(u2,'WELCOME5');
  UPDATE coupons SET max_per_org = 3 WHERE code = 'WELCOME5';
  BEGIN PERFORM redeem_coupon(u1,'WELCOME5'); RAISE EXCEPTION 'FAIL total limit';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'coupon_exhausted' THEN RAISE; END IF; RAISE NOTICE 'PASS total redemption limit enforced'; END;
END $$;
SELECT (SELECT count(*) FROM ledger_entries WHERE entry_type='promo_credit') = 2 AS ok \gset
\if :ok \echo PASS exactly one ledger entry per successful redemption, none for refused ones \else SELECT 1/0; \endif
ROLLBACK;
