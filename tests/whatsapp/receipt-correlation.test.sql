\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  u uuid;
  o uuid;
  w uuid;
  p uuid;
  prov uuid;
  req uuid;
  delivery uuid;
  device uuid := gen_random_uuid();
  message_id text := 'MSG-OUT-OF-ORDER-001';
  linked_count bigint;
  receipt_count bigint;
BEGIN
  INSERT INTO users(email,role,status)
    VALUES ('wa-receipt-test@x.co','customer','active') RETURNING id INTO u;
  INSERT INTO organizations(name,owner_user_id)
    VALUES ('WhatsApp Receipt Test',u) RETURNING id INTO o;
  INSERT INTO wallets(organization_id) VALUES (o) RETURNING id INTO w;
  INSERT INTO projects(organization_id,name) VALUES (o,'WhatsApp Receipt Test Project') RETURNING id INTO p;
  INSERT INTO providers(key,channel,kind)
    VALUES ('wa_receipt_test','whatsapp','PERSONAL_LINKED_DEVICE') RETURNING id INTO prov;
  INSERT INTO otp_requests(
    project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,
    max_attempts,expires_at,correlation_id
  ) VALUES (
    p,w,'live','whatsapp','recipient-hash','encrypted-recipient','code-hash',
    5,now()+interval '5 minutes','wa-receipt-correlation-test'
  ) RETURNING id INTO req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id)
    VALUES (req,prov) RETURNING id INTO delivery;

  -- Simulate a delivered event arriving before the accepted event can attach its delivery ID.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (device,message_id,'delivered','recipient-hash',NULL);

  -- The later accepted event carries the delivery ID; this is the gateway's linking behavior.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (device,message_id,'accepted','recipient-hash',delivery)
    ON CONFLICT(device_id,message_id,status) DO UPDATE
      SET otp_delivery_id=COALESCE(wa_message_receipts.otp_delivery_id,EXCLUDED.otp_delivery_id);
  UPDATE wa_message_receipts
    SET otp_delivery_id=delivery
    WHERE device_id=device AND message_id=message_id AND otp_delivery_id IS NULL;

  SELECT count(*) INTO linked_count
    FROM wa_message_receipts
    WHERE device_id=device AND message_id=message_id AND otp_delivery_id=delivery;
  IF linked_count <> 2 THEN
    RAISE EXCEPTION 'FAIL out-of-order receipt linking: expected 2 linked rows, got %',linked_count;
  END IF;

  -- Duplicate delivery events must be idempotent.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES (device,message_id,'delivered','recipient-hash',delivery)
    ON CONFLICT(device_id,message_id,status) DO UPDATE
      SET otp_delivery_id=COALESCE(wa_message_receipts.otp_delivery_id,EXCLUDED.otp_delivery_id);
  SELECT count(*) INTO receipt_count
    FROM wa_message_receipts WHERE device_id=device AND message_id=message_id;
  IF receipt_count <> 2 THEN
    RAISE EXCEPTION 'FAIL duplicate receipt created another row: %',receipt_count;
  END IF;

  -- Pending, server_ack, read and played are persisted but only delivered is billable evidence.
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id)
    VALUES
      (device,message_id,'pending','recipient-hash',delivery),
      (device,message_id,'server_ack','recipient-hash',delivery),
      (device,message_id,'read','recipient-hash',delivery),
      (device,message_id,'played','recipient-hash',delivery);

  SELECT count(*) INTO linked_count
    FROM wa_message_receipts
    WHERE device_id=device AND message_id=message_id AND otp_delivery_id=delivery;
  IF linked_count <> 6 THEN
    RAISE EXCEPTION 'FAIL not all receipt milestones linked: %',linked_count;
  END IF;
  SELECT count(*) INTO receipt_count
    FROM wa_message_receipts
    WHERE device_id=device AND message_id=message_id AND status='delivered';
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'FAIL expected exactly one billable delivered receipt, got %',receipt_count;
  END IF;

  RAISE NOTICE 'PASS out-of-order receipt correlation, duplicate idempotency and non-billable statuses';
END $$;
ROLLBACK;
