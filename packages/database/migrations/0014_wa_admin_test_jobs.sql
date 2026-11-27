-- Durable state for asynchronous Admin WhatsApp test sends.
-- The API creates a job (idempotent per admin + client request id); the gateway claims it exactly once
-- (queued -> sending) and records the outcome. Neither recipient numbers nor message text are stored.
-- Additive and idempotent: safe to re-run. Apply BEFORE deploying the API/gateway that use it.
CREATE TABLE IF NOT EXISTS wa_admin_test_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL,
  recipient_masked text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','accepted','failed','unknown')),
  message_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requested_by, request_id)
);

CREATE INDEX IF NOT EXISTS wa_admin_test_jobs_status_idx
  ON wa_admin_test_jobs (status, updated_at)
  WHERE status IN ('queued','sending');
