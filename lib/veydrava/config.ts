export const INITIAL_OWNER = "0xcd25106586c679FA4E1d753914BB9b24240ae588";
export const CHAIN_ID = 11155111;
export const CHAIN_NAME = "Sepolia";
export const EXPLORER = "https://sepolia.etherscan.io";
export const POLICY_REASONS = [
  "Allowed",
  "Vault paused",
  "Agent inactive",
  "Agent authorization expired",
  "Policy changed — sign again",
  "Authorization revoked",
  "Recipient not allowed",
  "Amount must be positive",
  "Intent expired",
  "Nonce already used or out of order",
  "Per-payment limit exceeded",
  "Agent daily budget exceeded",
  "Agent lifetime budget exceeded",
  "Vault daily budget exceeded",
  "Insufficient vault balance",
  "Owner approval required",
];
export const SPEND_TYPES = {
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
