import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JsonRpcProvider, Wallet, ContractFactory, parseEther } from "ethers";
import {
  buildIntent,
  signIntent,
  artifact,
  validateEnvelope,
  tokenAmount,
} from "../sdk/index.mjs";
import { startRelayer } from "../services/relayer/server.mjs";
let node,
  provider,
  owner,
  vault,
  token,
  agent,
  merchant,
  relayer,
  service,
  dir,
  config,
  firstEnvelope,
  firstResponse;
const auth = "integration-test-only-token-000000000000000000";
async function request(body, authorization = `Bearer ${auth}`) {
  const r = await fetch(`http://127.0.0.1:${service.port}/v1/intents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function envelope(amount = "25") {
  const i = await buildIntent({
    provider,
    vault: await vault.getAddress(),
    agent: agent.address,
    recipient: merchant.address,
    amount,
    memo: "integration invoice",
    expectedChain: 31337,
  });
  return signIntent({
    signer: agent,
    vault: await vault.getAddress(),
    intent: i,
    chainId: 31337,
  });
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "veydrava-integration-"));
  const platform =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : null;
  if (!platform)
    throw new Error("Run the integration suite on Linux, macOS, or WSL");
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  node = spawn(
    resolve(`node_modules/@foundry-rs/anvil-${platform}-${arch}/bin/anvil`),
    [
      "--port",
      "19545",
      "--chain-id",
      "31337",
      "--hardfork",
      "cancun",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://127.0.0.1:19545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (r.ok) break;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  provider = new JsonRpcProvider("http://127.0.0.1:19545", undefined, {
    cacheTimeout: -1,
  });
  provider.pollingInterval = 30;
  owner = await provider.getSigner(0);
  agent = Wallet.createRandom().connect(provider);
  merchant = Wallet.createRandom();
  relayer = Wallet.createRandom().connect(provider);
  const usd = JSON.parse(
    await readFile(
      new URL("../lib/veydrava/artifacts/TestUSD.json", import.meta.url),
      "utf8",
    ),
  );
  token = await new ContractFactory(usd.abi, usd.bytecode, owner).deploy();
  await token.waitForDeployment();
  vault = await new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    owner,
  ).deploy(await owner.getAddress(), await token.getAddress(), 500e6);
  await vault.waitForDeployment();
  await (await token.faucet()).wait();
  await (await token.approve(await vault.getAddress(), 2000e6)).wait();
  await (await vault.deposit(2000e6)).wait();
  const block = await provider.getBlock("latest");
  await (
    await vault.setPolicy(
      agent.address,
      100e6,
      250e6,
      1000e6,
      50e6,
      block.timestamp + 86400,
    )
  ).wait();
  await (
    await vault.setRecipient(agent.address, merchant.address, true)
  ).wait();
  await (
    await owner.sendTransaction({ to: relayer.address, value: parseEther("1") })
  ).wait();
  config = {
    rpcUrl: "http://127.0.0.1:19545",
    privateKey: relayer.privateKey,
    vaultAddress: await vault.getAddress(),
    authToken: auth,
    dbPath: join(dir, "relayer.sqlite"),
    port: 0,
    chainId: 31337,
  };
  service = await startRelayer(config);
});
after(async () => {
  await service?.close();
  provider?.destroy();
  node?.kill("SIGTERM");
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("SDK rejects floats, exponents and oversized values", () => {
  assert.throws(() => tokenAmount("1e3", 6));
  assert.throws(() => tokenAmount(0.1, 6));
  assert.throws(() => tokenAmount("-1", 6));
  assert.equal(tokenAmount("0.000001", 6), 1n);
});
test("relayer rejects unauthenticated requests without spending gas", async () => {
  const r = await request({}, "Bearer wrong");
  assert.equal(r.status, 401);
  assert.equal(await provider.getTransactionCount(relayer.address), 0);
});
test("SDK EIP712 matches Solidity and relay executes an exact payment", async () => {
  firstEnvelope = await envelope();
  firstResponse = await request(firstEnvelope);
  assert.equal(firstResponse.status, 202, JSON.stringify(firstResponse.body));
  const receipt = await provider.waitForTransaction(
    firstResponse.body.transactionHash,
    1,
    10000,
  );
  assert.equal(receipt.status, 1);
  assert.equal(await token.balanceOf(merchant.address), 25_000_000n);
  assert.equal(await vault.nonces(agent.address), 1n);
});
test("retries return the same transaction and cannot replay payment", async () => {
  const retry = await request(firstEnvelope);
  assert.equal(retry.body.transactionHash, firstResponse.body.transactionHash);
  assert.equal(await vault.nonces(agent.address), 1n);
});
test("SQLite idempotency survives a relayer restart", async () => {
  await service.close();
  service = await startRelayer(config);
  const retry = await request(firstEnvelope);
  assert.equal(retry.body.transactionHash, firstResponse.body.transactionHash);
  assert.equal(await token.balanceOf(merchant.address), 25_000_000n);
});
test("signature tampering is rejected before broadcasting", async () => {
  const e = await envelope("10");
  e.intent.amount = "11000000";
  const r = await request(e);
  assert.equal(r.status, 400);
  assert.equal(await vault.nonces(agent.address), 1n);
});
test("requests cannot target another vault or chain", async () => {
  const e = await envelope("10");
  e.chainId = 1;
  assert.equal((await request(e)).status, 400);
  e.chainId = 31337;
  e.vault = merchant.address;
  assert.equal((await request(e)).status, 400);
});
test("hard caps reject valid signatures with excessive amounts", async () => {
  const e = await envelope("101");
  const r = await request(e);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /limit/i);
  assert.equal(await token.balanceOf(merchant.address), 25_000_000n);
});
test("above-threshold intent persists, owner approves, and exact request executes", async () => {
  const e = await envelope("70");
  const pending = await request(e);
  assert.equal(pending.status, 202, JSON.stringify(pending.body));
  assert.equal(pending.body.operation, "submitIntent");
  await provider.waitForTransaction(pending.body.transactionHash, 1, 10000);
  assert.equal(
    (await vault.getPendingIntent(agent.address))[0].amount,
    70_000_000n,
  );
  assert.equal(await vault.nonces(agent.address), 1n);
  await (await vault.setIntentApproval(e.intent, true)).wait();
  const paid = await request(e);
  assert.equal(paid.status, 202, JSON.stringify(paid.body));
  assert.equal(paid.body.operation, "executeSpend");
  await provider.waitForTransaction(paid.body.transactionHash, 1, 10000);
  assert.equal(await token.balanceOf(merchant.address), 95_000_000n);
  assert.equal(
    (await vault.getPendingIntent(agent.address))[0].agent,
    "0x0000000000000000000000000000000000000000",
  );
});
test("oversized requests are rejected", async () => {
  const r = await request({ padding: "x".repeat(17000) });
  assert.equal(r.status, 413);
});
test("pause blocks relayed payments without advancing the nonce", async () => {
  const e = await envelope("5");
  await (await vault.pause()).wait();
  assert.equal((await request(e)).status, 400);
  assert.equal(await vault.nonces(agent.address), 2n);
});
