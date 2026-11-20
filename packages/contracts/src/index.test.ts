import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  availableSats,
  isValidIdempotencyKey,
  preimageMatches,
  signHmacSha512,
  verifyHmacSha512,
} from "./index.ts";

test("preimage hash must match the payment hash", () => {
  const preimage = Buffer.from("flow-testnet-preimage");
  const hash = createHash("sha256").update(preimage).digest("hex");
  assert.equal(preimageMatches(preimage.toString("base64"), hash), true);
  assert.equal(preimageMatches(preimage.toString("base64"), "00"), false);
});

test("hmac rejects a tampered body and a short signature", () => {
  const secret = "test-secret";
  const body = Buffer.from('{"event":"payout.withdrawal.success"}');
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  assert.equal(verifyHmacSha512(body, signature, secret), true);
  assert.equal(verifyHmacSha512(Buffer.from(body.toString() + " "), signature, secret), false);
  assert.equal(verifyHmacSha512(body, "abcd", secret), false);
});

test("signHmacSha512 matches verifyHmacSha512", () => {
  const secret = "flw_whsec_test";
  const body = Buffer.from('{"type":"payment.paid","data":{"id":"pay_1"}}');
  const signature = signHmacSha512(body, secret);
  assert.equal(verifyHmacSha512(body, signature, secret), true);
  assert.equal(signHmacSha512(body.toString("utf8"), secret), signature);
});

test("idempotency keys must be long enough", () => {
  assert.equal(isValidIdempotencyKey("short"), false);
  assert.equal(isValidIdempotencyKey("order_ref_1"), true);
  assert.equal(isValidIdempotencyKey(12), false);
  assert.equal(isValidIdempotencyKey(undefined), false);
});

test("available balance subtracts reserved sats", () => {
  assert.equal(availableSats(10_000n, 2_500n), 7_500n);
});
