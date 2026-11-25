\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_user uuid; v_request uuid := gen_random_uuid(); v_device uuid := gen_random_uuid();
  v_job uuid; v_job2 uuid; v_claimed int; v_status text;
BEGIN
  INSERT INTO users(email,role,status) VALUES ('wa-job-test@x.co','admin_staff','active') RETURNING id INTO v_user;

  INSERT INTO wa_admin_test_jobs(request_id,requested_by,device_id,recipient_masked)
    VALUES (v_request,v_user,v_device,'***7964') RETURNING id INTO v_job;

  -- Idempotency: the same (admin, request id) can never create a second job.
  INSERT INTO wa_admin_test_jobs(request_id,requested_by,device_id,recipient_masked)
    VALUES (v_request,v_user,v_device,'***7964') ON CONFLICT (requested_by,request_id) DO NOTHING RETURNING id INTO v_job2;
  IF v_job2 IS NOT NULL THEN RAISE EXCEPTION 'duplicate request id created a second job'; END IF;

  -- Exactly-once claim: only the first queued -> sending update wins.
  UPDATE wa_admin_test_jobs SET status='sending' WHERE id=v_job AND device_id=v_device AND status='queued';
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed <> 1 THEN RAISE EXCEPTION 'first claim should succeed'; END IF;
  UPDATE wa_admin_test_jobs SET status='sending' WHERE id=v_job AND device_id=v_device AND status='queued';
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed <> 0 THEN RAISE EXCEPTION 'second claim must not succeed (would resend)'; END IF;

  -- A late "failed" from the API stale rule cannot overwrite a job already finished by the gateway.
  UPDATE wa_admin_test_jobs SET status='accepted', message_id='ABCDEF123456' WHERE id=v_job AND status='sending';
  UPDATE wa_admin_test_jobs SET status='failed' WHERE id=v_job AND status = ANY(ARRAY['queued']);
  SELECT status INTO v_status FROM wa_admin_test_jobs WHERE id=v_job;
  IF v_status <> 'accepted' THEN RAISE EXCEPTION 'terminal state was overwritten: %', v_status; END IF;

  -- Only the five documented statuses are storable.
  BEGIN
    UPDATE wa_admin_test_jobs SET status='delivered' WHERE id=v_job;
    RAISE EXCEPTION 'invalid status accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
