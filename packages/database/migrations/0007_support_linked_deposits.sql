-- Complete the manual wallet top-up handoff.
ALTER TABLE messages ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_reply_identity_check;
ALTER TABLE messages ADD CONSTRAINT messages_reply_identity_check CHECK (reply_identity IN ('self','support','admin','system'));
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS support_submitted_by uuid REFERENCES users(id);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS support_submitted_at timestamptz;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS support_evidence_note text;
CREATE UNIQUE INDEX IF NOT EXISTS deposits_ticket_id_unique ON deposits(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deposits_support_queue_idx ON deposits(status,created_at) WHERE status IN ('requested','under_review');

CREATE OR REPLACE FUNCTION publish_deposit_decision() RETURNS trigger AS $$
DECLARE owner_id uuid; conv_id uuid; amount_text text; body_text text; kind_text text; title_text text;
BEGIN
  IF OLD.status = NEW.status OR NEW.status NOT IN ('approved','rejected') OR NEW.ticket_id IS NULL THEN RETURN NEW; END IF;
  SELECT o.owner_user_id INTO owner_id FROM wallets w JOIN organizations o ON o.id=w.organization_id WHERE w.id=NEW.wallet_id;
  SELECT id INTO conv_id FROM conversations WHERE ticket_id=NEW.ticket_id LIMIT 1;
  amount_text := to_char(NEW.amount_micro_usd::numeric / 1000000, 'FM999999990.00');
  IF NEW.status='approved' THEN
    body_text := 'تم اعتماد طلب الشحن وإضافة $'||amount_text||' إلى محفظتك. Your top-up of $'||amount_text||' has been approved and credited.';
    kind_text := 'deposit_approved'; title_text := 'Wallet top-up approved';
  ELSE
    body_text := 'تم رفض طلب الشحن. السبب: '||coalesce(NEW.receipt_verification_note,'يرجى التواصل مع الدعم')||'. Your top-up request was rejected. Please contact Support.';
    kind_text := 'deposit_rejected'; title_text := 'Wallet top-up rejected';
  END IF;
  IF conv_id IS NOT NULL THEN
    INSERT INTO messages(conversation_id,author_id,reply_identity,internal,body)
    VALUES(conv_id,NULL,'system',false,body_text);
    UPDATE tickets SET status='resolved',updated_at=now() WHERE id=NEW.ticket_id;
  END IF;
  IF owner_id IS NOT NULL THEN
    INSERT INTO notifications(user_id,kind,title,body) VALUES(owner_id,kind_text,title_text,body_text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS deposits_publish_decision ON deposits;
CREATE TRIGGER deposits_publish_decision AFTER UPDATE OF status ON deposits
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved','rejected'))
EXECUTE FUNCTION publish_deposit_decision();
