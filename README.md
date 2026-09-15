# Veydrava — owner-controlled agent payments

A complete, original implementation of the agent-budget vault concept, with a working React/TypeScript dashboard, Solidity contracts, a JavaScript SDK, optional local AI planner, restricted gas relayer, and automated security tests.

**Initial owner:** `0xcd25106586c679FA4E1d753914BB9b24240ae588`

**Release status:** tested Sepolia deployment candidate, not an audited mainnet release. No public-chain contracts were deployed while building this project. Deployments require your wallet signature and testnet ETH. The hosted dashboard opens in an explicitly labelled interactive demo.

## What is included

| Component | Implementation |
| --- | --- |
| Vault | Non-upgradeable Solidity 0.8.30, OpenZeppelin 5.6.1 |
| Authorization | EIP-712 signatures; EOA and ERC-1271 agent support |
| Budgets | Per payment, agent daily, agent lifetime, and vault daily caps |
| Approvals | One durable pending request per agent; exact owner approval |
| Permissions | Per-agent recipient allowlists, expiry, revocation and epoch invalidation |
| Ownership | Two-step handover; agent revocation and pause on acceptance |
| Dashboard | React 19, TypeScript, ethers 6, accessible Shadcn primitives |
| Gas sponsorship | Separate Node service, SQLite idempotency and restricted execution |
| Agent | CLI/SDK signs exact intents with a dedicated agent key |
| AI planner | Optional local Ollama integration; draft only, no signing/execution |
| Tests | Foundry unit/fuzz/invariants plus local-chain SDK/relayer integration |
| Delivery | Standard Next.js application, ready for Vercel |

