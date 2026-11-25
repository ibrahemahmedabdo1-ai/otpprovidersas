import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicPricing } from "./public-pricing";

const prices = [
  { channel: "email", country: "*", micro: "500" },
  { channel: "whatsapp", country: "*", micro: "700" },
  { channel: "whatsapp", country: "EG", micro: "2900" },
  { channel: "whatsapp", country: "SA", micro: "8500" },
];

test("approved Email and WhatsApp prices are public when providers are live", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }, { channel: "whatsapp", live: true }]);
  assert.ok(r.countries.length > 150);
  assert.ok(r.countries.every((c) => c.email === "500" && c.whatsapp !== null));
  assert.equal(r.countries.find((c) => c.code === "EG")?.whatsapp, "2900");
  assert.equal(r.countries.find((c) => c.code === "US")?.whatsapp, "700");
  assert.deepEqual(r.channels, { email: true, whatsapp: true });
});

test("WhatsApp prices stay hidden when its provider is not live", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }, { channel: "whatsapp", live: false }]);
  assert.equal(r.channels.whatsapp, false);
  assert.ok(r.countries.every((country) => country.whatsapp === null));
});

test("prices are hidden when the corresponding provider is unavailable", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: false }, { channel: "whatsapp", live: false }]);
  assert.ok(r.countries.length === 0);
  assert.deepEqual(r.channels, { email: false, whatsapp: false });
});

test("no price is exposed for a channel with no approved price", () => {
  const r = buildPublicPricing([], [{ channel: "email", live: true }, { channel: "whatsapp", live: true }]);
  assert.equal(r.countries.length, 0);
});

test("sanctioned and uninhabited territories are not listed", () => {
  const r = buildPublicPricing(prices, [{ channel: "email", live: true }, { channel: "whatsapp", live: true }]);
  for (const code of ["KP", "IR", "SY", "CU", "AQ"]) assert.ok(!r.countries.some((c) => c.code === code), code);
});
