import { readFileSync } from "node:fs";
import {
  Contract,
  getAddress,
  isAddress,
  parseUnits,
  keccak256,
  toUtf8Bytes,
} from "ethers";
export const artifact = JSON.parse(
  readFileSync(
    new URL("../lib/veydrava/artifacts/VeydravaVault.json", import.meta.url),
    "utf8",
  ),
);
export const types = {
  SpendIntent: [
    { name: "agent", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "policyVersion", type: "uint256" },
    { name: "epoch", type: "uint256" },
    { name: "memo", type: "bytes32" },
  ],
};
export const reasons = [
  "Allowed",
  "Vault paused",
  "Agent inactive",
  "Agent expired",
  "Policy changed",
  "Authorization revoked",
  "Recipient not allowed",
  "Zero amount",
  "Intent expired",
  "Wrong nonce",
  "Per-payment limit exceeded",
  "Agent daily budget exceeded",
  "Lifetime budget exceeded",
  "Vault daily budget exceeded",
  "Insufficient balance",
  "Owner approval required",
];
export function address(value) {
  if (typeof value !== "string" || !isAddress(value.toLowerCase()))
    throw new Error("Invalid address");
  return getAddress(value.toLowerCase());
}
export function tokenAmount(value, decimals) {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^\d+(\.\d+)?$/.test(value)
  )
    throw new Error("Amount must be a decimal string, not a float or exponent");
  const n = parseUnits(value, decimals);
  if (n <= 0n || n >= 2n ** 256n)
    throw new Error("Amount is outside supported bounds");
  return n;
}
export function validateEnvelope(value, expectedVault, expectedChain) {
  if (
    !value ||
    typeof value !== "object" ||
    Number(value.chainId) !== expectedChain ||
    address(value.vault) !== address(expectedVault)
  )
    throw new Error("Wrong vault or network");
  const i = value.intent;
  if (!i || typeof i !== "object") throw new Error("Missing intent");
  const intent = { agent: address(i.agent), recipient: address(i.recipient) };
  for (const field of [
    "amount",
    "nonce",
    "deadline",
    "policyVersion",
    "epoch",
  ]) {
    if (
      typeof i[field] !== "string" ||
      !/^\d{1,78}$/.test(i[field]) ||
      BigInt(i[field]) >= 2n ** 256n
    )
      throw new Error(`Invalid ${field}`);
    intent[field] = i[field];
  }
  if (
    !/^0x[\da-fA-F]{64}$/.test(i.memo) ||
    typeof value.signature !== "string" ||
    !/^0x(?:[\da-fA-F]{2}){1,4096}$/.test(value.signature)
  )
    throw new Error("Invalid memo or signature");
  intent.memo = i.memo;
  return {
    chainId: expectedChain,
    vault: address(expectedVault),
    intent,
    signature: value.signature,
  };
}
export async function buildIntent({
  provider,
  vault,
  agent,
  recipient,
  amount,
  memo = "",
  ttl = 900,
  expectedChain = 11155111,
}) {
  if (![11155111, 31337].includes(expectedChain))
    throw new Error("This release supports Sepolia and local Anvil only");
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChain)
    throw new Error("Unexpected RPC chain");
  if (typeof memo !== "string" || Buffer.byteLength(memo, "utf8") > 240)
    throw new Error("Memo too long");
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600)
    throw new Error("TTL must be 60–3600 seconds");
  const v = new Contract(address(vault), artifact.abi, provider),
    agentAddress = address(agent);
  const [p, nonce, epoch, decimals, block] = await Promise.all([
    v.policies(agentAddress),
    v.nonces(agentAddress),
    v.authorizationEpoch(),
    v.assetDecimals(),
    provider.getBlock("latest"),
  ]);
  if (
    !block ||
    !p.active ||
    Number(p.validUntil) <= block.timestamp ||
    p.epoch !== epoch
  )
    throw new Error("Agent is inactive, expired, or revoked");
  return {
    agent: agentAddress,
    recipient: address(recipient),
    amount: String(tokenAmount(amount, Number(decimals))),
    nonce: String(nonce),
    deadline: String(Math.min(block.timestamp + ttl, Number(p.validUntil))),
    policyVersion: String(p.version),
    epoch: String(epoch),
    memo: keccak256(toUtf8Bytes(memo)),
  };
}
export async function signIntent({
  signer,
  vault,
  intent,
  chainId = 11155111,
}) {
  if (address(await signer.getAddress()) !== address(intent.agent))
    throw new Error("Signer is not the agent");
  if (
    !signer.provider ||
    Number((await signer.provider.getNetwork()).chainId) !== chainId
  )
    throw new Error("Signer network mismatch");
  const signature = await signer.signTypedData(
    {
      name: "VeydravaVault",
      version: "1",
      chainId,
      verifyingContract: address(vault),
    },
    types,
    intent,
  );
  return { chainId, vault: address(vault), intent, signature };
}
export async function preview({ provider, envelope }) {
  const v = new Contract(envelope.vault, artifact.abi, provider);
  const decision = Number(await v.previewSpend(envelope.intent));
  return { decision, reason: reasons[decision] };
}
export async function relay({ url, token, envelope }) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname)
  )
    throw new Error("Remote relayer requires HTTPS");
  const response = await fetch(new URL("/v1/intents", target), {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Relayer returned ${response.status}`);
  return result;
}
