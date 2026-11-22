-- Coupons that add promo credit to a wallet. The Super Admin chooses amount, expiry, total limit and uses per customer
-- organization. Redemption is one atomic, idempotent ledger posting; nothing is credited unless every rule passes.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_per_org int NOT NULL DEFAULT 1 CHECK (max_per_org >= 1);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_idx ON coupon_redemptions (coupon_id, organization_id);

CREATE OR REPLACE FUNCTION redeem_coupon(p_user uuid, p_code text) RETURNS bigint AS $$
DECLARE
  v_org uuid; v_org_status text; v_wallet uuid; v_role text; v_ustatus text;
  c coupons%ROWTYPE; p promotions%ROWTYPE; v_used int; v_id uuid;
BEGIN
  SELECT role, status INTO v_role, v_ustatus FROM users WHERE id = p_user;
  IF v_ustatus IS DISTINCT FROM 'active' OR v_role NOT IN ('customer','super_admin') THEN RAISE EXCEPTION 'not_permitted'; END IF;
  SELECT o.id, o.status, w.id INTO v_org, v_org_status, v_wallet
  FROM memberships m JOIN organizations o ON o.id = m.organization_id JOIN wallets w ON w.organization_id = o.id
  WHERE m.user_id = p_user ORDER BY o.created_at ASC LIMIT 1 FOR UPDATE OF w;
  IF v_wallet IS NULL OR v_org_status <> 'active' THEN RAISE EXCEPTION 'not_permitted'; END IF;

  SELECT * INTO c FROM coupons WHERE code = btrim(p_code)::citext FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon_invalid'; END IF;
  SELECT * INTO p FROM promotions WHERE id = c.promotion_id;
  IF NOT p.active OR p.kind <> 'extra_credit' OR p.value <= 0
     OR (p.starts_at IS NOT NULL AND p.starts_at > now()) OR (p.ends_at IS NOT NULL AND p.ends_at <= now())
     OR (c.expires_at IS NOT NULL AND c.expires_at <= now()) THEN RAISE EXCEPTION 'coupon_invalid'; END IF;
  IF c.max_redemptions IS NOT NULL AND c.redeemed_count >= c.max_redemptions THEN RAISE EXCEPTION 'coupon_exhausted'; END IF;
  SELECT count(*) INTO v_used FROM coupon_redemptions WHERE coupon_id = c.id AND organization_id = v_org;
  IF v_used >= c.max_per_org THEN RAISE EXCEPTION 'coupon_already_used'; END IF;

  v_id := gen_random_uuid();
  INSERT INTO coupon_redemptions(id, coupon_id, organization_id, user_id, amount_micro_usd) VALUES (v_id, c.id, v_org, p_user, p.value);
  UPDATE coupons SET redeemed_count = redeemed_count + 1 WHERE id = c.id;
  PERFORM post_ledger_entry(v_wallet, 'promo_credit', 'promo', p.value, 'coupon:' || v_id::text, 'coupon', c.id::text, p_user, 'Coupon ' || c.code::text);
  RETURN p.value;
END;
$$ LANGUAGE plpgsql;
