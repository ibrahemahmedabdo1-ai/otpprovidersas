import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicPricing } from "./public-pricing";

const prices = [
  { channel: "email", country: "*", micro: "20000" },
  { channel: "whatsapp", country: "*", micro: "45000" },
  { channel: "whatsapp", country: "EG", micro: "100000" },
  { channel: "whatsapp", country: "SA", micro: "95000" },
];

test("email price applies to every country when an email provider is live", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }, { channel: "whatsapp", live: false }]);
  assert.ok(r.countries.length > 150);
  assert.ok(r.countries.every((c) => c.email === "20000" && c.whatsapp !== null));
});

test("whatsapp is available in every country: own price, else the approved default, in the right column", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }, { channel: "whatsapp", live: false }]);
  const get = (c: string) => r.countries.find((x) => x.code === c)!;
  assert.equal(get("EG").whatsapp, "100000");
  assert.equal(get("EG").email, "20000");
  assert.equal(get("SA").whatsapp, "95000");
  assert.equal(get("FR").whatsapp, "45000", "approved default applies");
  assert.ok(r.countries.every((c) => c.whatsapp !== null));
});

test("whatsapp without any approved price is not available (nothing invented)", () => {
  const r = buildPublicPricing([{ channel: "email", country: "*", micro: "20000" }], [{ channel: "email", live: true }]);
  assert.ok(r.countries.every((c) => c.whatsapp === null));
});

test("email without a live provider is hidden; whatsapp stays listed", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: false }, { channel: "whatsapp", live: false }]);
  assert.ok(r.countries.every((c) => c.email === null && c.whatsapp !== null));
  assert.deepEqual(r.channels, { email: false, whatsapp: true });
});

test("no price is exposed for a channel with no approved price", () => {
  const r = buildPublicPricing([], [{ channel: "email", live: true }]);
  assert.equal(r.countries.length, 0);
});

test("sanctioned and uninhabited territories are not listed", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }]);
  for (const code of ["KP", "IR", "SY", "CU", "AQ"]) assert.ok(!r.countries.some((c) => c.code === code), code);
});
