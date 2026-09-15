import http from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  parseEther,
  parseUnits,
  keccak256,
} from "ethers";
import {
  artifact,
  address,
  validateEnvelope,
  reasons,
} from "../../sdk/index.mjs";

export async function startRelayer(config) {
  const {
    rpcUrl,
    privateKey,
    vaultAddress,
    authToken,
    dbPath = "./data/relayer.sqlite",
    port = 8788,
    host = "127.0.0.1",
    chainId = 11155111,
  } = config;
  if (![11155111, 31337].includes(chainId))
    throw new Error(
      "Relayer is restricted to Sepolia and local Anvil in this release",
    );
  if (typeof authToken !== "string" || authToken.length < 32)
    throw new Error(
      "Use a random RELAYER_AUTH_TOKEN of at least 32 characters",
    );
  const provider = new JsonRpcProvider(rpcUrl),
    signer = new Wallet(privateKey, provider),
    vault = new Contract(address(vaultAddress), artifact.abi, signer);
  if (Number((await provider.getNetwork()).chainId) !== chainId)
    throw new Error("RPC chain mismatch");
  if ((await vault.owner()).toLowerCase() === signer.address.toLowerCase())
    throw new Error("The relayer must not use the owner key");
  const databasePath = resolve(dbPath);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,tx_hash TEXT NOT NULL,raw_tx TEXT NOT NULL,operation TEXT NOT NULL,day INTEGER NOT NULL,reserved_cost TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(bucket INTEGER PRIMARY KEY,count INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const identity = `${chainId}:${address(vaultAddress)}:${signer.address}`;
  const previous = db
    .prepare("SELECT value FROM metadata WHERE key=?")
    .get("identity");
  if (previous && previous.value !== identity)
    throw new Error(
      "This database belongs to a different chain, vault or relayer",
    );
  db.prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES(?,?)").run(
    "identity",
    identity,
  );
  // SQLite singleton lease prevents two processes allocating the same account nonce in one database.
  const leaseOwner = crypto.randomUUID();
  function renewLease() {
    const now = Math.floor(Date.now() / 1000);
    db.exec("BEGIN IMMEDIATE");
    try {
      const held = db
        .prepare("SELECT owner,expires FROM lease WHERE id=1")
        .get();
      if (held && held.owner !== leaseOwner && held.expires > now)
        throw new Error("Another relayer process holds this database");
      db.prepare(
        "INSERT OR REPLACE INTO lease(id,owner,expires) VALUES(1,?,?)",
      ).run(leaseOwner, now + 30);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  renewLease();
  let healthy = true,
    closing = false;
  const leaseTimer = setInterval(() => {
    try {
      renewLease();
    } catch {
      healthy = false;
    }
  }, 10000);
  leaseTimer.unref();
  const expectedAuth = createHash("sha256")
    .update(`Bearer ${authToken}`)
    .digest();
  const maxGas = BigInt(config.maxGas || 800000),
    dailyBudget = parseEther(config.dailyGasBudget || "0.02"),
    feeCap = parseUnits(config.maxFeeGwei || "30", "gwei");
  const requestLimit = Number(config.requestsPerMinute || 30),
    maxDailyRequests = Number(config.maxDailyRequests || 200);
  if (
    maxGas <= 0n ||
    dailyBudget <= 0n ||
    feeCap <= 0n ||
    !Number.isSafeInteger(requestLimit) ||
    requestLimit < 1 ||
    !Number.isSafeInteger(maxDailyRequests) ||
    maxDailyRequests < 1
  )
    throw new Error("Invalid sponsor limits");
  const send = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };
  let queue = Promise.resolve();
  let nextNonce;
  async function submit(envelope) {
    if (!healthy || closing) throw new Error("Relayer unavailable");
    renewLease();
    if (Number((await provider.getNetwork()).chainId) !== chainId)
      throw new Error("RPC chain changed");
    // Always re-evaluate current on-chain policy; never accept an action name or arbitrary call data.
    const digest = await vault.hashIntent(envelope.intent);
    // A spent nonce is still an idempotent success when the exact execute job already exists.
    const existingExecute = db
      .prepare("SELECT * FROM jobs WHERE id=?")
      .get(`${digest}:executeSpend`);
    if (existingExecute) return jobResponse(existingExecute);
    const decision = Number(await vault.previewSpend(envelope.intent));
    if (decision !== 0 && decision !== 15)
      throw new Error(`Policy rejected: ${reasons[decision]}`);
    const operation = decision === 15 ? "submitIntent" : "executeSpend",
      id = `${digest}:${operation}`;
    const existing = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
    if (existing) return jobResponse(existing);
    const day = Math.floor(Date.now() / 86400000),
      jobs = db.prepare("SELECT reserved_cost FROM jobs WHERE day=?").all(day);
    if (jobs.length >= maxDailyRequests)
      throw new Error("Daily sponsorship request limit reached");
    const args = [envelope.intent, envelope.signature];
    await vault[operation].staticCall(...args);
    const estimate = await vault[operation].estimateGas(...args),
      gasLimit = (estimate * 120n) / 100n + 10000n;
    if (gasLimit > maxGas)
      throw new Error("Gas estimate exceeds sponsor limit");
    const fee = await provider.getFeeData();
    if (!fee.maxFeePerGas || fee.maxFeePerGas > feeCap)
      throw new Error("Network fee exceeds sponsor cap");
    const reserved = gasLimit * fee.maxFeePerGas;
    if (
      jobs.reduce((sum, j) => sum + BigInt(j.reserved_cost), 0n) + reserved >
      dailyBudget
    )
      throw new Error("Daily gas budget reached");
    if ((await provider.getBalance(signer.address)) < reserved)
      throw new Error("Relayer needs Sepolia ETH");
    const networkNonce = await provider.getTransactionCount(
      signer.address,
      "pending",
    );
    nextNonce = Math.max(nextNonce ?? networkNonce, networkNonce);
    const populated = await vault[operation].populateTransaction(...args);
    const transaction = {
      to: address(vaultAddress),
      data: populated.data,
      value: 0n,
      chainId,
      nonce: nextNonce,
      type: 2,
      gasLimit,
      maxFeePerGas: fee.maxFeePerGas,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n,
    };
    const raw = await signer.signTransaction(transaction),
      hash = keccak256(raw);
    // Persist the EXACT signed bytes before broadcasting. A retry never creates a new transaction.
    db.prepare(
      "INSERT INTO jobs(id,tx_hash,raw_tx,operation,day,reserved_cost,created) VALUES(?,?,?,?,?,?,?)",
    ).run(id, hash, raw, operation, day, String(reserved), Date.now());
    nextNonce++;
    try {
      await provider.broadcastTransaction(raw);
    } catch {
      healthy = false;
      throw new Error(
        "Broadcast outcome uncertain. Restart the relayer to recover the persisted transaction.",
      );
    }
    return { id, transactionHash: hash, operation, status: "submitted" };
  }
  async function jobResponse(job) {
    const receipt = await provider.getTransactionReceipt(job.tx_hash);
    return {
      id: job.id,
      transactionHash: job.tx_hash,
      operation: job.operation,
      status: receipt
        ? receipt.status === 1
          ? "confirmed"
          : "reverted"
        : "submitted",
    };
  }
  // Re-broadcast any missing prepared transaction before accepting new work. Same bytes, same hash.
  try {
    const jobs = db.prepare("SELECT * FROM jobs ORDER BY created ASC").all();
    for (const job of jobs) {
      if (await provider.getTransactionReceipt(job.tx_hash)) continue;
      if (await provider.getTransaction(job.tx_hash)) continue;
      try {
        await provider.broadcastTransaction(job.raw_tx);
      } catch {
        throw new Error(
          `Recovery needed for ${job.tx_hash}; inspect this transaction before restarting`,
        );
      }
    }
  } catch (e) {
    clearInterval(leaseTimer);
    db.prepare("DELETE FROM lease WHERE owner=?").run(leaseOwner);
    db.close();
    provider.destroy();
    throw e;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Connection", "close");
    if (req.method === "GET" && req.url === "/health")
      return send(res, healthy ? 200 : 503, {
        status: healthy ? "ok" : "unavailable",
        chainId,
        vault: address(vaultAddress),
      });
    if (req.method !== "POST" || req.url !== "/v1/intents")
      return send(res, 404, { error: "Not found" });
    const supplied = createHash("sha256")
      .update(String(req.headers.authorization || ""))
      .digest();
    if (!timingSafeEqual(expectedAuth, supplied))
      return send(res, 401, { error: "Unauthorized" });
    if (!healthy || closing)
      return send(res, 503, { error: "Relayer unavailable" });
    if (!String(req.headers["content-type"]).startsWith("application/json"))
      return send(res, 415, { error: "Expected application/json" });
    const bucket = Math.floor(Date.now() / 60000);
    const count =
      db.prepare("SELECT count FROM limits WHERE bucket=?").get(bucket)
        ?.count || 0;
    if (count >= requestLimit)
      return send(res, 429, { error: "Rate limit exceeded" });
    db.prepare(
      "INSERT INTO limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
    ).run(bucket);
    db.prepare("DELETE FROM limits WHERE bucket<?").run(bucket - 1440);
    let body = "";
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16384)
          return send(res, 413, { error: "Request too large" });
        body += chunk.toString("utf8");
      }
      const envelope = validateEnvelope(
        JSON.parse(body),
        vaultAddress,
        chainId,
      );
      const result = queue.then(() => submit(envelope));
      queue = result.catch(() => {});
      return send(res, 202, await result);
    } catch (e) {
      const message = e.shortMessage || e.message || "Request failed";
      send(res, 400, { error: String(message).slice(0, 250) });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.timeout = 60000;
  server.maxHeadersCount = 20;
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, host, accept);
  });
  return {
    server,
    port: server.address().port,
    close: async () => {
      closing = true;
      await new Promise((done) => server.close(done));
      await queue;
      clearInterval(leaseTimer);
      db.prepare("DELETE FROM lease WHERE owner=?").run(leaseOwner);
      db.close();
      provider.destroy();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const env = process.env;
  try {
    for (const key of [
      "RPC_URL",
      "VAULT_ADDRESS",
      "RELAYER_PRIVATE_KEY",
      "RELAYER_AUTH_TOKEN",
    ])
      if (!env[key]) throw new Error(`Set ${key}`);
    const app = await startRelayer({
      rpcUrl: env.RPC_URL,
      privateKey: env.RELAYER_PRIVATE_KEY,
      vaultAddress: env.VAULT_ADDRESS,
      authToken: env.RELAYER_AUTH_TOKEN,
      dbPath: env.RELAYER_DB || "./data/relayer.sqlite",
      host: env.RELAYER_HOST || "127.0.0.1",
      port: Number(env.RELAYER_PORT || 8788),
      chainId: Number(env.CHAIN_ID || 11155111),
      maxFeeGwei: env.RELAYER_MAX_FEE_GWEI,
      dailyGasBudget: env.RELAYER_DAILY_GAS_BUDGET,
      maxGas: env.RELAYER_MAX_GAS,
      requestsPerMinute: env.RELAYER_REQUESTS_PER_MINUTE,
      maxDailyRequests: env.RELAYER_MAX_DAILY_REQUESTS,
    });
    console.log(
      `Veydrava relayer ready on ${env.RELAYER_HOST || "127.0.0.1"}:${app.port}`,
    );
    for (const event of ["SIGINT", "SIGTERM"])
      process.once(event, () => app.close().then(() => process.exit(0)));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
