# Release validation

Validation repeated in the build environment on 10 September 2026 after renaming the project to Veydrava and repairing the homepage render failure.

| Check | Result |
| --- | --- |
| Solidity compilation | Solidity 0.8.30; Cancun; optimizer 200 runs; OpenZeppelin 5.6.1 |
| Contract unit and fuzz tests | 50 passing tests; each of 3 fuzz tests uses 512 runs |
| Stateful invariants | 3 passing properties; 128 runs × 64 calls per property |
| SDK / relayer / planner tests | 14 passing integration tests |
| TypeScript | No type errors |
| Application build | Next.js production build succeeds |
| Runtime dependency audit | Zero reported vulnerabilities after updating Next.js and affected transitive dependencies |
| Public-chain deployment | Not performed; requires owner wallet signature and Sepolia ETH |
| Real-wallet browser testing | Not performed |
| Actual local model evaluation | Not performed; planner integration is tested with a mock local endpoint |
| Independent contract audit | Not performed |

## Homepage loading repair

The previous homepage returned HTTP 500 because whole-number budget displays requested `maximumFractionDigits: 0` while the shared formatter always specified `minimumFractionDigits: 2`. `Intl.NumberFormat` rejected the conflicting limits with a `RangeError` during server rendering. The minimum is now capped by the requested maximum, preserving two-decimal payment amounts and zero-decimal budget labels.

The repaired application was exercised without connecting a wallet or sending public-chain requests. This does not replace real-wallet browser testing or verify every interactive flow.

## Security behavior exercised

Authorization tests cover EOA and ERC-1271 signatures, tampered amount/recipient, wrong signer, missing signature, replay, cross-vault and cross-chain replay, nonce cancellation, expiry boundaries, policy and allowlist changes, global epoch revocation, two-step ownership transfer, unauthorized administration, and disabled ownership renunciation.

Spending tests cover per-payment, agent daily, vault daily, and lifetime limits; exact threshold equality; approvals that cannot bypass hard caps; approval revocation; insufficient funds; midnight resets; lowering limits below current spend without underflow; and policy updates that preserve spent counters.

Token tests cover rejected taxed deposits, failed transfer rollback, accounting rollback, and a malicious callback token trying to reenter payment execution. Stateful invariants exercise randomized spending, day changes, and policy resets while asserting token conservation, cap enforcement, and agreement between accounting and actual token transfers.

The real local-chain integration deploys the compiled browser artifacts, signs through the SDK, simulates/executes through the HTTP relayer, checks exact recipient balances, retries duplicate requests, restarts the SQLite-backed relayer, exercises owner approval and pending-queue clearing, and checks unauthorized, oversized, wrong-network, tampered-signature, capped and paused requests. No test uses the supplied owner's private key or sends transactions to a public chain.

Passing tests is evidence for these cases, not a security certification. See SECURITY.md and OPERATIONS.md for remaining deployment responsibilities and limitations.
