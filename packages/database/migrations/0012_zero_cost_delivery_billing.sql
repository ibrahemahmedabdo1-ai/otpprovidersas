-- Make zero-priced OTP deliveries billable as a free settlement without writing
-- forbidden zero-value ledger entries. Also bind every delivery operation to the
-- wallet that owns its OTP request, so a caller cannot reserve/charge another tenant.
CREATE OR REPLACE FUNCTION reserve_for_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_delivery_amount' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM otp_deliveries d
  JOIN otp_requests r ON r.id = d.otp_request_id
  WHERE d.id = p_delivery AND r.wallet_id = p_wallet
  FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_wallet_mismatch' USING ERRCODE = '23514';
  END IF;

  -- A zero price is a legitimate free service. There is no reservation to post.
  IF p_amount = 0 THEN
    RETURN true;
  END IF;

  RETURN post_ledger_entry(
    p_wallet, 'reserve', 'reserved', p_amount,
    'reserve:' || p_delivery, 'otp_delivery', p_delivery::text
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION charge_confirmed_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
DECLARE
  d otp_deliveries%ROWTYPE;
  first boolean;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_delivery_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO d FROM otp_deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery % not found', p_delivery;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM otp_requests r
    WHERE r.id = d.otp_request_id AND r.wallet_id = p_wallet
  ) THEN
    RAISE EXCEPTION 'delivery_wallet_mismatch' USING ERRCODE = '23514';
  END IF;

  IF d.status <> 'delivered' THEN
    RAISE EXCEPTION 'cannot charge delivery % in status %', p_delivery, d.status;
  END IF;
  IF d.billed THEN
    RETURN false;
  END IF;

  -- Mark a free delivery as settled, but never create a zero-value ledger row.
  IF p_amount = 0 THEN
    UPDATE otp_deliveries
    SET billed = true,
        evidence = COALESCE(evidence, '{}'::jsonb)
          || jsonb_build_object(
            'billing',
            jsonb_build_object(
              'kind', 'free',
              'amount_micro_usd', 0,
              'settled_at', now()
            )
          )
    WHERE id = p_delivery;
    RETURN true;
  END IF;

  first := post_ledger_entry(
    p_wallet, 'charge', 'paid', -p_amount,
    'charge:' || p_delivery, 'otp_delivery', p_delivery::text
  );
  IF NOT first THEN
    RETURN false;
  END IF;

  PERFORM post_ledger_entry(
    p_wallet, 'release', 'reserved', -p_amount,
    'release:' || p_delivery, 'otp_delivery', p_delivery::text
  );
  UPDATE otp_deliveries SET billed = true WHERE id = p_delivery;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_failed_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
DECLARE
  s text;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_delivery_amount' USING ERRCODE = '22023';
  END IF;

  SELECT d.status INTO s
  FROM otp_deliveries d
  JOIN otp_requests r ON r.id = d.otp_request_id
  WHERE d.id = p_delivery AND r.wallet_id = p_wallet
  FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_wallet_mismatch' USING ERRCODE = '23514';
  END IF;
  IF s IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'cannot release reservation: delivery % status is %', p_delivery, s;
  END IF;

  -- Free deliveries never reserved funds, so there is nothing to release.
  IF p_amount = 0 THEN
    RETURN true;
  END IF;

  RETURN post_ledger_entry(
    p_wallet, 'release', 'reserved', -p_amount,
    'release:' || p_delivery, 'otp_delivery', p_delivery::text
  );
END;
$$ LANGUAGE plpgsql;
