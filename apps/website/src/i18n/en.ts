const en = {
  site: { name: "OTPProvider", tagline: "Email and WhatsApp one-time-code API" },
  common: { skip: "Skip to content", language: "Language", console: "Open console", docs: "Developer quickstart", rights: "All rights reserved.", templateNote: "Legal pages are templates and need review by qualified counsel before use.", sandbox: "Sandbox only. Live sending is not enabled yet." },
  nav: { products: "Products", developers: "Developers", pricing: "Pricing", security: "Security", legal: "Legal" },
  meta: {
    home: { title: "OTPProvider: Email and WhatsApp OTP API for developers", description: "Send and verify one-time codes over Email and WhatsApp with a simple REST API, a prepaid USD wallet and an immutable ledger. Sandbox available now." },
    products: { title: "Email OTP and WhatsApp OTP products | OTPProvider", description: "Email OTP through a verified sending domain, and WhatsApp OTP through a QR-paired linked device with channel controls and connection-status visibility." },
    developers: { title: "OTP API quickstart: send and verify codes | OTPProvider", description: "Create a test API key, send a code with POST /v1/otp/send, verify it with POST /v1/otp/verify, and use Idempotency-Key safely." },
    pricing: { title: "Pricing and billing model | OTPProvider", description: "Prepaid USD wallet, billing only on confirmed delivery, manual deposits verified by an administrator. Rates are published once configured." },
    security: { title: "Security controls | OTPProvider", description: "Argon2id passwords, hashed API keys, an append-only ledger, mandatory staff MFA, brute-force lockout and audited admin actions." },
    legalTerms: { title: "Terms of Service (template) | OTPProvider", description: "Template terms of service for OTPProvider. This placeholder text requires review by qualified counsel before use." },
    legalPrivacy: { title: "Privacy Policy (template) | OTPProvider", description: "Template privacy policy for OTPProvider. This placeholder text requires review by qualified counsel before use." },
  },
  home: {
    badge: "Sandbox available now",
    h1: "One-time codes over Email and WhatsApp, built for correctness.",
    sub: "A REST API to send and verify OTPs, a prepaid USD wallet, and an immutable ledger. You are billed only for confirmed deliveries.",
    cta1: "Open the console", cta2: "Read the quickstart",
    featuresTitle: "What you get",
    features: [
      { t: "Simple REST API", d: "Send, verify, resend and cancel with predictable JSON, idempotency keys and clear error codes." },
      { t: "Honest billing", d: "Funds are reserved when you send and charged only when delivery is confirmed. Unknown outcomes are reconciled, never blindly resent." },
      { t: "Built to resist abuse", d: "Codes are stored as hashes, attempts are limited, requests lock after repeated wrong guesses, and recipients are rate limited." },
    ],
    faqTitle: "Straight answers",
    faq: [
      { q: "Can I send real messages today?", a: "Not yet. The sandbox works end to end without sending anything or billing you. Live sending is switched on only after provider setup and review." },
      { q: "How does WhatsApp OTP work?", a: "OTP codes are sent through a WhatsApp device linked by scanning a QR code. The channel is managed from the Admin dashboard and can be enabled for a project after the device is paired and its connection is tested. Continued availability depends on the device staying connected, account status and WhatsApp policies; Email is available as a fallback for critical flows." },
      { q: "How am I billed?", a: "From a prepaid USD wallet, and only when delivery is confirmed. Rates are set by the platform administrator." },
      { q: "Who can change my balance?", a: "Only an administrator, after independently verifying that your payment arrived. Support staff cannot approve deposits or edit balances." },
    ],
  },
  products: {
    h1: "Two channels, described honestly",
    intro: "OTPProvider supports exactly two services.",
    email: { t: "Email OTP", d: "Codes delivered through a verified sending domain with delivery events fed back into billing.", points: ["Delivery, bounce and complaint events are tracked", "Suppression list protects your sender reputation", "Billed only on confirmed delivery"] },
    wa: { t: "WhatsApp OTP", d: "OTP codes are sent through a WhatsApp device linked by scanning a QR code. Channel settings are managed in the Admin dashboard after the device is paired and its connection is tested.", points: ["Pair a WhatsApp device with a QR code", "Manage channel activation for each project in Admin", "Monitor connection status and reconnect the device when needed"], warn: "Ongoing sending depends on device connectivity, WhatsApp account status and platform policies. The system displays request status based on the events available from the linked-device connection, with Email available as a fallback for critical flows." },
  },
  developers: {
    h1: "Quickstart", intro: "Create a project in the console, then create a test key. Test keys start with otp_test_ and never send real messages.",
    s1: "1. Send a code", s2: "2. Verify the code", s3: "3. Retry safely",
    idem: "Send an Idempotency-Key header. Repeating the same key and body returns the original request instead of sending twice; the same key with a different recipient is rejected.",
    sandboxNote: "In sandbox mode the response includes the code so you can test. It never appears in status responses, and live responses will never include it.",
  },
  pricing: {
    h1: "Pricing and billing", intro: "Prices are not published yet. The platform administrator sets rates, and they will appear here once configured.",
    points: ["Prepaid wallet in US dollars", "Funds are reserved at send time and charged only on confirmed delivery", "Failed or unconfirmed sends release the reservation", "Top-ups are manual: an administrator credits your wallet after independently verifying the payment arrived"],
  },
  security: {
    h1: "Security controls", intro: "These controls are implemented in the product today.",
    points: ["Passwords are hashed with Argon2id", "API keys are stored only as hashes and shown once", "The wallet ledger is append-only and cannot be edited or deleted", "Staff accounts must use multi-factor authentication", "Support staff cannot approve deposits, change balances or see secrets", "Sensitive actions are written to an audit log"],
    note: "No certification or penetration-test result is claimed. Independent review is planned before live launch.",
  },
  legal: {
    banner: "Template. Requires review by qualified counsel before use.",
    terms: { title: "Terms of Service", body: ["These terms are a placeholder. Replace them with terms reviewed by qualified counsel.", "They should cover acceptable use, billing and refunds, service limits, liability and termination.", "Operator legal name, address and governing law must be added."] },
    privacy: { title: "Privacy Policy", body: ["This policy is a placeholder. Replace it with a policy reviewed by qualified counsel.", "It should describe what personal data is collected, why, how long it is kept and who can access it.", "Recipient contact details used for OTP delivery are stored encrypted and shown masked."] },
  },
};
export type Dict = typeof en;
export default en;
