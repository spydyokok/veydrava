export type View =
  | "overview"
  | "agents"
  | "payments"
  | "approvals"
  | "policies"
  | "allowlist"
  | "receipts"
  | "setup";
export type Agent = {
  address: string;
  name: string;
  description: string;
  perPayment: string;
  dailyLimit: string;
  lifetimeLimit: string;
  approvalThreshold: string;
  spent: string;
  lifetimeSpent: string;
  validUntil: number;
  version: string;
  epoch: string;
  nonce: string;
  active: boolean;
  recipients: string[];
};
export type Intent = {
  agent: string;
  recipient: string;
  amount: string;
  nonce: string;
  deadline: string;
  policyVersion: string;
  epoch: string;
  memo: string;
};
export type Envelope = {
  chainId: number;
  vault: string;
  intent: Intent;
  signature: string;
};
export type Pending = {
  id: string;
  agent: string;
  recipient: string;
  amount: string;
  title: string;
  envelope?: Envelope;
  decision: number;
};
export type Receipt = {
  id: string;
  title: string;
  agent: string;
  recipient: string;
  amount: string;
  status: "Paid" | "Blocked" | "Rejected" | "Approved";
  time: string;
  tx?: string;
  block?: number;
  reason?: string;
  memo?: string;
};
export type Snapshot = {
  balance: string;
  spent: string;
  globalLimit: string;
  paused: boolean;
  owner: string;
  asset: string;
  decimals: number;
  symbol: string;
  epoch: string;
  agents: Agent[];
  pending: Pending[];
  receipts: Receipt[];
  historyFrom: number;
  historyTo: number;
};
export const DEMO_AGENT = "0x1111111111111111111111111111111111111111";
export const DEMO_VENDOR = "0x2222222222222222222222222222222222222222";
export const short = (s: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";
export function sampleSnapshot(owner: string): Snapshot {
  const agents: Agent[] = [
    {
      address: DEMO_AGENT,
      name: "Procurement agent",
      description: "Infrastructure & compute",
      perPayment: "150",
      dailyLimit: "500",
      lifetimeLimit: "5000",
      approvalThreshold: "50",
      spent: "172.5",
      lifetimeSpent: "1248.5",
      validUntil: 4102444800,
      version: "1",
      epoch: "1",
      nonce: "12",
      active: true,
      recipients: [DEMO_VENDOR],
    },
    {
      address: "0x3333333333333333333333333333333333333333",
      name: "Research agent",
      description: "Data & research services",
      perPayment: "100",
      dailyLimit: "300",
      lifetimeLimit: "3000",
      approvalThreshold: "30",
      spent: "84",
      lifetimeSpent: "584",
      validUntil: 4102444800,
      version: "1",
      epoch: "1",
      nonce: "7",
      active: true,
      recipients: [DEMO_VENDOR],
    },
    {
      address: "0x4444444444444444444444444444444444444444",
      name: "Subscription agent",
      description: "Recurring software payments",
      perPayment: "50",
      dailyLimit: "200",
      lifetimeLimit: "2000",
      approvalThreshold: "25",
      spent: "28",
      lifetimeSpent: "128",
      validUntil: 4102444800,
      version: "1",
      epoch: "1",
      nonce: "3",
      active: true,
      recipients: [DEMO_VENDOR],
    },
  ];
  return {
    balance: "12500",
    spent: "284.5",
    globalLimit: "1000",
    paused: false,
    owner,
    asset: "",
    decimals: 6,
    symbol: "tUSD",
    epoch: "1",
    agents,
    pending: [
      {
        id: "demo-pending-1",
        agent: agents[0].address,
        recipient: DEMO_VENDOR,
        amount: "85",
        title: "Compute credits",
        decision: 15,
      },
      {
        id: "demo-pending-2",
        agent: agents[1].address,
        recipient: DEMO_VENDOR,
        amount: "65",
        title: "Research dataset",
        decision: 15,
      },
    ],
    receipts: [
      {
        id: "demo-1",
        title: "Cloud compute",
        agent: agents[0].address,
        recipient: DEMO_VENDOR,
        amount: "24.5",
        status: "Paid",
        time: "Today · 14:32",
      },
      {
        id: "demo-2",
        title: "Unapproved recipient",
        agent: agents[1].address,
        recipient: "0x5555555555555555555555555555555555555555",
        amount: "95",
        status: "Blocked",
        time: "Today · 13:18",
        reason: "Recipient not allowed",
      },
      {
        id: "demo-3",
        title: "Developer tools",
        agent: agents[2].address,
        recipient: DEMO_VENDOR,
        amount: "18",
        status: "Paid",
        time: "Today · 12:04",
      },
      {
        id: "demo-4",
        title: "Dataset access",
        agent: agents[1].address,
        recipient: DEMO_VENDOR,
        amount: "12",
        status: "Paid",
        time: "Today · 11:47",
      },
    ],
    historyFrom: 0,
    historyTo: 0,
  };
}
