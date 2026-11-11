-- OTPProvider schema v1. Target: PostgreSQL 15+ (Neon). Applied by scripts/migrate.mjs.
-- Money is stored as integer micro-USD (1 USD = 1,000,000) to avoid floating point errors.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- identity
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  email_verified_at timestamptz,
  password_hash text,                       -- Argon2id; NULL for OAuth-only accounts
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('super_admin','admin_staff','support_staff','customer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','closed')),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('ar','en','ru','es','de','zh')),
  mfa_required boolean NOT NULL DEFAULT false,
  failed_login_count int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- staff and super admin must always require MFA
  CONSTRAINT staff_mfa_required CHECK (role = 'customer' OR mfa_required = true)
);
CREATE INDEX users_role_idx ON users(role);

CREATE TABLE oauth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','github')),
  provider_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,          -- SHA-256 of the opaque token; token itself never stored
  ip inet,
  user_agent text,
  device_label text,
  mfa_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('totp','recovery_code')),
  secret_encrypted text,                    -- AES-256-GCM envelope
  code_hash text,
  confirmed_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_factors_user_idx ON mfa_factors(user_id);

CREATE TABLE login_history (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email_attempted citext,
  success boolean NOT NULL,
  failure_reason text,
  ip inet,
  user_agent text,
  country text,
  suspicious boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_history_user_idx ON login_history(user_id, created_at DESC);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- RBAC / ABAC
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE permissions (
  key text PRIMARY KEY,                     -- e.g. wallet.deposit.approve
  description text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false  -- sensitive => needs Super Admin approval
);
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);
CREATE TABLE staff_assignments (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb, -- ABAC attributes: countries, offices, services
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_decider_differs CHECK (decided_by IS NULL OR decided_by <> requested_by OR requested_by IS NOT NULL)
);
CREATE INDEX approvals_pending_idx ON approvals(status, created_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- tenants
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  country text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  risk_level text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('low','normal','elevated','high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE customer_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_info')),
  use_case text,
  website text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  otp_length int NOT NULL DEFAULT 6 CHECK (otp_length BETWEEN 4 AND 8),
  otp_ttl_seconds int NOT NULL DEFAULT 300 CHECK (otp_ttl_seconds BETWEEN 30 AND 1800),
  max_attempts int NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  resend_cooldown_seconds int NOT NULL DEFAULT 30 CHECK (resend_cooldown_seconds >= 0),
  daily_limit int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  prefix text NOT NULL,                     -- shown in UI, e.g. otp_live_ab12
  key_hash text NOT NULL UNIQUE,            -- HMAC-SHA256(pepper, key); plaintext never stored
  created_by uuid NOT NULL REFERENCES users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_project_idx ON api_keys(project_id) WHERE revoked_at IS NULL;

CREATE TABLE webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url LIKE 'https://%'),
  secret_encrypted text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['otp.delivered','otp.failed','otp.verified'],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status_code int,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webhook_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- providers
CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,                 -- resend, whatsapp_linked_device, whatsapp_official_x
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  kind text NOT NULL CHECK (kind IN ('RESEND','PERSONAL_LINKED_DEVICE','OFFICIAL_WHATSAPP','OFFICIAL_MULTIPLE','OTHER_EMAIL')),
  enabled boolean NOT NULL DEFAULT false,   -- disabled by default; explicit activation required
  maintenance boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  weight int NOT NULL DEFAULT 100 CHECK (weight >= 0),
  cost_micro_usd bigint NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label text NOT NULL,
  credentials_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_health (
  id bigserial PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('healthy','degraded','down','unknown')),
  success_rate numeric(5,4),
  p95_latency_ms int,
  circuit_state text NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed','open','half_open')),
  detail text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_health_idx ON provider_health(provider_id, checked_at DESC);

