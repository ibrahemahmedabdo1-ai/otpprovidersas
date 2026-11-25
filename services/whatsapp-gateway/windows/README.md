# Run the OTPProvider WhatsApp Gateway on Windows

This is a **prepared local-run path**, not an automatic cutover. The production Railway service remains untouched until the operator deliberately stops it and verifies the local instance.

## Important safety facts

- The gateway uses the same Neon database and encrypted WhatsApp auth records as production. Do not create a second session or change `SESSION_ENCRYPTION_KEY`.
- The gateway takes a PostgreSQL advisory lock named `otpprovider:whatsapp-gateway:singleton`. Only one instance can own the WhatsApp session at a time. Running this locally while Railway is still active will leave the local process in `gateway_initializing`; this is intentional protection against two devices competing for one session.
- Keep `WA_CUSTOMER_SEND_ENABLED=false`. Do not enable customer sending during migration.
- Do not print, copy, paste, or commit Railway environment values, especially `DATABASE_URL`, `GATEWAY_TOKEN`, `PAIRING_VIEW_KEY`, `SESSION_ENCRYPTION_KEY`, and `OTP_CRON_SECRET`.
- Baileys linked-device connectivity is not the official WhatsApp Business Platform and carries reliability / policy / account risk.

## Requirements

- Windows 10/11, PowerShell 5.1+.
- Bun installed from https://bun.sh.
- Railway CLI installed and authenticated in this Windows account.
- This repository cloned locally and the Railway project linked to it.

## Prepare

From the repository root:

```powershell
cd services/whatsapp-gateway
powershell -ExecutionPolicy Bypass -File .\windows\Start-Gateway.ps1 -PrepareOnly
```

This checks the local prerequisites and confirms that the current production Railway endpoint is still responding. It does not start a second gateway or change production.

## Controlled cutover

1. Schedule a short maintenance window.
2. In Railway, stop the `whatsapp-linked-device-gateway` service (do not delete it and do not change variables or volumes).
3. On the Windows PC, run the script without `-PrepareOnly`.
4. Confirm the local `/health` response reports `ready: true`.
5. Only then configure a **stable authenticated tunnel** (Cloudflare Tunnel or Tailscale Funnel) and point the backend gateway URL at its HTTPS hostname.
6. Test pairing/status and a harmless health request first. Do not send a real WhatsApp message without separately authorizing a specific test.
7. Keep Railway available for rollback. If local health fails, stop the local process and restart the Railway service.

## Stable public connectivity

A local process is not reachable from Vercel by itself. Do not expose port 8080 directly on the router. Use a stable HTTPS tunnel with account authentication and restrict access to the gateway routes. A temporary Quick Tunnel URL is not suitable for production because its hostname can change.

The pairing page is protected by the existing `PAIRING_VIEW_KEY`; API routes use the existing bearer `GATEWAY_TOKEN`. Keep both private. The tunnel hostname alone is not an authentication layer.

## Windows power settings

Set the PC to never sleep while plugged in, keep the network adapter awake, and configure Windows to restart the gateway process after a crash. Do not disable Windows security controls. Keep the PC physically secured because it will hold access to a linked WhatsApp account.

## Rollback

Stop the local process, then start the existing Railway service again. Do not reset WhatsApp auth, delete database rows, rotate encryption keys, or pair a new device as a rollback step.
