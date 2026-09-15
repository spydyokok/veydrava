import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { planPayment } from "../agent/plan.mjs";
const merchant = "0x2222222222222222222222222222222222222222";
async function withModel(result, fn) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: { content: JSON.stringify(result) } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const args = {
  prompt: "Pay the merchant 12.5 tokens",
  merchants: [{ name: "Merchant", address: merchant }],
  model: "test-model",
};
test("planner output is review-only and cannot sign or execute", async () => {
  await withModel(
    { recipient: merchant, amount: "12.5", memo: "Invoice" },
    async (endpoint) => {
      const result = await planPayment({ ...args, endpoint });
      assert.equal(result.requiresHumanReview, true);
      assert.equal(result.amount, "12.5");
      assert.equal(result.signature, undefined);
    },
  );
});
test("planner rejects hallucinated recipients", async () => {
  await withModel(
    {
      recipient: "0x3333333333333333333333333333333333333333",
      amount: "12.5",
      memo: "Invoice",
    },
    async (endpoint) => {
      await assert.rejects(() => planPayment({ ...args, endpoint }));
    },
  );
});
test("planner rejects numeric amounts and remote endpoints", async () => {
  await withModel(
    { recipient: merchant, amount: 12.5, memo: "Invoice" },
    async (endpoint) => {
      await assert.rejects(() => planPayment({ ...args, endpoint }));
    },
  );
  await assert.rejects(() =>
    planPayment({ ...args, endpoint: "https://example.com" }),
  );
});
