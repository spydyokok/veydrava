import {
  BrowserProvider,
  Contract,
  ContractFactory,
  formatUnits,
  getAddress,
  isAddress,
  type Eip1193Provider,
  type TransactionResponse,
} from "ethers";
import vaultArtifact from "./artifacts/VeydravaVault.json";
import { CHAIN_ID, POLICY_REASONS } from "./config";
import type { Agent, Envelope, Intent, Snapshot, Receipt } from "./model";
export type Injected = Eip1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};
declare global {
  interface Window {
    ethereum?: Injected;
  }
}
export const tokenAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function faucet()",
];
export function normalize(address: string) {
  if (!isAddress(address.toLowerCase()))
    throw new Error("Enter a valid 0x wallet address.");
  return getAddress(address.toLowerCase());
}
export function getProvider() {
  if (!window.ethereum)
    throw new Error(
      "Open this app in a browser with MetaMask or an Ethereum wallet installed.",
    );
  return new BrowserProvider(window.ethereum, "any");
}
export async function assertChain(provider: BrowserProvider) {
  const id = Number(await provider.send("eth_chainId", []));
  if (id !== CHAIN_ID)
    throw new Error("Switch your wallet to Sepolia to continue.");
}
export function getVault(address: string, provider: BrowserProvider) {
  return new Contract(normalize(address), vaultArtifact.abi, provider);
}
export function toIntent(raw: Record<string, unknown>): Intent {
  return Object.fromEntries(
    [
      "agent",
      "recipient",
      "amount",
      "nonce",
      "deadline",
      "policyVersion",
      "epoch",
      "memo",
    ].map((k) => [k, String(raw[k])]),
  ) as Intent;
}
export async function snapshot(
  provider: BrowserProvider,
  address: string,
  startBlock: number,
): Promise<Snapshot> {
  await assertChain(provider);
  if ((await provider.getCode(address)) === "0x")
    throw new Error("No contract found at this address on Sepolia.");
  const v = getVault(address, provider);
  const [owner, asset, decimals, globalLimit, paused, day, epoch, count] =
    await Promise.all([
      v.owner(),
      v.asset(),
      v.assetDecimals(),
      v.globalDailyLimit(),
      v.paused(),
      v.currentDay(),
      v.authorizationEpoch(),
      v.agentCount(),
    ]);
  const n = Number(decimals),
    token = new Contract(asset, tokenAbi, provider);
  const [balance, spent, symbol] = await Promise.all([
    token.balanceOf(address),
    v.globalDailySpent(day),
    token.symbol(),
  ]);
  const agents: Agent[] = [],
    pending: Snapshot["pending"] = [];
  for (let offset = 0; offset < Number(count); offset += 50) {
    const addresses: string[] = await v.getAgents(offset, 50);
    const rows = await Promise.all(
      addresses.map(async (a) => {
        const [p, used, life, nonce, recipientCount, pendingResult] =
          await Promise.all([
            v.policies(a),
            v.dailySpent(a, day),
            v.lifetimeSpent(a),
            v.nonces(a),
            v.recipientCount(a),
            v.getPendingIntent(a),
          ]);
        const recipients: string[] = [];
        for (let o = 0; o < Number(recipientCount); o += 100) {
          const rs: string[] = await v.getRecipients(a, o, 100);
          const flags = await Promise.all(rs.map((r) => v.recipients(a, r)));
          rs.forEach((r, i) => {
            if (flags[i]) recipients.push(r);
          });
        }
        if (
          pendingResult[0].agent !==
          "0x0000000000000000000000000000000000000000"
        ) {
          const i = toIntent(pendingResult[0]);
          const decision = Number(await v.previewSpend(i));
          pending.push({
            id: await v.hashIntent(i),
            agent: a,
            recipient: i.recipient,
            amount: formatUnits(i.amount, n),
            title: "Agent payment request",
            decision,
            envelope: {
              chainId: CHAIN_ID,
              vault: address,
              intent: i,
              signature: pendingResult[1],
            },
          });
        }
        return {
          address: a,
          name: `Agent ${a.slice(0, 6)}`,
          description: `${recipients.length} approved recipient${recipients.length === 1 ? "" : "s"}`,
          perPayment: formatUnits(p.perPayment, n),
          dailyLimit: formatUnits(p.dailyLimit, n),
          lifetimeLimit: formatUnits(p.lifetimeLimit, n),
          approvalThreshold: formatUnits(p.approvalThreshold, n),
          spent: formatUnits(used, n),
          lifetimeSpent: formatUnits(life, n),
          validUntil: Number(p.validUntil),
          version: String(p.version),
          epoch: String(p.epoch),
          nonce: String(nonce),
          active:
            p.active &&
            p.epoch === epoch &&
            Number(p.validUntil) > Date.now() / 1000,
          recipients,
        };
      }),
    );
    agents.push(...rows);
  }
  const head = await provider.getBlockNumber();
  // A bounded recent window protects browser RPC quotas. All policies/approvals are read from storage.
  const historyFrom = Math.max(0, startBlock, head - 9999);
  const receipts: Receipt[] = [];
  for (let from = historyFrom; from <= head; from += 2000) {
    const logs = await v.queryFilter(
      v.filters.SpendExecuted(),
      from,
      Math.min(head, from + 1999),
    );
    for (const log of logs) {
      if (!("args" in log)) continue;
      const a = log.args;
      receipts.push({
        id: a.digest,
        title: "Agent payment",
        agent: a.agent,
        recipient: a.recipient,
        amount: formatUnits(a.amount, n),
        status: "Paid",
        time: `Block ${log.blockNumber.toLocaleString("en-US")}`,
        tx: log.transactionHash,
        block: log.blockNumber,
        memo: a.memo,
      });
    }
  }
  return {
    balance: formatUnits(balance, n),
    spent: formatUnits(spent, n),
    globalLimit: formatUnits(globalLimit, n),
    paused,
    owner,
    asset,
    decimals: n,
    symbol,
    epoch: String(epoch),
    agents,
    pending,
    receipts: receipts.reverse(),
    historyFrom,
    historyTo: head,
  };
}
export async function verifiedSigner(
  provider: BrowserProvider,
  expected: string,
) {
  await assertChain(provider);
  const signer = await provider.getSigner();
  if ((await signer.getAddress()).toLowerCase() !== expected.toLowerCase())
    throw new Error("Your connected account changed. Reconnect your wallet.");
  return signer;
}
export async function contractWrite(
  provider: BrowserProvider,
  account: string,
  address: string,
  method: string,
  args: unknown[],
  notify: (message: string) => void,
) {
  const signer = await verifiedSigner(provider, account);
  const v = new Contract(normalize(address), vaultArtifact.abi, signer);
  await v[method].staticCall(...args);
  notify("Review the transaction in your wallet.");
  const tx: TransactionResponse = await v[method](...args);
  notify(`Submitted ${tx.hash.slice(0, 10)}… Waiting for 2 confirmations.`);
  const receipt = await tx.wait(2);
  if (!receipt || receipt.status !== 1)
    throw new Error("The transaction did not succeed.");
  return receipt;
}
export async function deployContract(
  provider: BrowserProvider,
  account: string,
  name: "VeydravaVault" | "TestUSD",
  args: unknown[],
  notify: (message: string) => void,
) {
  const signer = await verifiedSigner(provider, account);
  const artifact =
    name === "VeydravaVault"
      ? vaultArtifact
      : (await import("./artifacts/TestUSD.json")).default;
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  notify(
    `Review ${name === "VeydravaVault" ? "vault" : "test token"} deployment in your wallet.`,
  );
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  notify("Deployment submitted. Waiting for 2 confirmations.");
  const receipt = await tx?.wait(2);
  if (!receipt || receipt.status !== 1)
    throw new Error("Deployment did not succeed.");
  return { address: await contract.getAddress(), block: receipt.blockNumber };
}
export function readableError(error: unknown) {
  const e = error as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    revert?: { name?: string; args?: unknown[] };
    code?: string;
  };
  if (e.code === "ACTION_REJECTED") return "You cancelled the wallet request.";
  if (e.revert?.name === "PolicyViolation")
    return (
      POLICY_REASONS[Number(e.revert.args?.[0])] ??
      "The contract rejected this payment."
    );
  return (
    e.reason ||
    e.shortMessage ||
    e.message ||
    "Something went wrong. Please retry."
  ).slice(0, 280);
}
export function parseEnvelope(text: string, vault: string): Envelope {
  if (text.length > 16384) throw new Error("Request is too large.");
  const e = JSON.parse(text) as Envelope;
  if (Number(e.chainId) !== CHAIN_ID || normalize(e.vault) !== normalize(vault))
    throw new Error("This request belongs to a different vault or network.");
  for (const key of ["agent", "recipient"] as const) normalize(e.intent[key]);
  for (const key of [
    "amount",
    "nonce",
    "deadline",
    "policyVersion",
    "epoch",
  ] as const) {
    if (typeof e.intent[key] !== "string" || !/^\d+$/.test(e.intent[key]))
      throw new Error(`Invalid ${key}; use an integer string in base units.`);
    if (BigInt(e.intent[key]) >= 2n ** 256n)
      throw new Error("Value exceeds uint256.");
  }
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(e.intent.memo) ||
    !/^0x(?:[0-9a-fA-F]{2}){1,4096}$/.test(e.signature)
  )
    throw new Error("Invalid memo or signature.");
  return e;
}
