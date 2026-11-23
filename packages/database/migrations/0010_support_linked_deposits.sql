-- 0010: link top-up requests to a support ticket and let Support submit evidence for ADMIN review.
-- Additive only. Support can never approve or credit: approve_deposit/reject_deposit are unchanged.
ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS support_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS support_evidence_note text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposits_support_note_len_chk') THEN
    ALTER TABLE deposits ADD CONSTRAINT deposits_support_note_len_chk
      CHECK (support_evidence_note IS NULL OR char_length(support_evidence_note) BETWEEN 5 AND 500);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS deposits_ticket_uidx ON deposits(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deposits_support_queue_idx ON deposits(created_at) WHERE status IN ('requested','under_review');

-- When an admin decides a ticket-linked deposit, tell the customer in the ticket and resolve it.
-- The message author is the deciding admin (messages.author_id stays NOT NULL), shown as the "admin" identity.
CREATE OR REPLACE FUNCTION publish_deposit_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_conv uuid; v_org uuid; v_owner uuid; v_msg text;
BEGIN
  IF NEW.ticket_id IS NULL OR NEW.decided_by IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') OR OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT c.id, t.organization_id INTO v_conv, v_org FROM tickets t JOIN conversations c ON c.ticket_id = t.id WHERE t.id = NEW.ticket_id LIMIT 1;
  IF v_conv IS NULL THEN RETURN NEW; END IF;
  v_msg := CASE WHEN NEW.status = 'approved'
    THEN 'تم اعتماد طلب الشحن وإضافة الرصيد. / Your top-up was approved and the balance has been credited.'
    ELSE 'تم رفض طلب الشحن. تواصل مع الدعم للتفاصيل. / Your top-up request was not approved. Reply here for details.' END;
  INSERT INTO messages(conversation_id, author_id, reply_identity, internal, body) VALUES (v_conv, NEW.decided_by, 'admin', false, v_msg);
  UPDATE tickets SET status = 'resolved', updated_at = now() WHERE id = NEW.ticket_id;
  SELECT owner_user_id INTO v_owner FROM organizations WHERE id = v_org;
  IF v_owner IS NOT NULL THEN
    INSERT INTO notifications(user_id, kind, title, body) VALUES (v_owner, 'deposit_' || NEW.status, 'Top-up ' || NEW.status, v_msg);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS deposits_publish_decision ON deposits;
CREATE TRIGGER deposits_publish_decision AFTER UPDATE OF status ON deposits
  FOR EACH ROW EXECUTE FUNCTION publish_deposit_decision();
