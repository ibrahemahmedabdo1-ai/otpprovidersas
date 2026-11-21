const en = {
  header: { login: "Log in", start: "Get started", language: "Language" },
  hero: {
    badge: "Sandbox open: test keys are free",
    h1: "Fast, secure WhatsApp and Email OTP verification",
    sub: "A REST API to send and verify one-time codes. Create a test key and send your first code in minutes.",
    cta1: "Get started free", cta2: "View API docs",
    window: "Send a code", chatName: "OTPProvider", chatNow: "now", sms: "Your verification code is", chatTyping: "typing…", chatOnline: "online", chatExpire: "It expires in 5 minutes.", chatShare: "Never share this code with anyone.",
  },
  strip: {
    title: "Everything an OTP flow needs",
    items: ["Email OTP", "WhatsApp OTP", "REST API", "Signed webhooks", "Idempotency keys", "Prepaid wallet", "Audit log", "Staff MFA"],
  },
  why: {
    title: "Why choose OTPProvider?",
    sub: "Verification you can reason about: every send, charge and balance change is recorded.",
    items: [
      { t: "Two channels, one API", d: "Send codes over Email or WhatsApp with the same request. Pick the channel on each call." },
      { t: "Pay for confirmed delivery", d: "Funds are reserved when you send and charged only when delivery is confirmed." },
      { t: "Signed webhooks", d: "Get signed events on your server the moment a code is verified." },
      { t: "Built-in abuse protection", d: "Hashed codes, attempt limits, lockouts and per-recipient rate limits." },
    ],
  },
  plans: {
    title: "Simple, transparent packages",
    sub: "Top up your wallet, then pay only for confirmed deliveries.",
    unit: "wallet top-up", custom: "Custom", popular: "Most popular",
    items: [
      { name: "Starter", blurb: "For trying things out and small apps.", features: ["Test keys and sandbox", "Email OTP", "Pay as you go from your wallet", "Support tickets"], cta: "Get started" },
      { name: "Growth", blurb: "For products with real sign-up traffic.", features: ["Everything in Starter", "Signed webhooks", "WhatsApp OTP, enabled after review", "Usage and wallet dashboard"], cta: "Get started" },
      { name: "Enterprise", blurb: "For high volume and custom needs.", features: ["Custom volumes", "Rates agreed in writing", "Dedicated onboarding", "Security review support"], cta: "Contact us" },
    ],
    note: "Credit is added after an administrator verifies your payment. Public rates are shown by channel and destination country below; final charges apply only to enabled, confirmed delivery routes.",
  },
  dev: {
    title: "Built for developers, by developers",
    sub: "Predictable JSON, idempotency keys and clear error codes. Test keys never send real messages.",
    points: ["Send, verify, resend and cancel", "Retry safely with Idempotency-Key", "Sandbox returns the code so you can test"],
    docs: "Read the quickstart",
  },
  cta: { title: "Start sending OTPs today", sub: "Secure verification for your platform, set up in minutes.", signup: "Sign up now", docs: "Read the docs" },
  footer: {
    blurb: "One-time codes over Email and WhatsApp, built for correctness.",
    platform: "Platform", resources: "Resources", company: "Company", account: "Get started",
    quickstart: "Quickstart", products: "Products", pricing: "Pricing", security: "Security",
    terms: "Terms of Service", privacy: "Privacy Policy", contact: "Contact us",
    signup: "Create account", login: "Log in", forgot: "Forgot password", keys: "API keys",
    services: "Services", servicesList: "Email OTP, WhatsApp OTP, REST API, webhooks",
    address: "Address", language: "Language", rights: "All rights reserved.",
    status: "Live sending is enabled per account after review.",
    badges: ["Argon2id hashing", "Append-only ledger", "Staff MFA", "Audit log"],
    templateNote: "Legal pages are templates and need review by qualified counsel before use.",
  },
  faqTitle: "Straight answers",
  faq: [
    { q: "Can I send real messages today?", a: "You can test everything in the sandbox now, without sending anything or being billed. Live sending is enabled per account after setup and review." },
    { q: "Which channels are supported?", a: "Email OTP and WhatsApp OTP. Email is the default channel; WhatsApp is enabled per project after review." },
    { q: "How am I billed?", a: "From a prepaid USD wallet, and only when delivery is confirmed. Rates are set by the platform administrator." },
    { q: "Who can change my balance?", a: "Only an administrator, after independently verifying that your payment arrived. Support staff cannot approve deposits or edit balances." },
  ],
};
export type Landing = typeof en;
export default en;
