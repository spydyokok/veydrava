import { parseArgs } from "node:util";
import { JsonRpcProvider, Contract } from "ethers";
import { artifact, address } from "../sdk/index.mjs";
const { values } = parseArgs({
  options: { from: { type: "string" }, to: { type: "string" } },
});
try {
  if (!process.env.RPC_URL || !process.env.VAULT_ADDRESS || !values.from)
    throw new Error("Set RPC_URL, VAULT_ADDRESS, and --from deployment-block");
  const p = new JsonRpcProvider(process.env.RPC_URL),
    chain = Number((await p.getNetwork()).chainId);
  if (chain !== Number(process.env.CHAIN_ID || 11155111))
    throw new Error("RPC chain mismatch");
  const start = Number(values.from),
    end = values.to
      ? Number(values.to)
      : Math.max(0, (await p.getBlockNumber()) - 12);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  )
    throw new Error("Invalid block range");
  const v = new Contract(address(process.env.VAULT_ADDRESS), artifact.abi, p);
  // Stream NDJSON to stdout. Redirect to a file; no unbounded history held in memory.
  for (let from = start; from <= end; from += 1000) {
    const logs = await v.queryFilter(
      v.filters.SpendExecuted(),
      from,
      Math.min(end, from + 999),
    );
    for (const l of logs) {
      const a = l.args;
      console.log(
        JSON.stringify({
          chainId: chain,
          vault: await v.getAddress(),
          block: l.blockNumber,
          blockHash: l.blockHash,
          tx: l.transactionHash,
          digest: a.digest,
          agent: a.agent,
          recipient: a.recipient,
          amountBaseUnits: String(a.amount),
          nonce: String(a.nonce),
          memoHash: a.memo,
        }),
      );
    }
  }
  p.destroy();
} catch (e) {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
}
