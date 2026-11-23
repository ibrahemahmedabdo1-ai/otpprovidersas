-- 0009: admin/support language persistence reuse (users.locale already exists) + support auto-translation.
-- Additive only: new columns have defaults, new tables are empty. Safe to apply to a live database.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS translation_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_language text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_language_source text;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_customer_language_chk;
ALTER TABLE tickets ADD CONSTRAINT tickets_customer_language_chk CHECK (
  (customer_language IS NULL AND customer_language_source IS NULL) OR
  (customer_language IN ('ar','en','ru','es','de','zh') AND customer_language_source IN ('detected','override')));

-- Per-agent translation settings. 'allowed' is set by an Admin; 'enabled' and 'language' are the agent's own choice.
CREATE TABLE IF NOT EXISTS user_translation_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  language text CHECK (language IS NULL OR language IN ('ar','en','ru','es','de','zh')),   -- NULL = use the account language
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Translations are stored next to, never over, the original message. One row per message and target language, so a message is never translated twice.
CREATE TABLE IF NOT EXISTS message_translations (
  id bigserial PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_lang text NOT NULL CHECK (target_lang IN ('ar','en','ru','es','de','zh')),
  source_lang text CHECK (source_lang IS NULL OR source_lang IN ('ar','en','ru','es','de','zh')),
  body text NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, target_lang)
);

-- Operational log: counts and errors only. Never message text, never keys.
CREATE TABLE IF NOT EXISTS translation_events (
  id bigserial PRIMARY KEY,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  target_lang text,
  status text NOT NULL CHECK (status IN ('ok','error','skipped')),
  error_code text,
  chars int NOT NULL DEFAULT 0 CHECK (chars >= 0),
  provider text,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS translation_events_created_idx ON translation_events(created_at DESC);

-- Off by default. An Admin must enable it and a provider key must be configured on the server.
INSERT INTO system_settings(key, value) VALUES ('translation', '{"enabled": false, "languages": ["ar","en","ru","es","de","zh"], "dailyCharLimit": 200000}'::jsonb)
ON CONFLICT (key) DO NOTHING;
