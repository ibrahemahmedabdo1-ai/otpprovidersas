-- WhatsApp OTP message templates: approved catalog plus customer-submitted revisions.
CREATE TABLE whatsapp_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  supersedes_id uuid REFERENCES whatsapp_message_templates(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status <> 'approved')
);
CREATE INDEX whatsapp_templates_catalog_idx ON whatsapp_message_templates(status, project_id, created_at DESC);
CREATE INDEX whatsapp_templates_pending_idx ON whatsapp_message_templates(created_at) WHERE status='pending';
ALTER TABLE projects ADD COLUMN whatsapp_template_id uuid REFERENCES whatsapp_message_templates(id) ON DELETE SET NULL;
