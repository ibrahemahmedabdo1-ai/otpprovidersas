\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_wallet_id uuid;
  v_project_id uuid;
  v_provider_id uuid;
  v_request_id uuid;
  v_delivery_id uuid;
  v_device_id uuid := gen_random_uuid();
  v_message_id text := 'MSG-OUT-OF-ORDER-001';
  v_count bigint;
BEGIN
  INSERT INTO users(email,role,status)
    VALUES ('wa-receipt-test@x.co','customer','active') RETURNING id INTO v_user_id;
  INSERT INTO organizations(name,owner_user_id)
    VALUES ('WhatsApp Receipt Test',v_user_id) RETURNING id INTO v_org_id;
  INSERT INTO wallets(organization_id) VALUES (v_org_id) RETURNING id INTO v_wallet_id;
  INSERT INTO projects(organization_id,name)
    VALUES (v_org_id,'WhatsApp Receipt Test Project') RETURNING id INTO v_project_id;
  INSERT INTO providers(key,channel,kind)
    VALUES ('wa_receipt_test','whatsapp','PERSONAL_LINKED_DEVICE') RETURNING id INTO v_provider_id;
  INSERT INTO otp_requests(
    project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,
    max_attempts,expires_at,correlation_id
  ) VALUES (
    v_project_id,v_wallet_id,'live','whatsapp','recipient-hash','encrypted-recipient','code-hash',
    5,now()+interval '5 minutes','wa-receipt-correlation-test'
  ) RETURNING id INTO v_request_id;
  INSERT INTO otp_deliveries(otp_request_id,provider_id)
    VALUES (v_request_id,v_provider_id) RETURNING id INTO v_delivery_id;

  -- Simulate delivered arriving before the accepted event can attach the delivery ID.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (v_device_id,v_message_id,'delivered','recipient-hash',NULL);

  -- The accepted event later supplies the delivery ID and links the earlier receipt.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (v_device_id,v_message_id,'accepted','recipient-hash',v_delivery_id)
    ON CONFLICT(device_id,message_id,status) DO UPDATE
      SET otp_delivery_id=COALESCE(wa_message_receipts.otp_delivery_id,EXCLUDED.otp_delivery_id);
  UPDATE wa_message_receipts AS wr
    SET otp_delivery_id=v_delivery_id
    WHERE wr.device_id=v_device_id
      AND wr.message_id=v_message_id
      AND wr.otp_delivery_id IS NULL;

  SELECT count(*) INTO v_count
    FROM wa_message_receipts AS wr
    WHERE wr.device_id=v_device_id AND wr.message_id=v_message_id
      AND wr.otp_delivery_id=v_delivery_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL out-of-order receipt linking: expected 2 linked rows, got %',v_count;
  END IF;

  -- Duplicate delivered events are idempotent.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (v_device_id,v_message_id,'delivered','recipient-hash',v_delivery_id)
    ON CONFLICT(device_id,message_id,status) DO UPDATE
      SET otp_delivery_id=COALESCE(wa_message_receipts.otp_delivery_id,EXCLUDED.otp_delivery_id);
  SELECT count(*) INTO v_count
    FROM wa_message_receipts AS wr
    WHERE wr.device_id=v_device_id AND wr.message_id=v_message_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL duplicate receipt created another row: %',v_count;
  END IF;

  -- Pending, server_ack, read and played are recorded but only delivered is billable.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES
      (v_device_id,v_message_id,'pending','recipient-hash',v_delivery_id),
      (v_device_id,v_message_id,'server_ack','recipient-hash',v_delivery_id),
      (v_device_id,v_message_id,'read','recipient-hash',v_delivery_id),
      (v_device_id,v_message_id,'played','recipient-hash',v_delivery_id);

  SELECT count(*) INTO v_count
    FROM wa_message_receipts AS wr
    WHERE wr.device_id=v_device_id AND wr.message_id=v_message_id
      AND wr.otp_delivery_id=v_delivery_id;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'FAIL not all receipt milestones linked: %',v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM wa_message_receipts AS wr
    WHERE wr.device_id=v_device_id AND wr.message_id=v_message_id
      AND wr.status='delivered';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL expected exactly one billable delivered receipt, got %',v_count;
  END IF;

  RAISE NOTICE 'PASS out-of-order receipt correlation, duplicate idempotency and non-billable statuses';
END $$;
ROLLBACK;
