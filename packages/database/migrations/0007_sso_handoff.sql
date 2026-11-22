-- One-time hand-off codes so a user who signed in (with MFA) on the website can open their panel without signing in again.
-- A code lives 30 seconds, works once, is stored only as a hash, and is bound to one panel.
CREATE TABLE IF NOT EXISTS sso_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  target text NOT NULL CHECK (target IN ('console','admin','support')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sso_handoffs_expires_idx ON sso_handoffs (expires_at);
