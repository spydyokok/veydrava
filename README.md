Veydrava

Veydrava is a smart-contract-powered payment vault for controlled and automated on-chain payments. Users deposit funds into a vault, configure spending rules, and authorize payments with signed intents instead of exposing wallet control to an external automation service.

https://veydrava.vercel.app/

Open Veydrava

The live application includes a demo mode, so the interface can be explored without deploying a contract or spending real funds.

Key Features

Secure vault deposits and withdrawals

Recipient allowlisting

Per-transaction and daily spending limits

Scheduled and recurring payment workflows

EIP-712 typed-data payment authorization

Relayer-compatible transaction execution

ERC-1271 smart-wallet signature support

Transaction history and payment activity

Optional local Ollama payment-plan generator

Dark, responsive dashboard with direct page navigation

How It Works

The user connects a wallet and deploys or selects a Veydrava vault.

The user deposits funds into the vault.

Spending limits and approved recipients are configured on-chain.

The user signs an EIP-712 payment intent.

A relayer or automation service submits the signed intent.

The vault verifies the signature, nonce, deadline, recipient and spending limits.

The smart contract executes the payment only when every rule passes.

The automation service can request a payment, but it cannot freely control or withdraw the vault balance.

Smart Contract

The main contract is located at:

contracts/src/VeydravaVault.sol

Solidity is responsible for:

Holding vault funds

Enforcing access control

Managing recipient permissions

Applying transaction and daily limits

Preventing replay attacks with nonces

Rejecting expired authorizations

Verifying signed payment intents

Executing valid payments

Recording events for the frontend

This version uses an EIP-712 signed-intent vault with relayer support. It is not a complete ERC-4337 account-abstraction wallet and does not require an EntryPoint or bundler.

Optional AI Planner

The optional Ollama module converts a natural-language payment request into structured payment-plan data. It runs separately from the blockchain and never bypasses the smart contract's rules.

User request -> Ollama plan -> User signature -> Contract verification -> Payment

AI knowledge is not required to use the vault. The application and smart contract can operate without Ollama by creating payment details manually.

Tech Stack

Next.js and TypeScript

React

Solidity

Foundry

wagmi and viem

EIP-712 and ERC-1271

Optional Ollama integration

Vercel deployment

Run Locally

Requirements

Node.js 22

npm

A browser wallet such as MetaMask

Foundry for smart-contract development

Frontend

npm install
npm run dev

Open http://localhost:3000.

Create .env.local from the included example environment file, then add the required public RPC and deployed contract values. Never commit private keys or seed phrases.

Smart Contracts

cd contracts
forge install
forge build
forge test

For a local blockchain:

anvil

Run the deployment script from a second terminal using the project's configured RPC URL and deployment account.

Testing Automatic Payments

Start in demo mode to understand the complete UI flow.

Create a recipient and configure a small spending limit.

Create a scheduled payment with a near-future execution time.

Sign the generated payment intent.

Run the relayer or automation process.

Confirm that the transaction appears in activity history.

Try an expired intent, reused nonce or excessive amount and verify that the contract rejects it.

Automation does not mean the contract wakes itself up. A relayer, keeper or scheduled backend must submit the transaction when it becomes executable; the contract then decides whether it is valid.

Production Checklist

Before handling real funds:

Complete an independent smart-contract security audit

Add comprehensive unit, fuzz and invariant tests

Use a dedicated production RPC endpoint

Protect relayer credentials with a managed secret store

Add monitoring, alerts and rate limiting

Verify contracts on the target block explorer

Test with small amounts on a testnet first

Deployment

The frontend is configured for Vercel:

npm run build

Push the repository to GitHub, import it into Vercel, add the required environment variables, and deploy. Vercel should detect Next.js automatically.

Owner

Configured project owner address:

0xcd25106586c679FA4E1d753914BB9b24240ae588

Disclaimer

Veydrava is an educational portfolio project. Do not use it to custody significant real funds until the contracts, relayer and deployment configuration have received a professional security review.

License

MIT