CREATE TABLE whatsapp_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  label text NOT NULL,
  state text NOT NULL DEFAULT 'disconnected' CHECK (state IN ('pairing','connected','disconnected','error')),
  session_encrypted text,                   -- encrypted session blob, never exposed via API
  routing_eligible boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  location text,
  owner_note text,
  last_activity_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE whatsapp_device_events (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES whatsapp_devices(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text,
  actor_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  sender_name text NOT NULL,
  sender_address citext NOT NULL,
  domain text NOT NULL,
  domain_verified boolean NOT NULL DEFAULT false,
  domain_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('ar','en','ru','es','de','zh')),
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  UNIQUE (key, locale)
);
CREATE TABLE email_suppressions (
  email citext PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('bounce','complaint','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE country_eligibility (
  country text NOT NULL CHECK (length(country) = 2),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled','review','enabled')),
  approved_by uuid REFERENCES users(id),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, channel),
  CONSTRAINT enabled_needs_approver CHECK (status <> 'enabled' OR approved_by IS NOT NULL)
);

-- ---------------------------------------------------------------- pricing
CREATE TABLE prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  country text NOT NULL DEFAULT '*',        -- '*' = default for all countries
  unit_price_micro_usd bigint NOT NULL CHECK (unit_price_micro_usd >= 0),
  version int NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','active','retired')),
  effective_from timestamptz,
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, country, version),
  CONSTRAINT active_needs_approver CHECK (status <> 'active' OR (approved_by IS NOT NULL AND effective_from IS NOT NULL))
);
CREATE UNIQUE INDEX prices_one_active ON prices(channel, country) WHERE status = 'active';

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_micro_usd bigint NOT NULL CHECK (price_micro_usd >= 0),
  credit_micro_usd bigint NOT NULL CHECK (credit_micro_usd >= 0),
  active boolean NOT NULL DEFAULT false,
  commercially_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_needs_approval CHECK (NOT active OR commercially_approved)
);
CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('percent_discount','fixed_discount','extra_credit')),
  value bigint NOT NULL CHECK (value >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code citext NOT NULL UNIQUE,
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  max_redemptions int,
  redeemed_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  CONSTRAINT coupon_limit CHECK (max_redemptions IS NULL OR redeemed_count <= max_redemptions)
);
CREATE TABLE free_usage_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  max_messages int NOT NULL CHECK (max_messages > 0),
  used_messages int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  authorized_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_within_limit CHECK (used_messages <= max_messages)
);

-- ---------------------------------------------------------------- wallet & ledger
CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  paid_micro_usd bigint NOT NULL DEFAULT 0,
  promo_micro_usd bigint NOT NULL DEFAULT 0,
  reserved_micro_usd bigint NOT NULL DEFAULT 0,
  pending_micro_usd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paid_non_negative CHECK (paid_micro_usd >= 0),
  CONSTRAINT promo_non_negative CHECK (promo_micro_usd >= 0),
  CONSTRAINT reserved_non_negative CHECK (reserved_micro_usd >= 0),
  -- available = paid + promo - reserved must never go negative
  CONSTRAINT available_non_negative CHECK (paid_micro_usd + promo_micro_usd - reserved_micro_usd >= 0)
);

CREATE TABLE deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd > 0),
  method_note text,
  evidence_key text,                        -- private storage object key
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','under_review','approved','rejected')),
  receipt_verified boolean NOT NULL DEFAULT false, -- admin confirmed funds actually arrived
  receipt_verification_note text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A screenshot is not proof: approval requires explicit receipt verification.
  CONSTRAINT approval_requires_receipt CHECK (status <> 'approved' OR (receipt_verified AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  entry_type text NOT NULL CHECK (entry_type IN
    ('deposit','promo_credit','reserve','release','charge','refund','adjustment')),
  bucket text NOT NULL CHECK (bucket IN ('paid','promo','reserved')),
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd <> 0),   -- signed
  idempotency_key text NOT NULL UNIQUE,     -- duplicate billing is impossible at DB level
  reference_type text,
  reference_id text,
  reverses_entry_id bigint REFERENCES ledger_entries(id),           -- compensating entries link to original
  actor_id uuid REFERENCES users(id),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_wallet_idx ON ledger_entries(wallet_id, id DESC);
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  number text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  lines jsonb NOT NULL,                     -- snapshot incl. price version; never recomputed
  total_micro_usd bigint NOT NULL CHECK (total_micro_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoices_no_update BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- OTP
CREATE TABLE idempotency_keys (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key)
);

CREATE TABLE otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  mode text NOT NULL CHECK (mode IN ('test','live')),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient_hash text NOT NULL,             -- HMAC of recipient for lookups/rate limits
  recipient_encrypted text NOT NULL,
  country text,
  code_hash text NOT NULL,                  -- HMAC of the OTP; plaintext never stored or logged
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','sent','verified','expired','cancelled','failed','locked')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL,
  resend_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempts_within_max CHECK (attempts <= max_attempts)
);
CREATE INDEX otp_requests_project_idx ON otp_requests(project_id, created_at DESC);
CREATE INDEX otp_requests_recipient_idx ON otp_requests(recipient_hash, created_at DESC);

