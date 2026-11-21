import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, filterRows, flagClass, formatUsd } from "../src/lib/pricing.ts";

const data = [
  { code: "EG", email: "5000", whatsapp: "45000" },
  { code: "US", email: "5000", whatsapp: null },
  { code: "DE", email: "5000", whatsapp: "123400" },
];

test("USD formatting: 2 to 4 decimals", () => {
  assert.equal(formatUsd("5000"), "$0.005");
  assert.equal(formatUsd("45000"), "$0.045");
  assert.equal(formatUsd("123400"), "$0.1234");
  assert.equal(formatUsd("1000000"), "$1.00");
  assert.equal(formatUsd("100"), "$0.0001");
});

test("flag class matches the country code", () => {
  assert.equal(flagClass("EG"), "fi fi-eg");
  assert.equal(flagClass("DE"), "fi fi-de");
});

test("rows keep WhatsApp and Email values in their own fields and null stays null", () => {
  const rows = buildRows(data, "en");
  const us = rows.find((r) => r.code === "US")!;
  assert.equal(us.whatsapp, null);
  assert.equal(us.email, "5000");
  const de = rows.find((r) => r.code === "DE")!;
  assert.equal(formatUsd(de.whatsapp!), "$0.1234");
  assert.equal(formatUsd(de.email!), "$0.005");
});

test("alphabetical sort in both directions and per locale", () => {
  assert.deepEqual(buildRows(data, "en").map((r) => r.name), ["Egypt", "Germany", "United States"]);
  assert.deepEqual(buildRows(data, "en", false).map((r) => r.name), ["United States", "Germany", "Egypt"]);
  assert.equal(buildRows(data, "ar").find((r) => r.code === "EG")!.name, "مصر");
});

test("search matches local name, English name and code", () => {
  const rows = buildRows(data, "ar");
  assert.deepEqual(filterRows(rows, "مصر").map((r) => r.code), ["EG"]);
  assert.deepEqual(filterRows(rows, "germ").map((r) => r.code), ["DE"]);
  assert.deepEqual(filterRows(rows, "us").map((r) => r.code), ["US"]);
  assert.equal(filterRows(rows, "zzzz").length, 0);
});
