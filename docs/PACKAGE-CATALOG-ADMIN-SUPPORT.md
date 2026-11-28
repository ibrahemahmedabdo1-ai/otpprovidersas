# OTPProvider Package Catalog — Admin & Support

Status: approved package catalog proposal for implementation. Currency: USD.

## Customer-facing packages

| Code | Display name | Price | Wallet credit | Position |
|---|---|---:|---:|---|
| MINI | Mini — Start | $4.99 | $4.99 | Entry |
| STARTER | Starter — Essential | $9.99 | $9.99 | Everyday use |
| GROWTH | Growth — Popular | $24.90 | $24.90 | Most popular |
| BUSINESS | Business — Scale | $49.90 | $49.90 | High-volume teams |
| PROFESSIONAL | Professional — Pro | $99.90 | $99.90 | Largest prepaid option |

All five packages are prepaid wallet-credit packages. The wallet credit equals the package price. Do not advertise a fixed number of OTPs: Email and WhatsApp have different admin-configured per-message prices, and the number of messages also depends on destination, route, and delivery outcome. Do not add bonus credit or free messages by default. Any future bonus must be explicitly configured and funded by an authorized Super Admin.

## Package descriptions

- **MINI:** A low-commitment way to try OTPProvider and send a small number of verification requests.
- **STARTER:** A practical option for individuals and small projects beginning regular verification traffic.
- **GROWTH:** The recommended balance of flexibility and prepaid value for growing products. Show the “Most Popular” label.
- **BUSINESS:** A larger prepaid balance for businesses with steady verification demand and operational teams.
- **PROFESSIONAL:** The largest standard prepaid option for established services with higher expected verification usage.

These descriptions are marketing copy, not delivery or volume guarantees.

## Required Admin experience

Add a Packages section to the Admin web console with:
- List all packages, including draft, pending approval, active, paused, and archived states.
- Show code, name, localized description, price, wallet credit, currency, popularity label, display order, visibility, created/updated timestamps, and activation state.
- Create and edit package metadata and prices.
- Preview the customer-facing package card before publishing.
- Submit changes for approval. Only Super Admin can approve/activate, pause, archive, or change the final customer-visible price.
- Keep package price and wallet credit explicit; reject negative values, zero-price paid packages, mismatched currency, duplicate codes, and invalid display order.
- Record every create/edit/submit/approve/activate/pause/archive action in the append-only audit log with actor, timestamp, before/after values, and reason.
- Do not modify historical purchases when a package changes. Store an immutable purchase-time snapshot of package name, code, price, wallet credit, and currency.

## Required Support experience

Add a read-only Package Catalog view to the Support console:
- Show the same five package names, prices, wallet-credit amounts, descriptions, status, and “Most Popular” marker as the customer-facing catalog.
- Clearly distinguish active packages from pending, paused, or archived packages. Only active packages may be recommended for purchase.
- Allow support staff to compare packages and copy a concise package summary into a customer conversation.
- Show a customer's package purchase request and its status (requested, awaiting proof, under review, approved/credited, rejected, or cancelled) where the existing support permissions allow it.
- Show the payment instructions and proof-submission status relevant to the customer's selected country, if already provided by the payment workflow.
- Support may explain packages and guide customers through the manual payment/contact-support flow.

Support must NOT:
- Create, edit, price, publish, approve, pause, or archive packages.
- Approve deposits, verify receipt of funds, credit/debit wallets, grant bonus credit, or issue refunds.
- See provider secrets, API keys, or internal security configuration.

All money movement remains an Admin/Super Admin responsibility and must use the existing audited wallet/deposit functions. A support conversation or a screenshot of a transfer is not proof of receipt.

## Customer and billing consistency

- Website, customer web/app, Admin, and Support must consume the same backend package catalog; do not maintain separate hard-coded price lists.
- Package purchase creates a pending manual-payment request. It does not credit the wallet automatically.
- Wallet credit occurs only after an authorized Admin independently verifies the funds and approves the deposit through the existing ledger workflow.
- A package purchase snapshot is immutable. Later price changes apply only to new purchases.
- Per-message OTP charges continue to follow the existing delivery-confirmed, charge-once billing rules. Package purchase is not a promise of a fixed OTP count.
- Keep WhatsApp availability and other provider gating independent from package visibility. A package being active does not mean every channel or route is currently available.

## Acceptance checks

1. The five package codes and prices above appear consistently in website/customer and staff views from the backend.
2. Growth is the only package marked “Most Popular”.
3. Support can view and explain packages but cannot mutate package data or money.
4. Only Super Admin can approve and activate packages.
5. Historical purchase snapshots do not change after package edits.
6. No bonus credits or free OTPs are silently added.
7. All administrative changes are auditable.
8. Package activation does not bypass provider/channel feature flags.
