import { parseArgs } from "node:util";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import {
  artifact,
  buildIntent,
  signIntent,
  relay,
  reasons,
} from "../sdk/index.mjs";
const { values } = parseArgs({
  options: {
    recipient: { type: "string" },
    amount: { type: "string" },
    memo: { type: "string", default: "" },
    submit: { type: "boolean", default: false },
    ttl: { type: "string", default: "900" },
  },
});
try {
  for (const key of ["RPC_URL", "VAULT_ADDRESS", "AGENT_PRIVATE_KEY"])
    if (!process.env[key])
      throw new Error(`Set ${key} in your local environment`);
  const provider = new JsonRpcProvider(process.env.RPC_URL),
    signer = new Wallet(process.env.AGENT_PRIVATE_KEY, provider),
    chainId = Number(process.env.CHAIN_ID || 11155111);
  const v = new Contract(process.env.VAULT_ADDRESS, artifact.abi, provider);
  if (
    (await v.owner()).toLowerCase() ===
    (await signer.getAddress()).toLowerCase()
  )
    throw new Error("Do not use your owner key as the agent key");
  const intent = await buildIntent({
    provider,
    vault: process.env.VAULT_ADDRESS,
    agent: await signer.getAddress(),
    recipient: values.recipient,
    amount: values.amount,
    memo: values.memo,
    ttl: Number(values.ttl),
    expectedChain: chainId,
  });
  const decision = Number(await v.previewSpend(intent));
  if (decision !== 0 && decision !== 15)
    throw new Error(`Policy rejected: ${reasons[decision]}`);
  const envelope = await signIntent({
    signer,
    vault: process.env.VAULT_ADDRESS,
    intent,
    chainId,
  });
  if (values.submit) {
    if (!process.env.RELAYER_URL || !process.env.RELAYER_AUTH_TOKEN)
      throw new Error("Set RELAYER_URL and RELAYER_AUTH_TOKEN");
    const result = await relay({
      url: process.env.RELAYER_URL,
      token: process.env.RELAYER_AUTH_TOKEN,
      envelope,
    });
    console.log(JSON.stringify({ envelope, relay: result }, null, 2));
  } else console.log(JSON.stringify(envelope, null, 2));
  provider.destroy();
} catch (e) {
  console.error(e.shortMessage || e.message);
  process.exitCode = 1;
}
