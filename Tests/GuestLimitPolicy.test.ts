import { test } from "node:test";
import assert from "node:assert/strict";
import { GuestLimitError, GuestLimitPolicy } from "../Source/Managers/GuestLimitPolicy";

test("guests may hold up to three songs", () => {
  const policy = new GuestLimitPolicy();
  assert.equal(policy.wouldExceed(0, 3), false);
  assert.equal(policy.wouldExceed(2, 1), false);
  assert.equal(policy.wouldExceed(3, 1), true);
  assert.equal(policy.wouldExceed(0, 20), true);
  assert.equal(policy.remaining(1), 2);
  assert.throws(() => policy.assertAllowed(1, 3), GuestLimitError);
  assert.doesNotThrow(() => policy.assertAllowed(1, 2));
});
