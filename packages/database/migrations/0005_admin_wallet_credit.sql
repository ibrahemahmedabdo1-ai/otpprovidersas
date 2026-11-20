-- Super Admin-only manual customer wallet credits. Every grant is immutable and idempotently posted through the ledger.
CREATE OR REPLACE FUNCTION admin_credit_customer(
  p_user uuid, p_admin uuid, p_amount bigint, p_bucket text, p_reason text
) RETURNS boolean AS $$
DECLARE v_role text; v_status text; v_wallet uuid; v_org_status text; v_key text;
BEGIN
  SELECT role, status INTO v_role, v_status FROM users WHERE id = p_admin;
  IF v_role IS DISTINCT FROM 'super_admin' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'not_permitted';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000000000 OR p_bucket NOT IN ('paid','promo')
     OR p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'invalid_credit';
  END IF;
  SELECT w.id, o.status INTO v_wallet, v_org_status
  FROM users u
  JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
  JOIN organizations o ON o.id = m.organization_id
  JOIN wallets w ON w.organization_id = o.id
  WHERE u.id = p_user AND u.role = 'customer' AND u.status = 'active'
  ORDER BY o.created_at ASC LIMIT 1
  FOR UPDATE OF w;
  IF v_wallet IS NULL THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  IF v_org_status <> 'active' THEN RAISE EXCEPTION 'customer_not_active'; END IF;
  v_key := 'admin-credit:' || gen_random_uuid()::text;
  RETURN post_ledger_entry(
    v_wallet,
    CASE WHEN p_bucket = 'promo' THEN 'promo_credit' ELSE 'adjustment' END,
    p_bucket, p_amount, v_key, 'admin_credit', p_user::text, p_admin,
    left(btrim(p_reason), 500)
  );
END;
$$ LANGUAGE plpgsql;
