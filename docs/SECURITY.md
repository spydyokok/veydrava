# Security model

## Scope and trust

VeydravaVault is a non-upgradeable, single-asset ERC20 vault owned by one EOA or smart-contract owner. The owner can withdraw every token, change policies, allow recipients, raise caps, approve exact requests, pause, and rotate ownership. It is not a trustless shared fund or a user-balance ledger. Third-party deposits become owner-controlled. The UI configures the supplied owner address but does not prove its ownership until a wallet signs a transaction.

Agent keys have bounded payment authorization only. A compromised agent key can spend to its allowed recipients up to remaining caps and automatic-approval threshold, repeatedly until its daily or lifetime budget is exhausted. On-chain rules do not determine whether an approved recipient is honest or a model's business decision is correct. A recipient can be controlled by the agent; review recipients independently. An authorized payment already in the mempool may execute before a pause or revoke transaction is mined.

The relayer pays native gas and may submit exact signed requests. It cannot withdraw vault funds or substitute amounts or recipients. Its key must be different from the owner key. Agent and relayer keys should also be separate. No hosted secret is required by the browser dashboard. Do not grant the relayer ERC20 allowances or vault ownership.

## Contract controls

- EIP-712 domain includes vault address, chain ID, name `VeydravaVault` and version `1`.
- Intent binds agent, recipient, raw amount, nonce, deadline, policy version, global epoch and memo hash.
- Sequential per-agent nonces prevent repeat execution. Owners can advance nonces to cancel requests.
- Agent policy updates increment its version and never reset daily/lifetime spend.
- Allowlist changes increment policy version even when changing an unrelated recipient.
- Revocation disables an agent and increments its version. Re-activation requires a new policy.
- Global epoch invalidation disables every existing agent policy and signature.
- Two-step ownership acceptance increments the epoch and pauses spending.
- Owner approvals are bound to the entire digest and cannot override other policy limits.
- One pending request per agent lives on chain. A newer signed request can replace its queue slot; pending requests do not reserve funds. Execution always rechecks policy.
- Rejection advances the agent nonce; reusing the rejected signed intent then fails.
- EOA signatures use OpenZeppelin validation; ERC-1271 signing contracts are supported. Contract-signer validity may change over time and is rechecked at execution.
- Checks/effects precede the external token transfer; the reentrancy guard covers spending, submission, deposit, withdrawal and recovery.
- SafeERC20 handles token return values. Exact source and destination balance deltas reject fees on transfer during payment.
- Pausing blocks deposits and spending. Owner withdrawal remains available.
- Asset immutability prevents swapping the token underneath an existing policy. No arbitrary calls, delegatecall, swaps, ERC20 approval forwarding or upgrade key exists.
- Renouncing ownership is disabled to avoid locking recovery controls.

## Limit semantics

The Veydrava rename updates the contract, SDK, and dashboard signing domain together. It does not rename or upgrade any previously deployed contract. Old `SpendaVault` signatures are not valid for new Veydrava vaults; use the matching deployment and freshly signed intents. The initial owner address remains unchanged. Saved browser vault selections are retained as a convenience, not proof of contract compatibility.

Amounts are raw ERC20 units in Solidity and decimal strings in the UI/SDK. Contract arithmetic uses integers. Displayed charts use floating point for visualization only and never authorize money movement.

A day is `block.timestamp / 86400`, a UTC calendar day, not a rolling 24-hour window. An agent can spend one daily cap just before midnight and another immediately afterward. Lifetime budgets do not reset. An expiry/deadline equal to the current timestamp is expired. A deadline cannot extend beyond agent authorization. Raising a global budget does not revoke prior signatures; policy/recipient changes and epoch invalidation do.

The vault supports vetted, non-rebasing, non-taxing ERC20 tokens with at most 18 decimals. Do not assume an arbitrary token is safe because it implements ERC20. Malicious balance reports cannot be made trustworthy by this contract. Upgradeable, blocklisted or paused stablecoins depend on their token administrator and can freeze transfers, including withdrawals. Only token-specific review can decide deployment suitability.

## Off-chain boundaries

Browser previews are advisory, do not validate an imported signature until simulation, and do not reserve budgets. Provider failures are errors, not an authorization fallback. Wallet/account changes invalidate loaded state. Owner controls require the current owner, and the contract remains authoritative.

An RPC can lie about read-only state or the frontend can be compromised. Verify the contract, chain, owner, token and requested wallet action independently. The source includes compiled bytecode but has not received external verification or an audit. The app never claims that a sample transaction is mined.

The relayer authenticates every POST, restricts one configured vault and chain, validates envelope sizes/types, simulates execution, enforces sponsorship limits, and persists raw transaction bytes before broadcasting. A database lease supports only **one active process and one dedicated key**. Do not run another sender with that key, even with another database. A database wipe loses idempotency/gas accounting and must not be treated as routine recovery.

The planner is optional and isolated from execution. Model text is untrusted. Schema checks and reviewed merchant choices cannot eliminate hallucinations or prompt injection. Review every model draft before passing it to the signer. Actual model behavior has not been evaluated in this build.

## Explicitly outside this release

- ERC-4337 EntryPoint, account factories, UserOperations, bundler and paymaster
- Arbitrary DeFi actions, bridges, price oracles, RWA trading and fiat integrations
- Multisig spending thresholds, session keys, account recovery and upgradeability
- Rolling 24-hour caps and cryptographic business-purpose verification
- Independent audit, formal verification, real-wallet browser QA and mainnet operation
- Production transaction indexing/finality accounting across all history

These are not represented as live or working capabilities in the UI.

## Review before real value

Obtain independent review of the contracts and deployment configuration, exercise browser wallet/network changes and rejection paths, review dependencies and token controls, verify source and constructor values on the explorer, protect administrative keys (prefer a multisig with a separate dashboard integration), test backups/incident response, set low initial limits, and monitor confirmed events plus failed transactions. Solidity 0.8.30 bytecode targets Cancun and must not be deployed to an incompatible EVM.
