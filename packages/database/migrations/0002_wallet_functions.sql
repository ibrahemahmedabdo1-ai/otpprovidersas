-- Wallet operations as database functions: each is one transaction, row-locked, idempotent where it matters,
-- and enforces who may do what, so a bug in application code cannot move money the wrong way.

-- A customer asks to top up. No money moves: only the wallet's pending figure and a deposit request are recorded.
CREATE OR REPLACE FUNCTION request_deposit(p_wallet uuid, p_amount bigint, p_note text)
RETURNS uuid AS $$
DECLARE d uuid; open_count int;
BEGIN
  PERFORM 1 FROM wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  SELECT count(*) INTO open_count FROM deposits WHERE wallet_id = p_wallet AND status IN ('requested','under_review');
  IF open_count >= 5 THEN RAISE EXCEPTION 'too_many_open_deposits'; END IF;
  INSERT INTO deposits(wallet_id, amount_micro_usd, method_note) VALUES (p_wallet, p_amount, left(p_note, 500)) RETURNING id INTO d;
  UPDATE wallets SET pending_micro_usd = pending_micro_usd + p_amount, updated_at = now() WHERE id = p_wallet;
  RETURN d;
END;
$$ LANGUAGE plpgsql;

-- Approval credits the wallet. Rules enforced here, not only in the application:
--  * only super_admin or admin_staff accounts can approve (never support, never customers);
--  * admin_staff additionally need an approved Super Admin approval for this exact deposit;
--  * a receipt note (independent confirmation that funds actually arrived) is mandatory;
--  * approving twice credits once.
CREATE OR REPLACE FUNCTION approve_deposit(p_deposit uuid, p_admin uuid, p_receipt_note text)
RETURNS boolean AS $$
DECLARE dep deposits%ROWTYPE; r text; credited boolean;
BEGIN
  SELECT role INTO r FROM users WHERE id = p_admin AND status = 'active';
  IF r IS NULL OR r NOT IN ('super_admin','admin_staff') THEN RAISE EXCEPTION 'not_permitted'; END IF;
  IF r = 'admin_staff' AND NOT EXISTS (
       SELECT 1 FROM approvals WHERE action = 'wallet.deposit.approve' AND subject_id = p_deposit::text AND status = 'approved'
         AND decided_by IS NOT NULL AND decided_by <> p_admin) THEN
    RAISE EXCEPTION 'super_admin_approval_required';
  END IF;
  IF p_receipt_note IS NULL OR length(btrim(p_receipt_note)) < 5 THEN RAISE EXCEPTION 'receipt_verification_required'; END IF;

  SELECT * INTO dep FROM deposits WHERE id = p_deposit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF dep.status = 'approved' THEN RETURN false; END IF;
  IF dep.status NOT IN ('requested','under_review') THEN RAISE EXCEPTION 'deposit_not_open'; END IF;

  UPDATE deposits SET status = 'approved', receipt_verified = true, receipt_verification_note = btrim(p_receipt_note),
                      decided_by = p_admin, decided_at = now() WHERE id = p_deposit;
  credited := post_ledger_entry(dep.wallet_id, 'deposit', 'paid', dep.amount_micro_usd, 'deposit:' || p_deposit,
                                'deposit', p_deposit::text, p_admin, 'Manual top-up approved');
  UPDATE wallets SET pending_micro_usd = GREATEST(pending_micro_usd - dep.amount_micro_usd, 0), updated_at = now() WHERE id = dep.wallet_id;
  RETURN credited;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_deposit(p_deposit uuid, p_admin uuid, p_note text)
RETURNS boolean AS $$
DECLARE dep deposits%ROWTYPE; r text;
BEGIN
  SELECT role INTO r FROM users WHERE id = p_admin AND status = 'active';
  IF r IS NULL OR r NOT IN ('super_admin','admin_staff') THEN RAISE EXCEPTION 'not_permitted'; END IF;
  SELECT * INTO dep FROM deposits WHERE id = p_deposit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF dep.status = 'rejected' THEN RETURN false; END IF;
  IF dep.status NOT IN ('requested','under_review') THEN RAISE EXCEPTION 'deposit_not_open'; END IF;
  UPDATE deposits SET status = 'rejected', receipt_verification_note = left(btrim(coalesce(p_note,'')), 500), decided_by = p_admin, decided_at = now() WHERE id = p_deposit;
  UPDATE wallets SET pending_micro_usd = GREATEST(pending_micro_usd - dep.amount_micro_usd, 0), updated_at = now() WHERE id = dep.wallet_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql;
