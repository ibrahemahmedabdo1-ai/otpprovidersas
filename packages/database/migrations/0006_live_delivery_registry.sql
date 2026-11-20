-- Register launch providers and the first customer-facing credit package.
-- Providers and package stay disabled until end-to-end delivery is verified.
INSERT INTO providers(key, channel, kind, enabled, maintenance, priority, weight, cost_micro_usd, config)
VALUES
  ('resend_email', 'email', 'RESEND', false, false, 10, 100, 0,
   '{"domain":"mail.otpprovider.com","delivery_receipts":"resend_webhook","billing":"delivered_only"}'::jsonb),
  ('whatsapp_linked_device', 'whatsapp', 'PERSONAL_LINKED_DEVICE', false, false, 20, 100, 0,
   '{"gateway_url":"https://whatsapp-linked-device-gateway-production.up.railway.app","customer_sending_enabled":false,"delivery_receipts":"not_available"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO provider_health(provider_id, status, circuit_state, detail)
SELECT p.id, 'unknown', 'closed', 'Registered; awaiting production end-to-end delivery verification.'
FROM providers p
WHERE p.key IN ('resend_email', 'whatsapp_linked_device')
  AND NOT EXISTS (SELECT 1 FROM provider_health h WHERE h.provider_id = p.id);

INSERT INTO packages(name, price_micro_usd, credit_micro_usd, active, commercially_approved)
SELECT 'Starter Credit $4.99', 4990000, 4990000, false, false
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Starter Credit $4.99');

INSERT INTO audit_events(actor_id, action, subject_type, subject_id, metadata)
SELECT NULL::uuid, 'provider.registered', 'provider', p.id::text,
       jsonb_build_object('key', p.key, 'enabled', p.enabled, 'note', 'Registered disabled pending end-to-end verification')
FROM providers p
WHERE p.key IN ('resend_email', 'whatsapp_linked_device')
  AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.action = 'provider.registered' AND a.subject_id = p.id::text);

INSERT INTO audit_events(actor_id, action, subject_type, subject_id, metadata)
SELECT NULL::uuid, 'package.created', 'package', p.id::text,
       jsonb_build_object('name', p.name, 'priceMicroUsd', p.price_micro_usd, 'creditMicroUsd', p.credit_micro_usd,
                          'active', p.active, 'note', 'Draft until live delivery test passes')
FROM packages p
WHERE p.name = 'Starter Credit $4.99'
  AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.action = 'package.created' AND a.subject_id = p.id::text);
