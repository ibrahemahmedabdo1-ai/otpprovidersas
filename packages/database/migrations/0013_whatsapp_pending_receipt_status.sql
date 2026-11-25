-- Persist Baileys status 1 as pending without treating it as delivery proof.
ALTER TABLE wa_message_receipts
  DROP CONSTRAINT IF EXISTS wa_message_receipts_status_check;

ALTER TABLE wa_message_receipts
  ADD CONSTRAINT wa_message_receipts_status_check
  CHECK (status IN ('accepted','pending','server_ack','delivered','read','played','error'));
