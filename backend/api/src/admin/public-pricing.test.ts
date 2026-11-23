import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPublicDeliveryGates, buildPublicPricing } from "./public-pricing";

const prices = [
  { channel: "email", country: "*", micro: "20000" },
  { channel: "whatsapp", country: "*", micro: "45000" },
  { channel: "whatsapp", country: "EG", micro: "100000" },
  { channel: "whatsapp", country: "SA", micro: "95000" },
];

test("email price applies to every sellable country when its provider is live", () => {
  const providers = applyPublicDeliveryGates([{ channel: "email", live: true }, { channel: "whatsapp", live: true }]);
  const r = buildPublicPricing(prices, providers);
  assert.ok(r.countries.length > 150);
  assert.ok(r.countries.every((c) => c.email === "20000" && c.whatsapp === null));
  assert.deepEqual(r.channels, { email: true, whatsapp: false });
});

test("WhatsApp stays hidden even when its database provider is enabled and prices exist", () => {
  const providers = applyPublicDeliveryGates([{ channel: "email", live: true }, { channel: "whatsapp", live: true }]);
  const r = buildPublicPricing(prices, providers);
  assert.equal(r.channels.whatsapp, false);
  assert.ok(r.countries.every((country) => country.whatsapp === null));
});

test("email without a live provider is hidden and WhatsApp remains unavailable", () => {
  const providers = applyPublicDeliveryGates([{ channel: "email", live: false }, { channel: "whatsapp", live: true }]);
  const r = buildPublicPricing(prices, providers);
  assert.ok(r.countries.every((country) => country.email === null && country.whatsapp === null));
  assert.deepEqual(r.channels, { email: false, whatsapp: false });
});

test("no price is exposed for a channel with no approved price", () => {
  const providers = applyPublicDeliveryGates([{ channel: "email", live: true }]);
  const r = buildPublicPricing([], providers);
  assert.equal(r.countries.length, 0);
});

test("sanctioned and uninhabited territories are not listed", () => {
  const providers = applyPublicDeliveryGates([{ channel: "email", live: true }]);
  const r = buildPublicPricing(prices, providers);
  for (const code of ["KP", "IR", "SY", "CU", "AQ"]) assert.ok(!r.countries.some((c) => c.code === code), code);
});
