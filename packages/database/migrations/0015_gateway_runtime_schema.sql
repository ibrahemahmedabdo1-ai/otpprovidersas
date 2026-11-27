-- Declare the schema the WhatsApp gateway creates at startup, so migrations are the single source of truth
-- and a clean install / CI matches production. Purely additive and idempotent (IF NOT EXISTS only):
-- on a database where the gateway already created these objects it changes nothing.
-- No foreign key is added from wa_message_receipts.device_id to wa_gateway_devices on purpose:
-- existing production rows were never validated against it and adding it could fail or lock.
CREATE TABLE IF NOT EXISTS wa_gateway_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  state text NOT NULL DEFAULT 'disconnected',
  creds jsonb,
  qr_data_url text,
  last_activity_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_gateway_kv (
  k text PRIMARY KEY,
  v jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_message_receipts_msg_idx
  ON wa_message_receipts (message_id);
