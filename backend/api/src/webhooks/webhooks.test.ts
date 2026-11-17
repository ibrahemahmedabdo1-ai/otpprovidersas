import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isSafeWebhookUrl, isPublicIp } from "./ssrf";
import { nextDelaySeconds, signWebhook } from "./signing";

test("webhook urls: only public https hosts", () => {
  assert.equal(isSafeWebhookUrl("https://example.com/hook"), true);
  for (const bad of ["http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest", "https://user:pw@example.com/", "https://foo.internal/x", "https://[::1]/x", "not a url", "https://intranet/x"])
    assert.equal(isSafeWebhookUrl(bad), false, bad);
});
test("private and public ip classification", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  for (const ip of ["192.168.1.1", "172.16.0.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1"]) assert.equal(isPublicIp(ip), false, ip);
});
test("signature is hmac-sha256 over `${t}.${body}`", () => {
  const h = signWebhook("whsec_x", '{"a":1}', 1700000000);
  assert.equal(h, `t=1700000000,v1=${createHmac("sha256", "whsec_x").update('1700000000.{"a":1}').digest("hex")}`);
});
test("backoff grows, then the delivery is dead", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(nextDelaySeconds), [60, 300, 1800, 7200, 21600]);
  assert.equal(nextDelaySeconds(6), null);
});
