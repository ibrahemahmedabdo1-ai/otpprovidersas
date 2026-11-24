# WhatsApp Linked-Device Production Compliance Gate

**Status: NOT APPROVED FOR GENERAL CUSTOMER TRAFFIC**

This checklist is an internal release gate, not legal advice or a statement that linked-device automation is approved by WhatsApp. The current gateway uses a linked-device implementation and must not be described as the official WhatsApp Business Platform.

General customer sending must remain disabled until every applicable item below is reviewed and signed off by the Owner and a qualified compliance reviewer.

## Integration and provider assessment

- [ ] Document the exact WhatsApp library, protocol, version, and linked-device behavior in use.
- [ ] Review the current WhatsApp Terms of Service, WhatsApp Business Terms, and applicable Business Messaging / Commerce policies.
- [ ] Obtain written confirmation from qualified counsel or an authorized WhatsApp solution provider that the proposed commercial use is permitted.
- [ ] Decide whether the linked-device implementation is acceptable for the intended customer volume and message types.
- [ ] Prefer the official WhatsApp Business Platform or an authorized Business Solution Provider for general commercial customer traffic.
- [ ] Do not represent the linked-device gateway as an official WhatsApp Business API.

## Customer consent and messaging controls

- [ ] Require a documented lawful basis and recipient opt-in before sending.
- [ ] Restrict use to OTPs explicitly requested by the recipient; prohibit unsolicited marketing and bulk messaging.
- [ ] Provide clear sender identification and an abuse/reporting path.
- [ ] Enforce per-customer, per-recipient, per-device, and global rate limits.
- [ ] Detect repeated requests, enumeration, automated abuse, and suspicious traffic.
- [ ] Define retention and deletion rules for phone numbers, delivery receipts, and message metadata.

## Security and privacy

- [ ] Confirm encryption at rest and in transit for credentials, recipient data, and session state.
- [ ] Confirm least-privilege access to the linked device and its authentication session.
- [ ] Ensure OTP values, full phone numbers, session credentials, and tokens are never written to logs.
- [ ] Review cross-border data processing, subprocessors, retention, and applicable privacy obligations.
- [ ] Test emergency disable switches and incident response for account compromise or suspension.
- [ ] Document backup, recovery, and device re-pairing procedures without exposing session keys.

## Operational acceptance

- [ ] Verify receipt-to-delivery correlation with real, controlled test recipients.
- [ ] Verify that only explicit `delivered` receipts trigger one wallet charge.
- [ ] Verify duplicate, delayed, out-of-order, and failed receipts.
- [ ] Verify failed and expired sends release reserved funds exactly once.
- [ ] Verify device disconnect, reconnect, and session recovery.
- [ ] Verify customer traffic remains disabled when any required feature flag, provider, device, or compliance gate is off.
- [ ] Verify monitoring, alerting, queue recovery, and the emergency kill switch.

## Required sign-off

- Owner approval: **Pending**
- Compliance reviewer: **Pending**
- Review date: **Pending**
- Approved integration mode: **Pending**
- Maximum initial traffic / rate limits: **Pending**

Until the required sign-offs are complete, keep `WHATSAPP_LINKED_DEVICE_ENABLED=false`, `WA_CUSTOMER_SEND_ENABLED=false`, the WhatsApp provider disabled, and device customer-routing eligibility disabled.
