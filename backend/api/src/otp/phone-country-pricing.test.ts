import test from "node:test";
import assert from "node:assert/strict";
import { countryForE164 } from "./phone-country-pricing";

test("WhatsApp pricing country is derived from E.164 calling code", () => {
  assert.equal(countryForE164("+201279797964"), "EG");
  assert.equal(countryForE164("+971501234567"), "AE");
  assert.equal(countryForE164("+966501234567"), "SA");
  assert.equal(countryForE164("+4915112345678"), "DE");
  assert.equal(countryForE164("+447700900123"), "GB");
  assert.equal(countryForE164("+919876543210"), "IN");
  assert.equal(countryForE164("+905551234567"), "TR");
  assert.equal(countryForE164("+27821234567"), "ZA");
});

test("shared +1 calling code and unknown codes use the global fallback price", () => {
  assert.equal(countryForE164("+14155552671"), "*");
  assert.equal(countryForE164("+14165552671"), "*");
});
