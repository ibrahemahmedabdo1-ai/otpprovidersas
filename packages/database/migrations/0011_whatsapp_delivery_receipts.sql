-- Add an explicit, durable link from each WhatsApp receipt to the OTP delivery it confirms.
-- Safe additive migration: existing admin test receipts remain unlinked.
ALTER TABLE wa_message_receipts
  ADD COLUMN IF NOT EXISTS otp_delivery_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wa_message_receipts_otp_delivery_id_fkey'
      AND conrelid = 'wa_message_receipts'::regclass
  ) THEN
    ALTER TABLE wa_message_receipts
      ADD CONSTRAINT wa_message_receipts_otp_delivery_id_fkey
      FOREIGN KEY (otp_delivery_id) REFERENCES otp_deliveries(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wa_message_receipts_delivery_status_idx
  ON wa_message_receipts (otp_delivery_id, status, created_at)
  WHERE otp_delivery_id IS NOT NULL;

-- Provider message IDs are the external idempotency key used to reconcile receipts.
CREATE UNIQUE INDEX IF NOT EXISTS otp_deliveries_provider_message_id_uidx
  ON otp_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