This recreates the useful spending-control workflow from [the reference Spenda project](https://spenda-delta.vercel.app/) with new source. It is not affiliated with its author. This version deliberately uses a signed-intent relayer rather than an ERC-4337 account, bundler or paymaster. It does not implement RWA purchases, risk oracles, automated subscriptions, or fiat merchant integrations. A payment transfers tokens to an approved address; it cannot purchase a real subscription without a merchant integration. Failed on-chain requests revert and do not create event receipts. Demo blocked receipts are clearly identified as sample data.

## Quick start — Windows / WSL, Linux or macOS

The home page introduces Veydrava with an animated title. Select **Explore more** to open the demo workspace at `/dashboard`; select **Home** to return to the introduction. Previously shared `/?view=...` links still open the workspace directly. Animations respect your device's reduced-motion preference.

Use the page links in the dashboard header to jump to any of the eight pages. The Back button and your browser's Back/Forward buttons restore previously visited workspace pages. If you open a workspace page directly, Back returns to Overview. Navigation within the workspace keeps the current wallet session and demo data; the dashboard, forms, and dialogs use a black theme.

Use Node 22.13+ (Node 22 LTS recommended) and npm. On Windows, run this project inside WSL Ubuntu, as with Foundry.

```bash
npm ci
npm run contracts:build
npm run test:contracts
npm run test:integration
npm run dev
```

Open the local address printed by the dev command. The included npm Foundry binaries and pinned solc-js compiler avoid downloading a separate compiler. Native Foundry users can also run `forge test` with the installed Solidity compiler.

Run `npm run build` before deployment. For Vercel, use the Next.js preset with the default `npm run build` command and set `NEXT_PUBLIC_APP_URL` to your production URL. The separate Node relayer is a long-running service and must be hosted independently; it is not a Vercel serverless route.

For Vercel Drop, upload `veydrava-vercel-fixed.zip` at https://vercel.com/drop. The ZIP places `package.json`, `app/`, and `vercel.json` at its root so Vercel detects and builds the Next.js application. Each Vercel Drop creates a new project and URL; open the URL returned by the latest successful deployment.

## Deploy the contracts from your wallet

1. Open **Vault setup**, connect the initial owner wallet, and switch to **Sepolia** (chain ID `11155111`).
2. Obtain Sepolia ETH from a trusted faucet for gas.
3. Choose **Deploy test token**, then **Mint test tokens**. The included `tUSD` token has 6 decimals, unrestricted test minting, no value, and a constructor restricted to Sepolia/local Anvil.
4. Set the vault daily budget and select **Deploy vault**. The constructor owner is your address above. Record the vault address and deployment block.
5. **Fund vault**. Approve only the displayed amount, then confirm the deposit. All deposited tokens become controlled by the vault owner.
6. Create a separate signing account for your agent. Under **Agents**, add that account and set its budgets and expiry.
7. Under **Recipient allowlist**, add the recipient you verified independently. Setting a policy alone permits no recipients.
8. Use the agent SDK or switch your browser wallet to the agent account to sign a payment request. Your owner wallet never signs on behalf of an agent.
9. Requests over the approval threshold go into **Approvals**. The owner first approves the exact intent, then executes it in a separate transaction. A relayer may also execute an already approved intent.

No seed phrase or private key belongs in the dashboard or a chat message.

### Foundry deployment alternative

`contracts/script/Deploy.s.sol` deploys the vault and optionally TestUSD. The release script rejects mainnet chains. Use a local Foundry keystore (`cast wallet import`) rather than putting your owner private key in an environment file.

```bash
# Set these in your shell; GLOBAL_DAILY_LIMIT is in RAW token units.
export OWNER_ADDRESS=0xcd25106586c679FA4E1d753914BB9b24240ae588
export GLOBAL_DAILY_LIMIT=1000000000
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" --account your-local-keystore --broadcast
```

Omitting TOKEN_ADDRESS deploys TestUSD. The 1,000,000,000-unit example represents 1,000 tokens for a 6-decimal token. Verify source on the selected explorer using Solidity 0.8.30, Cancun EVM, optimizer 200 runs, metadata bytecode hash `none`. Browser deployment artifacts and Foundry use matching settings. Archive the deployment transaction, constructor parameters, owner, token address, decimals, chain and block.

## Run an agent

Copy `.env.example` to `.env` locally and fill RPC_URL, VAULT_ADDRESS and a **separate** AGENT_PRIVATE_KEY. Keep the owner key out of this file. Configure its on-chain agent policy first.

```bash
node --env-file=.env agent/run.mjs \
  --recipient 0xYOUR_VERIFIED_RECIPIENT \
  --amount 24.50 \
  --memo "Compute invoice 42"
```

The default output is a signed JSON envelope. It does not broadcast. Use **Make a payment → Import a signed request** to relay it through your wallet. The signature fixes the amount, recipient, chain, vault, nonce, deadline, policy version, authorization epoch and memo hash. Native gas belongs to the submitting wallet/relayer; payment assets belong to the vault.

For gas sponsorship, start the relayer, configure its URL and token, and append `--submit`. Preserve the envelope if approval is needed: retry that same envelope after owner approval instead of generating a different deadline/signature.

### Optional AI planner

Run Ollama locally with an installed model supporting structured output. Replace the example merchant list with reviewed recipients already approved on chain.

```bash
node agent/plan.mjs \
  --model YOUR_INSTALLED_MODEL \
  --merchants agent/merchants.example.json \
  --prompt "Pay the approved compute vendor 24.50 tokens for invoice 42"
```

The planner returns a validated draft with `requiresHumanReview: true`. Review its amount, recipient and memo, then pass those explicit fields to `agent/run.mjs`. The planner is not connected to an execution tool and does not read signing keys. An actual Ollama model is not bundled or running in the hosted dashboard; integration tests use a mock model endpoint.

## Restricted relayer

The separate Node 22 process runs at `127.0.0.1:8788` by default. It requires a funded, dedicated RELAYER_PRIVATE_KEY, a fixed vault, and a random RELAYER_AUTH_TOKEN of at least 32 characters.

```bash
npm run relayer
```

Only `POST /v1/intents` is accepted, with JSON and `Authorization: Bearer <token>`. This endpoint receives an SDK envelope. It chooses only `submitIntent` or `executeSpend` after checking current policy and simulating signature validation. Callers cannot supply an arbitrary target, calldata, asset, native value, or action name. Gas limits, fee caps, daily reserved gas budget, daily request cap, body size and durable request rate limits are enforced.

SQLite stores the exact signed transaction **before** broadcasting. Retries use the same transaction hash. Startup replays missing prepared transactions before accepting new work. Authentication is machine-to-machine; do not place its bearer token in frontend code. Put a TLS reverse proxy in front for remote access. Follow [the relayer runbook](docs/OPERATIONS.md) before operating it.

## Receipts and persistent state

Policies, recipients, counters, nonces, approvals and pending requests live on chain. Local storage saves only the selected vault address/deployment block. Demo state is in memory and resets on reload. The dashboard loads up to the latest 10,000 blocks of successful payment events and refreshes every 30 seconds. It shows the loaded range explicitly.

For complete history, stream events from the deployment block:

```bash
node --env-file=.env scripts/export-receipts.mjs --from DEPLOYMENT_BLOCK > receipts.ndjson
```

The export defaults to 12 blocks behind the current head, includes block hashes, and does not assume finality. Run against an archival/log-capable provider. Reconcile reorganizations before using exported records for accounting.

## Source layout

| Path | Purpose |
| --- | --- |
| `contracts/src/VeydravaVault.sol` | Policy, authorization, approval queue and payment execution |
| `contracts/src/TestUSD.sol` | Testnet-only mintable ERC20 |
| `contracts/test/VeydravaVault.t.sol` | Adversarial tests and stateful invariant handler |
| `contracts/script/Deploy.s.sol` | Foundry deployment script |
| `lib/veydrava/chain.ts` | Wallet/network validation, chain reads, transaction helpers |
| `lib/veydrava/artifacts/` | ABI and bytecode generated from these contracts |
| `components/veydrava/app.tsx` | Complete dashboard and wallet flows |
| `sdk/index.mjs` | Intent construction, validation and EIP-712 signing |
| `agent/` | Agent CLI and optional local model planner |
| `services/relayer/server.mjs` | Restricted, authenticated, durable gas sponsorship |
| `tests/` | Real Anvil integration and mock planner tests |
| `scripts/test-site-runtime.mjs` | Regression checks against the production Worker build |
| `docs/SECURITY.md` | Trust boundaries, limits and pre-mainnet review |
| `docs/OPERATIONS.md` | Deployment, monitoring, backup and incident response |
| `docs/VALIDATION.md` | Validation performed for this release |

## Mainnet readiness

Tests cannot certify custom financial contracts as production safe. Before a real-funds launch, complete an independent contract audit, adversarial frontend/wallet testing, token-specific review, deployment/source verification, gas and key-management review, recovery rehearsals, monitoring, and a capped pilot. Mainnet chain support and ERC-4337 sponsorship require additional implementation and validation. The included relayer and deployment script intentionally support only Sepolia and local Anvil.
