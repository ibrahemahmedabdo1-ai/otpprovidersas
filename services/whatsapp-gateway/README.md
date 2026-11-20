# OTPProvider WhatsApp Web Gateway

A separately deployed, QR-paired WhatsApp Web adapter for the OTPProvider platform. It is an experimental linked-device integration, not the official WhatsApp Business Platform.

## Safety defaults

- Customer sending is disabled unless `WA_CUSTOMER_SEND_ENABLED=true` (keep false during rollout).
- Admin test sending is disabled unless `WA_ADMIN_TEST_SEND_ENABLED=true` and `WA_TEST_RECIPIENTS` contains an explicitly approved E.164 number.
- The gateway never charges wallets. OTPProvider's API remains the only billing authority and must charge only after confirmed delivery evidence.
- Auth state is encrypted at rest using AES-256-GCM before being stored in `whatsapp_devices.session_encrypted` in Neon.
- QR and admin routes require separate high-entropy secrets; responses are no-store and QR data is never logged.

## Required environment

`DATABASE_URL`, `GATEWAY_TOKEN`, `PAIRING_VIEW_KEY`, `SESSION_ENCRYPTION_KEY` (64 hex chars), `WA_CUSTOMER_SEND_ENABLED=false`, `WA_ADMIN_TEST_SEND_ENABLED=false`, `WA_TEST_RECIPIENTS` (optional comma-separated E.164 allowlist), `PORT`.

## Routes

- `GET /health` — non-sensitive health probe.
- `GET /pair/<PAIRING_VIEW_KEY>` — QR pairing page; scan with WhatsApp > Linked devices > Link a device.
- `GET /admin/status` — bearer-authenticated connection status.
- `POST /admin/reconnect` — bearer-authenticated reconnect.
- `POST /admin/test-send` — bearer-authenticated, disabled by default, allowlisted test recipient only.
- `POST /v1/send` — customer route; returns 423 unless the explicit customer-send flag is enabled.

A successful socket submission is not proof of delivery. Do not mark an OTP delivered or debit a customer based on the send response alone. Delivery receipt reconciliation must be integrated and tested before enabling customer traffic.

## Deploy

Deploy this directory with the included Dockerfile on a persistent service. Keep one replica and do not attach ephemeral storage; encrypted session state is in Neon. Do not enable customer sending during QR pairing or initial validation.
