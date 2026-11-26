\set ON_ERROR_STOP on
-- Proves the reconciliation query cannot be starved by already-billed deliveries and that only an explicit
-- 'delivered' receipt on an unbilled, non-failed delivery is selected.
-- The query between the markers MUST equal UNBILLED_DELIVERED_RECEIPTS_SQL in
-- backend/api/src/otp/whatsapp-receipt-rules.ts (enforced by a unit test).
BEGIN;
DO $$
DECLARE
  v_user uuid; v_org uuid; v_wallet uuid; v_project uuid; v_provider uuid;
  v_device uuid := gen_random_uuid();
  v_req uuid; v_del uuid; i int;
  v_pending uuid; v_failed uuid; v_read_only uuid; v_accepted uuid; v_ack uuid;
  v_found uuid[]; n int;
BEGIN
  INSERT INTO users(email,role,status) VALUES ('wa-recon@x.co','customer','active') RETURNING id INTO v_user;
  INSERT INTO organizations(name,owner_user_id) VALUES ('Recon Test',v_user) RETURNING id INTO v_org;
  INSERT INTO wallets(organization_id) VALUES (v_org) RETURNING id INTO v_wallet;
  INSERT INTO projects(organization_id,name) VALUES (v_org,'Recon Project') RETURNING id INTO v_project;
  INSERT INTO providers(key,channel,kind) VALUES ('wa_recon_test','whatsapp','PERSONAL_LINKED_DEVICE') RETURNING id INTO v_provider;

  -- 120 deliveries that are ALREADY billed, each with an old delivered receipt (older than everything below).
  FOR i IN 1..120 LOOP
    INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
      VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-billed-'||i) RETURNING id INTO v_req;
    INSERT INTO otp_deliveries(otp_request_id,provider_id,status,billed) VALUES (v_req,v_provider,'delivered',true) RETURNING id INTO v_del;
    INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id,created_at)
      VALUES (v_device,'BILLED-'||i,'delivered','h',v_del, now()-interval '1 day');
  END LOOP;

  -- Newer deliveries that must be considered.
  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-pending') RETURNING id INTO v_req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id,status) VALUES (v_req,v_provider,'submitted') RETURNING id INTO v_pending;
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'PENDING-1','delivered','h',v_pending);

  -- A delivery already marked failed (funds released) must never be re-selected.
  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-failed') RETURNING id INTO v_req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id,status) VALUES (v_req,v_provider,'failed') RETURNING id INTO v_failed;
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'FAILED-1','delivered','h',v_failed);

  -- read / accepted / server_ack alone are NOT billable evidence.
  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-read') RETURNING id INTO v_req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id,status) VALUES (v_req,v_provider,'submitted') RETURNING id INTO v_read_only;
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'READ-1','read','h',v_read_only);
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'READ-1','played','h',v_read_only);

  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-accepted') RETURNING id INTO v_req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id,status) VALUES (v_req,v_provider,'submitted') RETURNING id INTO v_accepted;
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'ACC-1','accepted','h',v_accepted);

  INSERT INTO otp_requests(project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,max_attempts,expires_at,correlation_id)
    VALUES (v_project,v_wallet,'live','whatsapp','h','e','c',5,now()+interval '5 minutes','recon-ack') RETURNING id INTO v_req;
  INSERT INTO otp_deliveries(otp_request_id,provider_id,status) VALUES (v_req,v_provider,'submitted') RETURNING id INTO v_ack;
  INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES (v_device,'ACK-1','server_ack','h',v_ack);

  -- BEGIN unbilled-delivered-query
  SELECT array_agg(q.otp_delivery_id) INTO v_found FROM (
SELECT DISTINCT ON (w.otp_delivery_id) w.otp_delivery_id,w.id,w.message_id,w.device_id,w.status,w.created_at FROM wa_message_receipts w JOIN otp_deliveries d ON d.id=w.otp_delivery_id WHERE w.status='delivered' AND d.billed=false AND d.status<>'failed' ORDER BY w.otp_delivery_id,w.created_at ASC LIMIT 100
  ) q;
  -- END unbilled-delivered-query

  n := COALESCE(array_length(v_found,1),0);
  IF n <> 1 OR v_found[1] <> v_pending THEN
    RAISE EXCEPTION 'expected exactly the pending delivery, got % rows', n;
  END IF;
END $$;
ROLLBACK;
