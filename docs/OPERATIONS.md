# Operator runbook

## Network and identities

The frontend, CLI and relayer default to Ethereum Sepolia, chain ID 11155111. Local Anvil uses 31337 in tests. The initial owner is 0xcd25106586c679FA4E1d753914BB9b24240ae588. The browser deployment is signed by this wallet and cannot be signed just by knowing its address.

Use three separate identities: owner (policy/withdrawal authority), agent (exact intent signatures), and relayer (native gas). Use a protected RPC endpoint. Keep server secrets out of the frontend, Git, logs, issue reports, source archives and chat. Provide secrets at runtime with a secret manager for any real deployment; the local .env file is for testnet development.

## First deployment

Follow README's wallet workflow. Record chain, vault, token, decimals, deployment block, owner, transaction hash and compiler settings. Verify `owner()`, `asset()`, `assetDecimals()`, `globalDailyLimit()`, `authorizationEpoch()`, and `paused()` from an independent source. A new vault has no active agents and no allowed recipients. Mint only the test asset, approve a bounded allowance, and fund a small amount. Create a policy with a short expiry and conservative caps, then add one verified recipient. Run one small payment, one over-limit request, one approval, and one revoked-agent request.

## Relayer hosting

The HTTP service requires a persistent Linux/macOS Node 22 process with a durable SQLite volume. It is separate from the Next.js frontend and cannot run as a short-lived serverless function. No relayer key, model endpoint or funded sponsor is included in the frontend deployment.

Start with `npm run relayer`. Keep `RELAYER_HOST=127.0.0.1` behind a TLS reverse proxy. For container networking, explicitly bind 0.0.0.0 only on a trusted internal network and apply reverse-proxy authentication/network controls. `/health` intentionally returns only service status, chain and configured vault; it is not proof that a transaction settled.

Use one dedicated signer with one database and one active instance. A 30-second SQLite lease is renewed every 10 seconds. Keep host time synchronized. A lost lease fails the service closed. Do not scale this implementation horizontally without replacing the nonce/lease coordination and testing failover.

`RELAYER_AUTH_TOKEN` must be random with at least 32 characters. Generate it locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and keep it private. Distribute it only to trusted agent machines. The frontend imports signatures through the user's wallet and never receives this secret.

Default limits: 30 authenticated attempts per minute, 200 sponsored transactions per UTC submission day, 800,000 gas per transaction, 30 gwei fee ceiling, and 0.02 ETH daily reserved maximum gas cost. Invalid authenticated requests count toward request rate limiting. Gas budget reservations are conservative, are made before broadcast, and are not refunded even if actual gas is lower. Limit changes require restarting with new environment values. Monitor balances and fees rather than automatically raising them.

## Transaction lifecycle and recovery

1. Validate the envelope and current chain.
2. Resolve the digest and check existing jobs for idempotency.
3. Read current policy; choose `submitIntent` for consent or `executeSpend` for payment.
4. Simulate, estimate gas, check fee/amount/request caps.
5. Sign a transaction with the dedicated relayer key.
6. Write raw bytes, hash, reserved cost and operation to SQLite before broadcasting.
7. Return `submitted`. This response is **not** settlement confirmation.
8. Re-query the exact envelope for confirmed/reverted status, or query its receipt independently.

A broadcast error is ambiguous. The service stops accepting sponsorship and instructs an operator to restart/recover. On startup it resubmits missing prepared transactions using the exact saved bytes. If recovery fails, inspect the recorded hash and nonce using an independent RPC before taking action. Never delete the database or blindly create a new nonce. A transaction replaced outside the service needs operator investigation. Fee replacement automation is intentionally not implemented.

Requests needing approval preserve the same signed envelope. Approve its exact digest, then relay that same envelope. Generating a new deadline changes its digest and requires a new approval. If a request expires, create and approve a new request. Rejecting an intent advances its nonce and invalidates other signatures for that nonce.

## Backups and monitoring

Back up SQLite using its online backup facility or stop the service and back up the database plus WAL consistently. Protect the volume and backups. The signed transaction bytes are not private keys, but can be rebroadcast by anyone who has them. Store the relayer key separately and never in SQLite. Retain audit history and do not truncate daily reservations during an active day.

Monitor `/health`, relayer native balance, pending transactions and nonce gaps, request rejections, daily budget usage, RPC errors, and policy/recipient/ownership events. The vault emits SpendExecuted only after an exact transfer. Failed on-chain requests revert; use transaction status/traces to inspect them. Two frontend confirmations are a usability convention, not guaranteed finality. For accounting, reconcile block hashes and chain reorganizations with your own finality policy.

## Incident actions

For a compromised agent, submit `revokeAgent(agent)` or `pause()` using the owner wallet. For several agents, use `revokeAllAgents()` and reauthorize reviewed identities. Confirm the action mined; it cannot undo an already executed payment. Preserve receipts and sign no new approvals. Withdraw to a verified owner-controlled destination when appropriate. Stop and rotate the relayer if its secret is exposed. Owner compromise defeats all vault controls; use appropriate custody from the beginning.

Ownership handover is two transactions: `transferOwnership(newOwner)` then `acceptOwnership()` by that exact address. Acceptance increments the global authorization epoch and pauses the vault. Recreate agent policies and unpause after reviewing the new owner's control. Ownership handover is available through the contract interface; the dashboard does not provide a multisig transaction builder.