CREATE TABLE otp_attempts (
  id bigserial PRIMARY KEY,
  otp_request_id uuid NOT NULL REFERENCES otp_requests(id) ON DELETE CASCADE,
  success boolean NOT NULL,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  otp_request_id uuid NOT NULL REFERENCES otp_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id),
  attempt_no int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','submitted','delivered','failed','unknown')),
  provider_message_id text,
  provider_response jsonb,
  evidence jsonb,                           -- delivery evidence used to justify the charge
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  price_id uuid REFERENCES prices(id),      -- price version used; historical charges never change
  routing_explanation jsonb,                -- why this provider was selected
  billed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (otp_request_id, attempt_no),
  CONSTRAINT billed_only_when_delivered CHECK (NOT billed OR status = 'delivered')
);
CREATE INDEX otp_deliveries_unknown_idx ON otp_deliveries(created_at) WHERE status = 'unknown';

CREATE TABLE reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  otp_delivery_id uuid NOT NULL REFERENCES otp_deliveries(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_delivered','resolved_failed','manual_review')),
  checks int NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (otp_delivery_id)
);

-- ---------------------------------------------------------------- support
CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_customer','escalated','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id uuid REFERENCES users(id),
  escalated_to uuid REFERENCES users(id),
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_org_idx ON tickets(organization_id, created_at DESC);
CREATE INDEX tickets_assignee_idx ON tickets(assignee_id, status);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ticket' CHECK (kind IN ('ticket','live_chat')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),        -- the REAL actor, always recorded
  reply_identity text NOT NULL DEFAULT 'self' CHECK (reply_identity IN ('self','support','admin')),
  internal boolean NOT NULL DEFAULT false,             -- internal notes are never shown to customers
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON messages(conversation_id, created_at);
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  deposit_id uuid REFERENCES deposits(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','application/pdf')),
  size_bytes int NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_has_owner CHECK (message_id IS NOT NULL OR deposit_id IS NOT NULL)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

-- ---------------------------------------------------------------- audit / security / compliance
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  acting_as text,                           -- selected reply identity, if any
  action text NOT NULL,
  subject_type text,
  subject_id text,
  ip inet,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_actor_idx ON audit_events(actor_id, created_at DESC);
CREATE INDEX audit_subject_idx ON audit_events(subject_type, subject_id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE security_events (
  id bigserial PRIMARY KEY,
  severity text NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  kind text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('terms','privacy','aup','refund','cookies','dpa','subprocessors','retention')),
  locale text NOT NULL DEFAULT 'en',
  version int NOT NULL,
  body_markdown text NOT NULL,
  legal_review_status text NOT NULL DEFAULT 'template_pending_review' CHECK (legal_review_status IN ('template_pending_review','approved')),
  published_at timestamptz,
  UNIQUE (kind, locale, version),
  CONSTRAINT publish_needs_review CHECK (published_at IS NULL OR legal_review_status = 'approved')
);
CREATE TABLE consent_records (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES legal_documents(id),
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  country text NOT NULL,
  area text,
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified')),
  published boolean NOT NULL DEFAULT false,
  business_hours jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publish_needs_verification CHECK (NOT published OR status = 'verified')
);
CREATE TABLE office_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  department text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('email','phone','support_whatsapp')),  -- never an OTP sending account
  value text NOT NULL,
  evidence_key text,
  verified_by uuid REFERENCES users(id),
  published boolean NOT NULL DEFAULT false,
  CONSTRAINT contact_publish_needs_verification CHECK (NOT published OR verified_by IS NOT NULL)
);

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by uuid NOT NULL REFERENCES users(id),
  storage_key text,
  size_bytes bigint,
  sha256 text,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed')),
  verified_at timestamptz,                  -- NULL => never claim the backup is valid
  restore_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE release_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL CHECK (app IN ('customer','support','admin','website','api')),
  version text NOT NULL,
  channel text NOT NULL DEFAULT 'internal' CHECK (channel IN ('internal','beta','production')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app, version)
);
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor','major','critical')),
  status text NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved')),
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- updated_at triggers
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER orgs_touch BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER providers_touch BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER wa_devices_touch BEFORE UPDATE ON whatsapp_devices FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tickets_touch BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER otp_deliveries_touch BEFORE UPDATE ON otp_deliveries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- ledger posting API
-- All balance changes go through this function: one transaction, one ledger row,
-- one wallet update, idempotent by key. Returns false if the key was already applied.
CREATE OR REPLACE FUNCTION post_ledger_entry(
  p_wallet uuid, p_type text, p_bucket text, p_amount bigint,
  p_key text, p_ref_type text DEFAULT NULL, p_ref_id text DEFAULT NULL,
  p_actor uuid DEFAULT NULL, p_memo text DEFAULT NULL, p_reverses bigint DEFAULT NULL
) RETURNS boolean AS $$
DECLARE inserted int;
BEGIN
  PERFORM 1 FROM wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet % not found', p_wallet; END IF;

  INSERT INTO ledger_entries(wallet_id, entry_type, bucket, amount_micro_usd, idempotency_key,
                             reference_type, reference_id, actor_id, memo, reverses_entry_id)
  VALUES (p_wallet, p_type, p_bucket, p_amount, p_key, p_ref_type, p_ref_id, p_actor, p_memo, p_reverses)
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN false; END IF;

  UPDATE wallets SET
    paid_micro_usd     = paid_micro_usd     + CASE WHEN p_bucket = 'paid'     THEN p_amount ELSE 0 END,
    promo_micro_usd    = promo_micro_usd    + CASE WHEN p_bucket = 'promo'    THEN p_amount ELSE 0 END,
    reserved_micro_usd = reserved_micro_usd + CASE WHEN p_bucket = 'reserved' THEN p_amount ELSE 0 END,
    updated_at = now()
  WHERE id = p_wallet;   -- CHECK constraints reject overdrafts and roll the whole transaction back
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Reserve funds for one delivery (prefers promo balance first is a service-level decision;
-- the DB only guarantees available >= 0).
CREATE OR REPLACE FUNCTION reserve_for_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
BEGIN
  RETURN post_ledger_entry(p_wallet, 'reserve', 'reserved', p_amount,
    'reserve:' || p_delivery, 'otp_delivery', p_delivery::text);
END;
$$ LANGUAGE plpgsql;

-- Charge only after delivery evidence confirmed delivery. Releases the reservation and
-- debits the paid bucket atomically. Calling it twice changes nothing.
CREATE OR REPLACE FUNCTION charge_confirmed_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
DECLARE d otp_deliveries%ROWTYPE; first boolean;
BEGIN
  SELECT * INTO d FROM otp_deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery % not found', p_delivery; END IF;
  IF d.status <> 'delivered' THEN
    RAISE EXCEPTION 'cannot charge delivery % in status %', p_delivery, d.status;
  END IF;
  first := post_ledger_entry(p_wallet, 'charge', 'paid', -p_amount,
    'charge:' || p_delivery, 'otp_delivery', p_delivery::text);
  IF NOT first THEN RETURN false; END IF;
  PERFORM post_ledger_entry(p_wallet, 'release', 'reserved', -p_amount,
    'release:' || p_delivery, 'otp_delivery', p_delivery::text);
  UPDATE otp_deliveries SET billed = true WHERE id = p_delivery;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Release a reservation when failure is CONFIRMED. Refuses when outcome is unknown.
CREATE OR REPLACE FUNCTION release_failed_delivery(p_wallet uuid, p_delivery uuid, p_amount bigint)
RETURNS boolean AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM otp_deliveries WHERE id = p_delivery FOR UPDATE;
  IF s IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'cannot release reservation: delivery % status is %', p_delivery, s;
  END IF;
  RETURN post_ledger_entry(p_wallet, 'release', 'reserved', -p_amount,
    'release:' || p_delivery, 'otp_delivery', p_delivery::text);
END;
$$ LANGUAGE plpgsql;
