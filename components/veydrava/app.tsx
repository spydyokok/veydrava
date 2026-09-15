"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Contract,
  formatUnits,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} from "ethers";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Wallet,
  Bot,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  ReceiptText,
  ListChecks,
  ChevronRight,
  Plus,
  Copy,
  Check,
  Clock3,
  CircleX,
  Pause,
  Play,
  RefreshCw,
  Download,
  ExternalLink,
  Layers3,
  Send,
  PlugZap,
  CheckCheck,
  LockKeyhole,
  CircleDollarSign,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { createDashboardNavigation } from "@/lib/veydrava/navigation.mjs";
import {
  CHAIN_ID,
  EXPLORER,
  INITIAL_OWNER,
  POLICY_REASONS,
  SPEND_TYPES,
} from "@/lib/veydrava/config";
import {
  type Agent,
  type Envelope,
  type Intent,
  type Pending,
  type Receipt,
  type Snapshot,
  type View,
  sampleSnapshot,
  short,
  DEMO_VENDOR,
} from "@/lib/veydrava/model";
import {
  assertChain,
  contractWrite,
  deployContract,
  getProvider,
  getVault,
  normalize,
  parseEnvelope,
  readableError,
  snapshot,
  tokenAbi,
  verifiedSigner,
} from "@/lib/veydrava/chain";

const NAV: { key: View; title: string; icon: typeof Bot }[] = [
  { key: "overview", title: "Overview", icon: LayoutDashboard },
  { key: "agents", title: "Agents", icon: Bot },
  { key: "payments", title: "Make a payment", icon: Send },
  { key: "approvals", title: "Approvals", icon: ListChecks },
  { key: "receipts", title: "Receipts", icon: ReceiptText },
  { key: "policies", title: "Spending policies", icon: SlidersHorizontal },
  { key: "allowlist", title: "Recipient allowlist", icon: ShieldCheck },
  { key: "setup", title: "Vault setup", icon: Layers3 },
];
const EMPTY: Snapshot = {
  balance: "0",
  spent: "0",
  globalLimit: "0",
  paused: false,
  owner: INITIAL_OWNER,
  asset: "",
  decimals: 6,
  symbol: "tUSD",
  epoch: "1",
  agents: [],
  pending: [],
  receipts: [],
  historyFrom: 0,
  historyTo: 0,
};
const money = (value: string | number, max = 2) =>
  Number(value).toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, max),
    maximumFractionDigits: max,
  });
const percent = (a: string, b: string) =>
  Number(b) > 0 ? Math.min(100, (Number(a) / Number(b)) * 100) : 0;
function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {help && <small>{help}</small>}
    </div>
  );
}
function SelectBox({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full h-11 bg-card">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function SideNav({
  view,
  onView,
  count,
}: {
  view: View;
  onView: (v: View) => void;
  count: number;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader className="p-0">
        <a href="/" className="veydrava-brand" aria-label="Veydrava home">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          <span>
            veydrava<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">
            <Wallet size={17} />
          </span>
          <div>
            Personal workspace<small>Agent spending vault</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <div className="nav-group">
          <p className="nav-label">Workspace</p>
          <SidebarMenu>
            {NAV.slice(0, 5).map(({ key, title, icon: Icon }) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuButton
                  className="nav-button"
                  isActive={view === key}
                  onClick={() => {
                    onView(key);
                    setOpenMobile(false);
                  }}
                >
                  <Icon />
                  <span>{title}</span>
                  {key === "approvals" && count > 0 && (
                    <span className="ml-auto rounded bg-[#ed712f] px-1.5 text-xs text-white">
                      {count}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
        <div className="nav-group mt-4">
          <p className="nav-label">Controls</p>
          <SidebarMenu>
            {NAV.slice(5).map(({ key, title, icon: Icon }) => (
              <SidebarMenuItem key={key}>
                <SidebarMenuButton
                  className="nav-button"
                  isActive={view === key}
                  onClick={() => {
                    onView(key);
                    setOpenMobile(false);
                  }}
                >
                  <Icon />
                  <span>{title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      </SidebarContent>
      <SidebarFooter className="sidebar-bottom">
        <div className="owner-tile">
          <small>INITIAL VAULT OWNER</small>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#32333e] p-2">
              <Wallet size={14} />
            </span>
            <span className="mono">{short(INITIAL_OWNER)}</span>
            <LockKeyhole size={13} className="ml-auto" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function VeydravaApp() {
  const navigation = useRef<ReturnType<typeof createDashboardNavigation> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [view, setView] = useState<View>("overview"),
    [demo, setDemo] = useState(true),
    [demoData, setDemoData] = useState(() => sampleSnapshot(INITIAL_OWNER));
  const [live, setLive] = useState<Snapshot | null>(null),
    [account, setAccount] = useState(""),
    [vaultAddress, setVaultAddress] = useState(""),
    [startBlock, setStartBlock] = useState(0),
    [chainId, setChainId] = useState(0);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [fundMode, setFundMode] = useState<"deposit" | "withdraw" | null>(null),
    [fundAmount, setFundAmount] = useState("100");
  const [editAgent, setEditAgent] = useState<Agent | null | undefined>(
      undefined,
    ),
    [detail, setDetail] = useState<Receipt | null>(null),
    [revoke, setRevoke] = useState<Agent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState(""),
    [recipient, setRecipient] = useState(DEMO_VENDOR),
    [amount, setAmount] = useState("24.50"),
    [purpose, setPurpose] = useState("Cloud compute credits"),
    [checkResult, setCheckResult] = useState<{
      decision: number;
      intent?: Intent;
    } | null>(null),
    [imported, setImported] = useState("");
  const [tokenAddress, setTokenAddress] = useState(""),
    [attachAddress, setAttachAddress] = useState(""),
    [attachBlock, setAttachBlock] = useState(""),
    [deployLimit, setDeployLimit] = useState("1000"),
    [allowAddress, setAllowAddress] = useState("");
  const [filter, setFilter] = useState("all"),
    [policyLimit, setPolicyLimit] = useState("1000"),
    [importReview, setImportReview] = useState<{
      envelope: Envelope;
      decision: number;
    } | null>(null);
  const busyRef = useRef(false),
    requestId = useRef(0),
    providerRef = useRef<ReturnType<typeof getProvider> | null>(null);
  const data = demo ? demoData : (live ?? EMPTY);
  const owner = account.toLowerCase() === data.owner.toLowerCase();
  const isInitialOwner = account.toLowerCase() === INITIAL_OWNER.toLowerCase();
  const activeAgents = data.agents.filter((a) => a.active);
  const chosen =
    data.agents.find((a) => a.address === selectedAgent) ?? data.agents[0];
  const writable = demo || (!!live && owner && chainId === CHAIN_ID);
  const agentName = (a: string) =>
    data.agents.find((x) => x.address.toLowerCase() === a.toLowerCase())
      ?.name ?? short(a);
  const refresh = useCallback(async () => {
    if (!providerRef.current || !vaultAddress) return;
    const id = ++requestId.current;
    const next = await snapshot(providerRef.current, vaultAddress, startBlock);
    if (id === requestId.current) setLive(next);
  }, [vaultAddress, startBlock]);
  function navigate(v: View) {
    navigation.current?.navigate(v);
  }
  function changeMode(nextDemo: boolean) {
    setDemo(nextDemo);
    setCheckResult(null);
    setImported("");
    setError("");
    if (!nextDemo) {
      setRecipient("");
      setSelectedAgent("");
      if (!live) navigate("setup");
    } else {
      setRecipient(DEMO_VENDOR);
      setSelectedAgent("");
    }
  }
  async function run(task: () => Promise<void>, success?: string) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
      if (success) toast.success(success);
      setStatus("");
      return true;
    } catch (e) {
      const m = readableError(e);
      setError(m);
      toast.error(m);
      setStatus("");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function connect() {
    await run(async () => {
      const p = getProvider();
      providerRef.current = p;
      const accounts: string[] = await p.send("eth_requestAccounts", []);
      setAccount(accounts[0] ?? "");
      setChainId(Number(await p.send("eth_chainId", [])));
      changeMode(false);
    });
  }
  async function switchNetwork() {
    await run(async () => {
      const p = providerRef.current ?? getProvider();
      await p.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
      setChainId(CHAIN_ID);
    });
  }
  useEffect(() => {
    const controller = createDashboardNavigation(window, NAV.map((n) => n.key), (next, canBack) => {
      setView(next as View);
      setCanGoBack(canBack);
      setError("");
      setFundMode(null);
      setEditAgent(undefined);
      setDetail(null);
      setRevoke(null);
      setImportReview(null);
      setCheckResult(null);
    });
    navigation.current = controller;
    return () => { controller.dispose(); navigation.current = null; };
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("veydrava:sepolia:selection") ??
          localStorage.getItem("spenda:sepolia:selection") ??
          "null",
      );
      if (saved && saved.address) {
        setVaultAddress(normalize(saved.address));
        setAttachAddress(saved.address);
        setStartBlock(Number(saved.block) || 0);
        setAttachBlock(String(saved.block || ""));
      }
    } catch {}
    const eth = window.ethereum;
    if (!eth) return;
    const changed = (...args: unknown[]) => {
      requestId.current++;
      setLive(null);
      setCheckResult(null);
      const a = args[0];
      if (Array.isArray(a)) {
        setAccount(String(a[0] ?? ""));
      } else {
        setChainId(Number(a));
      }
      providerRef.current = getProvider();
    };
    eth.on?.("accountsChanged", changed);
    eth.on?.("chainChanged", changed);
    return () => {
      eth.removeListener?.("accountsChanged", changed);
      eth.removeListener?.("chainChanged", changed);
    };
  }, []);
  useEffect(() => {
    if (demo || !account || !vaultAddress || chainId !== CHAIN_ID) return;
    let cancelled = false;
    refresh().catch((e) => {
      if (!cancelled) setError(readableError(e));
    });
    const timer = setInterval(() => {
      if (!busyRef.current)
        refresh().catch((e) => {
          if (!cancelled) setError(readableError(e));
        });
    }, 30000);
    return () => {
      cancelled = true;
      requestId.current++;
      clearInterval(timer);
    };
  }, [demo, account, vaultAddress, chainId, refresh]);
  useEffect(() => {
    setCheckResult(null);
  }, [selectedAgent, amount, recipient, purpose, demo]);
  useEffect(() => {
    setPolicyLimit(data.globalLimit || "1000");
  }, [data.globalLimit]);
  async function write(method: string, args: unknown[]) {
    if (!providerRef.current || !account || !vaultAddress)
      throw new Error("Connect your wallet and select a vault first.");
    await contractWrite(
      providerRef.current,
      account,
      vaultAddress,
      method,
      args,
      setStatus,
    );
    await refresh();
  }
  function demoCheck(
    agent: Agent | undefined,
    value: string,
    to: string,
    approved = false,
  ) {
    if (data.paused) return 1;
    if (!agent?.active) return 2;
    if (Date.now() / 1000 >= agent.validUntil) return 3;
    if (!agent.recipients.some((r) => r.toLowerCase() === to.toLowerCase()))
      return 6;
    const n = parseUnits(value, 6);
    if (n <= 0n) return 7;
    if (n > parseUnits(agent.perPayment, 6)) return 10;
    if (n + parseUnits(agent.spent, 6) > parseUnits(agent.dailyLimit, 6))
      return 11;
    if (
      n + parseUnits(agent.lifetimeSpent, 6) >
      parseUnits(agent.lifetimeLimit, 6)
    )
      return 12;
    if (n + parseUnits(data.spent, 6) > parseUnits(data.globalLimit, 6))
      return 13;
    if (n > parseUnits(data.balance, 6)) return 14;
    if (!approved && n > parseUnits(agent.approvalThreshold, 6)) return 15;
    return 0;
  }
  function recordDemo(
    agent: Agent,
    value: string,
    to: string,
    title: string,
    decision: number,
  ) {
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      title,
      agent: agent.address,
      recipient: to,
      amount: value,
      status: decision === 0 ? "Paid" : "Blocked",
      time: "Just now · demo",
      reason: POLICY_REASONS[decision],
    };
    const add = (a: string, b: string) =>
      formatUnits(parseUnits(a, 6) + parseUnits(b, 6), 6);
    setDemoData((s) => ({
      ...s,
      balance:
        decision === 0
          ? formatUnits(parseUnits(s.balance, 6) - parseUnits(value, 6), 6)
          : s.balance,
      spent: decision === 0 ? add(s.spent, value) : s.spent,
      agents:
        decision === 0
          ? s.agents.map((a) =>
              a.address === agent.address
                ? {
                    ...a,
                    spent: add(a.spent, value),
                    lifetimeSpent: add(a.lifetimeSpent, value),
                    nonce: String(BigInt(a.nonce) + 1n),
                  }
                : a,
            )
          : s.agents,
      receipts: [receipt, ...s.receipts],
    }));
  }
  async function checkPayment() {
    await run(async () => {
      if (!chosen) throw new Error("Create an agent first.");
      normalize(recipient);
      const units = parseUnits(amount, data.decimals);
      if (units <= 0n) throw new Error("Enter a positive amount.");
      if (demo) {
        setCheckResult({ decision: demoCheck(chosen, amount, recipient) });
        return;
      }
      if (!providerRef.current) throw new Error("Connect a wallet.");
      const p = providerRef.current;
      await assertChain(p);
      const block = await p.getBlock("latest");
      if (!block) throw new Error("Could not read the latest block.");
      const i: Intent = {
        agent: chosen.address,
        recipient: normalize(recipient),
        amount: String(units),
        nonce: chosen.nonce,
        deadline: String(Math.min(chosen.validUntil, block.timestamp + 3600)),
        policyVersion: chosen.version,
        epoch: data.epoch,
        memo: keccak256(toUtf8Bytes(purpose)),
      };
      const decision = Number(await getVault(vaultAddress, p).previewSpend(i));
      setCheckResult({ decision, intent: i });
    });
  }
  async function executePayment() {
    await run(
      async () => {
        if (!chosen || !checkResult) return;
        if (demo) {
          const decision = demoCheck(chosen, amount, recipient);
          if (decision === 15) {
            setDemoData((s) => ({
              ...s,
              pending: [
                ...s.pending,
                {
                  id: crypto.randomUUID(),
                  agent: chosen.address,
                  recipient,
                  amount,
                  title: purpose || "Agent payment",
                  decision: 15,
                },
              ],
            }));
            toast.success("Demo request added to Approvals.");
          } else {
            recordDemo(
              chosen,
              amount,
              recipient,
              purpose || "Agent payment",
              decision,
            );
            toast.success(
              decision === 0
                ? "Demo payment completed."
                : "Demo request blocked. No funds moved.",
            );
          }
          setCheckResult(null);
          return;
        }
        if (account.toLowerCase() !== chosen.address.toLowerCase())
          throw new Error(
            "Use the agent signing account, or import an envelope signed by your agent SDK. The owner wallet does not sign for the agent.",
          );
        if (!checkResult.intent || !providerRef.current)
          throw new Error("Check the payment again.");
        const signer = await verifiedSigner(providerRef.current, account);
        const signature = await signer.signTypedData(
          {
            name: "VeydravaVault",
            version: "1",
            chainId: CHAIN_ID,
            verifyingContract: vaultAddress,
          },
          SPEND_TYPES,
          checkResult.intent,
        );
        await write(
          checkResult.decision === 15 ? "submitIntent" : "executeSpend",
          [checkResult.intent, signature],
        );
        setCheckResult(null);
      },
      demo ? undefined : "Request confirmed on Sepolia.",
    );
  }
  async function importedPayment() {
    await run(async () => {
      if (demo)
        throw new Error("Switch to Sepolia to import a signed request.");
      const e = parseEnvelope(imported, vaultAddress);
      if (!providerRef.current) throw new Error("Connect your wallet.");
      const v = getVault(vaultAddress, providerRef.current);
      const decision = Number(await v.previewSpend(e.intent));
      if (decision !== 0 && decision !== 15)
        throw new Error(POLICY_REASONS[decision]);
      await v[decision === 15 ? "submitIntent" : "executeSpend"].staticCall(
        e.intent,
        e.signature,
      );
      setImportReview({ envelope: e, decision });
    });
  }
  async function approvePending(p: Pending) {
    await run(async () => {
      if (demo) {
        const a = data.agents.find((a) => a.address === p.agent),
          d = demoCheck(a, p.amount, p.recipient, true);
        if (d !== 0) throw new Error(POLICY_REASONS[d]);
        setDemoData((s) => ({
          ...s,
          pending: s.pending.map((x) =>
            x.id === p.id ? { ...x, decision: 0 } : x,
          ),
        }));
      } else {
        if (!p.envelope) throw new Error("Missing signed request.");
        await write("setIntentApproval", [p.envelope.intent, true]);
      }
    }, "Exact payment approved.");
  }
  async function executePending(p: Pending) {
    await run(async () => {
      if (demo) {
        const a = data.agents.find((a) => a.address === p.agent);
        const d = demoCheck(a, p.amount, p.recipient, true);
        if (!a || d !== 0) throw new Error(POLICY_REASONS[d]);
        recordDemo(a, p.amount, p.recipient, p.title, 0);
        setDemoData((s) => ({
          ...s,
          pending: s.pending.filter((x) => x.id !== p.id),
        }));
      } else {
        if (!p.envelope) throw new Error("Missing signed request.");
        await write("executeSpend", [p.envelope.intent, p.envelope.signature]);
      }
    }, "Payment completed.");
  }
  async function rejectPending(p: Pending) {
    await run(async () => {
      if (demo)
        setDemoData((s) => ({
          ...s,
          pending: s.pending.filter((x) => x.id !== p.id),
          receipts: [
            {
              id: crypto.randomUUID(),
              agent: p.agent,
              recipient: p.recipient,
              amount: p.amount,
              title: p.title,
              status: "Rejected",
              time: "Just now · demo",
              reason: "Rejected by vault owner",
            },
            ...s.receipts,
          ],
        }));
      else {
        const a = data.agents.find((a) => a.address === p.agent);
        if (!a) throw new Error("Agent not found.");
        await write("invalidateNonce", [p.agent, BigInt(a.nonce) + 1n]);
      }
    }, "Request rejected and nonce cancelled.");
  }
  async function togglePause() {
    await run(
      async () => {
        if (demo) setDemoData((s) => ({ ...s, paused: !s.paused }));
        else await write(data.paused ? "unpause" : "pause", []);
      },
      data.paused ? "Agent spending resumed." : "Agent spending paused.",
    );
  }
  async function fund() {
    const ok = await run(
      async () => {
        const units = parseUnits(fundAmount, data.decimals);
        if (units <= 0n) throw new Error("Enter a positive amount.");
        if (demo) {
          if (fundMode === "withdraw" && units > parseUnits(data.balance, 6))
            throw new Error("Insufficient demo balance.");
          setDemoData((s) => ({
            ...s,
            balance: formatUnits(
              parseUnits(s.balance, 6) +
                (fundMode === "withdraw" ? -units : units),
              6,
            ),
          }));
          return;
        }
        if (!providerRef.current) throw new Error("Connect your wallet.");
        if (fundMode === "withdraw") {
          await write("withdraw", [normalize(account), units]);
          return;
        }
        const provider = providerRef.current,
          signer = await verifiedSigner(provider, account),
          v = getVault(vaultAddress, provider);
        if ((await v.owner()).toLowerCase() !== account.toLowerCase())
          throw new Error(
            "The vault owner changed. Refresh before depositing.",
          );
        const token = new Contract(await v.asset(), tokenAbi, signer);
        if (BigInt(await token.balanceOf(account)) < units)
          throw new Error(
            "Not enough tokens. Mint test tokens in Vault setup first.",
          );
        const allowance = BigInt(await token.allowance(account, vaultAddress));
        if (allowance < units) {
          if (allowance > 0n) {
            setStatus(
              "Resetting the existing token allowance. Confirm in your wallet.",
            );
            await (await token.approve(vaultAddress, 0)).wait(2);
          }
          setStatus(
            `Approve exactly ${fundAmount} ${data.symbol} in your wallet.`,
          );
          await (await token.approve(vaultAddress, units)).wait(2);
        }
        await write("deposit", [units]);
      },
      `${demo ? "Demo " : ""}${fundMode === "withdraw" ? "Withdrawal" : "Deposit"} completed.`,
    );
    if (ok) setFundMode(null);
  }
  function exportReceipts() {
    const rows = [
      [
        "Status",
        "Title",
        "Agent",
        "Recipient",
        "Amount",
        "Token",
        "Transaction",
        "Time",
      ],
      ...data.receipts.map((r) => [
        r.status,
        r.title,
        r.agent,
        r.recipient,
        r.amount,
        data.symbol,
        r.tx ?? "Demo",
        r.time,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `veydrava-${demo ? "demo" : "sepolia"}-receipts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function copy(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Copied.");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the address.");
    }
  }
  function saveSelection(address: string, block: number) {
    setVaultAddress(address);
    setStartBlock(block);
    setAttachAddress(address);
    setAttachBlock(String(block));
    localStorage.setItem(
      "veydrava:sepolia:selection",
      JSON.stringify({ address, block }),
    );
  }
  async function deployToken() {
    await run(async () => {
      if (!providerRef.current) throw new Error("Connect your wallet.");
      const r = await deployContract(
        providerRef.current,
        account,
        "TestUSD",
        [],
        setStatus,
      );
      setTokenAddress(r.address);
    }, "Test token deployed.");
  }
  async function deployVault() {
    await run(async () => {
      if (!providerRef.current || !isInitialOwner)
        throw new Error("Connect the initial owner address shown below.");
      const p = providerRef.current,
        token = normalize(tokenAddress);
      if ((await p.getCode(token)) === "0x")
        throw new Error("The token address has no contract on Sepolia.");
      const t = new Contract(token, tokenAbi, p);
      const decimals = Number(await t.decimals());
      if (decimals > 18) throw new Error("This token is not supported.");
      const limit = parseUnits(deployLimit, decimals);
      if (limit <= 0n)
        throw new Error("The vault daily budget must be positive.");
      const result = await deployContract(
        p,
        account,
        "VeydravaVault",
        [normalize(INITIAL_OWNER), token, limit],
        setStatus,
      );
      saveSelection(result.address, result.block);
      setLive(await snapshot(p, result.address, result.block));
      navigate("overview");
    }, "Your vault is deployed on Sepolia.");
  }
  async function attach() {
    await run(async () => {
      if (!providerRef.current) throw new Error("Connect a wallet first.");
      const address = normalize(attachAddress);
      const block = attachBlock ? Number(attachBlock) : 0;
      if (!Number.isSafeInteger(block) || block < 0)
        throw new Error("Enter a valid deployment block.");
      const s = await snapshot(providerRef.current, address, block);
      saveSelection(address, block);
      setLive(s);
      navigate("overview");
    }, "Vault loaded from Sepolia.");
  }
  async function faucet() {
    await run(async () => {
      if (!providerRef.current) throw new Error("Connect a wallet.");
      const signer = await verifiedSigner(providerRef.current, account),
        token = new Contract(
          normalize(tokenAddress || data.asset),
          tokenAbi,
          signer,
        );
      await token.faucet.staticCall();
      setStatus("Mint test tokens in your wallet.");
      await (await token.faucet()).wait(2);
    }, "Test tokens minted to your connected wallet.");
  }
  function receiptsTable(rows: Receipt[]) {
    return rows.length ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6 text-xs text-muted-foreground">
              PAYMENT
            </TableHead>
            <TableHead className="text-xs text-muted-foreground">AGENT</TableHead>
            <TableHead className="text-xs text-muted-foreground">AMOUNT</TableHead>
            <TableHead className="text-xs text-muted-foreground">STATUS</TableHead>
            <TableHead className="pr-6 text-xs text-muted-foreground">WHEN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              className="receipt-row"
              onClick={() => setDetail(r)}
            >
              <TableCell className="pl-6 py-4">
                <button
                  className="table-icon text-left"
                  onClick={() => setDetail(r)}
                >
                  <span className="receipt-icon">
                    {r.status === "Blocked" ? (
                      <CircleX size={15} />
                    ) : (
                      <ArrowUpRight size={15} />
                    )}
                  </span>
                  <span>
                    <span className="table-cell-title">{r.title}</span>
                    <span className="table-secondary">
                      {short(r.recipient)}
                    </span>
                  </span>
                </button>
              </TableCell>
              <TableCell className="text-[13px] text-muted-foreground">
                {agentName(r.agent)}
              </TableCell>
              <TableCell>
                <span className="text-[14px] text-foreground">
                  {money(r.amount)}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">
                  {data.symbol}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`badge ${r.status === "Blocked" || r.status === "Rejected" ? "red" : r.status === "Approved" ? "orange" : ""}`}
                >
                  {r.status === "Paid" ? (
                    <Check size={11} />
                  ) : r.status === "Blocked" ? (
                    <CircleX size={11} />
                  ) : (
                    <Clock3 size={11} />
                  )}{" "}
                  {r.status}
                </span>
              </TableCell>
              <TableCell className="pr-6 text-xs text-muted-foreground">
                {r.time}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <div className="empty">
        <ReceiptText size={28} />
        <h3>No payments yet</h3>
        <p>Confirmed payments will appear here with an explorer link.</p>
        <button className="btn" onClick={() => navigate("payments")}>
          Make a payment
        </button>
      </div>
    );
  }
  const chartValues = demo
    ? [112, 158, 96, 219, 177, 244, Number(data.spent)]
    : data.receipts
        .filter((r) => r.status === "Paid")
        .slice(0, 7)
        .reverse()
        .map((r) => Number(r.amount));
  const chartMax = Math.max(...chartValues, 1);
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "246px" } as React.CSSProperties}
    >
      <SideNav view={view} onView={navigate} count={data.pending.length} />
      <SidebarInset className="min-w-0">
        <header className="site-header">
         <div className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-menu" />
            <button className="btn small back-button" disabled={!canGoBack} onClick={() => navigation.current?.back()} aria-label="Go to previous page">
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
            <a href="/" className="workspace-home">Home</a>
            <ChevronRight size={13} />
            <strong>{NAV.find((n) => n.key === view)?.title}</strong>
          </div>
          <div className="top-actions">
            <span className="chain-tag">
              <i className="chain-icon" />
              {demo ? "Sepolia testnet" : "Sepolia"}
            </span>
            <button className="btn small" onClick={() => changeMode(!demo)}>
              {demo ? "Demo mode" : "Live mode"}
              <ChevronRight size={12} />
            </button>
            <button className="btn dark" disabled={busy} onClick={connect}>
              <Wallet size={15} />
              {account ? short(account) : "Connect wallet"}
            </button>
          </div>
         </div>
          <nav className="page-navigation" aria-label="Page navigation">
            {NAV.map(({ key, title, icon: Icon }) => (
              <a key={key} href={`?view=${key}`} aria-current={view === key ? "page" : undefined}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate(key);
                }}>
                <Icon size={16} aria-hidden="true" /><span>{title}</span>
              </a>
            ))}
          </nav>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Your agents. Your rules.</div>
              <h1>
                {view === "overview"
                  ? "Vault overview"
                  : NAV.find((n) => n.key === view)?.title}
              </h1>
              <p className="subtext">
                {
                  (
                    {
                      overview:
                        "A clear view of what your agents can spend, and what they have.",
                      agents:
                        "Give every agent a purpose, a budget, and a boundary.",
                      payments:
                        "Check a payment against the rules before any funds move.",
                      approvals:
                        "Review the exact recipient and amount before granting consent.",
                      receipts: "Payment history, backed by on-chain receipts.",
                      policies: "Spending boundaries enforced by your vault.",
                      allowlist:
                        "Only the recipients you approve can receive agent payments.",
                      setup: "Deploy a vault that belongs to your wallet.",
                    } as Record<View, string>
                  )[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              {view === "overview" ? (
                <>
                  <button
                    className="btn"
                    disabled={busy || !writable}
                    onClick={() => setEditAgent(null)}
                  >
                    <Plus size={16} />
                    Add agent
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy || !writable}
                    onClick={() => {
                      setFundMode("deposit");
                      setFundAmount("100");
                    }}
                  >
                    <Plus size={16} />
                    Fund vault
                  </button>
                </>
              ) : view === "agents" ? (
                <button
                  className="btn primary"
                  disabled={busy || !writable}
                  onClick={() => setEditAgent(null)}
                >
                  <Plus size={16} />
                  Add agent
                </button>
              ) : view === "receipts" ? (
                <button className="btn" onClick={exportReceipts}>
                  <Download size={15} />
                  Export CSV
                </button>
              ) : null}
            </div>
          </div>
          {demo && (
            <div className="notice">
              <Layers3 size={16} />
              <span>
                Interactive demo · Sample balances and payments. Changes reset
                when you reload.
              </span>
              <button onClick={() => changeMode(false)}>
                Set up your vault{" "}
                <ArrowRight size={12} className="inline ml-1" />
              </button>
            </div>
          )}
          {!demo && account && chainId !== CHAIN_ID && (
            <div className="notice error">
              <CircleX size={16} />
              <span>Your wallet is on a different network.</span>
              <button onClick={switchNetwork}>Switch to Sepolia</button>
            </div>
          )}
          {!demo && live && !owner && (
            <div className="notice info">
              <LockKeyhole size={15} />
              <span>
                Connected as {short(account)}. Owner controls require{" "}
                {short(live.owner)}. Signed payments can still be relayed.
              </span>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <CircleX size={16} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {status && (
            <div className="toast-status" role="status">
              {status}
            </div>
          )}
          {view === "overview" && (
            <>
              <div className="metrics">
                <div className="metric balance">
                  <div className="metric-label">
                    Vault balance <Wallet size={16} />
                  </div>
                  <div className="metric-value">
                    {demo || live ? money(data.balance) : "—"}
                    <span>{data.symbol}</span>
                  </div>
                  <div className="metric-note">
                    <LockKeyhole size={11} />
                    {demo
                      ? "Sample vault funds"
                      : live
                        ? "Controlled by the vault owner"
                        : "Connect and deploy to begin"}
                  </div>
                  <ShieldCheck className="wallet-glyph" size={29} />
                </div>
                <div className="metric">
                  <div className="metric-label">
                    Spent today <ArrowUpRight size={16} />
                  </div>
                  <div className="metric-value">
                    {demo || live ? money(data.spent) : "—"}
                    <span>{data.symbol}</span>
                  </div>
                  <div className="metric-note">
                    of {money(data.globalLimit, 0)} daily budget
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">
                    Active agents <Bot size={16} />
                  </div>
                  <div className="metric-value">
                    {String(activeAgents.length).padStart(2, "0")}
                  </div>
                  <div className="metric-note good">
                    <ShieldCheck size={12} />
                    Individual spending limits
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">
                    Awaiting review <ListChecks size={16} />
                  </div>
                  <div className="metric-value">
                    {String(
                      data.pending.filter((p) => p.decision === 15).length,
                    ).padStart(2, "0")}
                  </div>
                  <button
                    className="metric-note text-primary"
                    onClick={() => navigate("approvals")}
                  >
                    Review requests <ArrowRight size={12} />
                  </button>
                </div>
              </div>
              <div className="content-grid">
                <div className="stack !flex !flex-col">
                  <section className="panel w-full">
                    <div className="panel-head">
                      <h2>Spending activity</h2>
                      <span className="chain-tag">
                        {demo ? "Last 7 days · sample" : "Recent payments"}
                      </span>
                    </div>
                    <div className="panel-body">
                      <div className="chart-stat">
                        <div>
                          <div className="chart-total">
                            {money(
                              demo
                                ? chartValues.reduce((a, b) => a + b, 0)
                                : data.receipts.reduce(
                                    (a, b) => a + Number(b.amount),
                                    0,
                                  ),
                            )}
                            <span className="ml-2 text-sm text-muted-foreground">
                              {data.symbol}
                            </span>
                          </div>
                          <span className="subtext">
                            {demo
                              ? "Across all sample agents"
                              : "Confirmed payments in the loaded window"}
                          </span>
                        </div>
                        <span className="chart-legend">
                          <i />
                          Agent spend
                        </span>
                      </div>
                      {chartValues.length ? (
                        <div
                          className="bar-chart"
                          role="img"
                          aria-label={chartValues
                            .map(
                              (v, i) =>
                                `${demo ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : `Payment ${i + 1}`}: ${money(v)} ${data.symbol}`,
                            )
                            .join("; ")}
                        >
                          {chartValues.map((v, i) => (
                            <div
                              className="bar-group"
                              key={i}
                              title={`${money(v)} ${data.symbol}`}
                            >
                              <div className="bar-track">
                                <div
                                  className="bar"
                                  style={{ height: `${(v / chartMax) * 100}%` }}
                                />
                              </div>
                              <span className="bar-label">
                                {demo
                                  ? [
                                      "Mon",
                                      "Tue",
                                      "Wed",
                                      "Thu",
                                      "Fri",
                                      "Sat",
                                      "Sun",
                                    ][i]
                                  : `#${i + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty">
                          Your first confirmed payment will appear here.
                        </div>
                      )}
                      <div className="policy-summary">
                        <div>
                          <small>DAILY BUDGET USED</small>
                          <strong>
                            {percent(data.spent, data.globalLimit).toFixed(1)}%
                            of {money(data.globalLimit, 0)} {data.symbol}
                          </strong>
                        </div>
                        <div>
                          <small>BUDGET RESETS</small>
                          <strong>Every day at 00:00 UTC</strong>
                        </div>
                      </div>
                    </div>
                  </section>
                  <section className="panel w-full">
                    <div className="panel-head">
                      <h2>
                        Your agents{" "}
                        <span className="badge gray">{data.agents.length}</span>
                      </h2>
                      <button
                        className="btn ghost small"
                        onClick={() => navigate("agents")}
                      >
                        View all <ArrowRight size={13} />
                      </button>
                    </div>
                    {data.agents.length ? (
                      <div className="agent-list">
                        {data.agents.slice(0, 3).map((a, i) => (
                          <button
                            className="agent-row w-full text-left"
                            key={a.address}
                            onClick={() => {
                              setSelectedAgent(a.address);
                              navigate("agents");
                            }}
                          >
                            <span
                              className={`agent-avatar ${["", "orange", "blue"][i % 3]}`}
                            >
                              <Bot size={19} />
                            </span>
                            <div className="agent-detail">
                              <p className="agent-name">{a.name}</p>
                              <span className="agent-desc">
                                {a.description}
                              </span>
                            </div>
                            <div className="agent-right">
                              {money(a.spent, 0)}{" "}
                              <small>/ {money(a.dailyLimit, 0)}</small>
                              <Progress
                                className="budget-progress"
                                value={percent(a.spent, a.dailyLimit)}
                                aria-label={`${a.name} daily budget`}
                              />
                            </div>
                            <span
                              className={`badge ml-2 ${a.active ? "" : "gray"}`}
                            >
                              {a.active ? "Active" : "Inactive"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">
                        <Bot size={27} />
                        <h3>No agents connected</h3>
                        <p>
                          Create an agent policy, then add its approved
                          recipients.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
                <div className="stack">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>
                        <ListChecks size={16} className="text-primary" />
                        Needs your approval
                      </h2>
                      <span className="badge orange">
                        {data.pending.length}
                      </span>
                    </div>
                    {data.pending.length ? (
                      data.pending.slice(0, 2).map((p) => (
                        <div className="approval-card" key={p.id}>
                          <div className="approval-top">
                            <span className="text-[14px] font-medium text-foreground">
                              {p.title}
                            </span>
                            <span className="text-sm text-foreground">
                              {money(p.amount)}{" "}
                              <small className="text-xs text-muted-foreground">
                                {data.symbol}
                              </small>
                            </span>
                          </div>
                          <p>
                            {agentName(p.agent)}
                            <br />
                            Above the automatic approval threshold.
                          </p>
                          <div className="approval-actions">
                            <button
                              className="btn small"
                              onClick={() => navigate("approvals")}
                            >
                              Review request <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        <CheckCheck size={27} />
                        <h3>All caught up</h3>
                        <p>Payments requiring consent will appear here.</p>
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-body">
                      <div className="safety-head">
                        <span className="safety-icon">
                          <ShieldCheck size={23} />
                        </span>
                        <div>
                          <h3>
                            {data.paused
                              ? "Agent spending is paused"
                              : "You set the boundaries"}
                          </h3>
                          <p>
                            {demo
                              ? "Sample policy controls"
                              : "Enforced for every signed payment"}
                          </p>
                        </div>
                      </div>
                      <div className="control-row">
                        <div>
                          <h3>Recipient allowlist</h3>
                          <p>Only approved addresses can be paid</p>
                        </div>
                        <Check size={16} className="!text-[#8ed7a8]" />
                      </div>
                      <div className="control-row">
                        <div>
                          <h3>Spending limits</h3>
                          <p>Per payment, daily, and lifetime</p>
                        </div>
                        <Check size={16} className="!text-[#8ed7a8]" />
                      </div>
                      <div className="control-row">
                        <div>
                          <h3>Pause all agents</h3>
                          <p>Owner withdrawals stay available</p>
                        </div>
                        <Switch
                          aria-label="Pause all agent spending"
                          checked={data.paused}
                          disabled={busy || !writable}
                          onCheckedChange={togglePause}
                        />
                      </div>
                      <button
                        className="btn ghost small w-full mt-3 text-muted-foreground"
                        onClick={() => navigate("policies")}
                      >
                        Manage spending policies <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <section className="panel wide-panel">
                <div className="panel-head">
                  <h2>Recent activity</h2>
                  <button
                    className="btn ghost small"
                    onClick={() => navigate("receipts")}
                  >
                    All receipts <ArrowRight size={13} />
                  </button>
                </div>
                {receiptsTable(data.receipts.slice(0, 4))}
              </section>
            </>
          )}
          {view === "agents" && (
            <div className="grid gap-5 lg:grid-cols-2">
              {data.agents.map((a, i) => (
                <section className="panel" key={a.address}>
                  <div className="panel-head">
                    <h2>
                      <span className={`agent-avatar ${i % 2 ? "orange" : ""}`}>
                        <Bot size={20} />
                      </span>
                      {a.name}
                    </h2>
                    <span className={`badge ${a.active ? "" : "gray"}`}>
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="panel-body">
                    <button
                      onClick={() => copy(a.address)}
                      className="flex items-center gap-2 text-muted-foreground mono mb-5"
                    >
                      {short(a.address)}
                      <Copy size={12} />
                    </button>
                    <div className="chart-stat">
                      <span className="text-sm text-muted-foreground">
                        Daily spend
                      </span>
                      <span className="text-sm">
                        {money(a.spent)} / {money(a.dailyLimit)} {data.symbol}
                      </span>
                    </div>
                    <Progress
                      className="budget-progress !h-1.5 my-3"
                      value={percent(a.spent, a.dailyLimit)}
                    />
                    <div className="policy-summary">
                      <div>
                        <small>PER PAYMENT</small>
                        <strong>
                          {money(a.perPayment)} {data.symbol}
                        </strong>
                      </div>
                      <div>
                        <small>AUTOMATIC APPROVAL</small>
                        <strong>
                          Up to {money(a.approvalThreshold)} {data.symbol}
                        </strong>
                      </div>
                      <div>
                        <small>LIFETIME BUDGET</small>
                        <strong>
                          {money(a.lifetimeSpent)} / {money(a.lifetimeLimit)}
                        </strong>
                      </div>
                      <div>
                        <small>AUTHORIZATION EXPIRES</small>
                        <strong>
                          {new Date(a.validUntil * 1000).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            },
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="form-footer">
                      <button
                        className="btn small"
                        onClick={() => {
                          setSelectedAgent(a.address);
                          navigate("allowlist");
                        }}
                      >
                        Recipients ({a.recipients.length})
                      </button>
                      <button
                        className="btn small"
                        disabled={busy || !writable}
                        onClick={() => setEditAgent(a)}
                      >
                        Edit policy
                      </button>
                      <button
                        className="btn danger small"
                        disabled={busy || !writable || !a.active}
                        onClick={() => setRevoke(a)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </section>
              ))}
              {!data.agents.length && (
                <section className="panel">
                  <div className="empty">
                    <Bot size={30} />
                    <h3>Create your first agent</h3>
                    <p>
                      Use a separate agent address. Your owner wallet keeps full
                      control of the vault.
                    </p>
                    <button
                      className="btn primary"
                      disabled={!writable}
                      onClick={() => setEditAgent(null)}
                    >
                      Add agent
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
          {view === "payments" && (
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Payment request</h2>
                  <span className="badge purple">Policy checked</span>
                </div>
                <div className="panel-body">
                  <Field label="Agent">
                    <SelectBox
                      label="Select agent"
                      value={chosen?.address ?? ""}
                      onChange={setSelectedAgent}
                      options={data.agents.map((a) => ({
                        value: a.address,
                        label: a.name,
                      }))}
                    />
                  </Field>
                  <Field label="Recipient address">
                    <input
                      aria-label="Payment recipient"
                      placeholder="0x…"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label={`Amount (${data.symbol})`}>
                      <input
                        aria-label="Payment amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Payment reference"
                      help="Only its hash is recorded on chain."
                    >
                      <input
                        aria-label="Payment reference"
                        maxLength={120}
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                      />
                    </Field>
                  </div>
                  <button
                    className="btn primary w-full"
                    disabled={busy || !chosen || (!demo && !live)}
                    onClick={checkPayment}
                  >
                    <ShieldCheck size={16} />
                    Check payment
                  </button>
                  {demo && (
                    <div className="chip-row">
                      <button
                        className="chip"
                        onClick={() => {
                          setAmount("24.50");
                          setRecipient(DEMO_VENDOR);
                        }}
                      >
                        Try an allowed payment
                      </button>
                      <button className="chip" onClick={() => setAmount("85")}>
                        Needs approval
                      </button>
                      <button
                        className="chip"
                        onClick={() => setAmount("9999")}
                      >
                        Try exceeding the limit
                      </button>
                    </div>
                  )}
                  {checkResult && (
                    <div
                      className={`simulator-result ${checkResult.decision !== 0 && checkResult.decision !== 15 ? "blocked" : ""}`}
                      role="status"
                    >
                      <h3>
                        {checkResult.decision === 0 ? (
                          <Check size={17} />
                        ) : (
                          <ShieldCheck size={17} />
                        )}{" "}
                        {POLICY_REASONS[checkResult.decision]}
                      </h3>
                      <p>
                        {checkResult.decision === 0
                          ? "The payment fits the current policy. A valid agent signature is still required."
                          : checkResult.decision === 15
                            ? "The owner must approve this exact request before it can execute."
                            : "The vault will reject this request. No funds can move."}
                      </p>
                      {(demo ||
                        checkResult.decision === 0 ||
                        checkResult.decision === 15) && (
                        <button
                          className="btn dark w-full mt-4"
                          disabled={busy}
                          onClick={executePayment}
                        >
                          {demo
                            ? checkResult.decision === 15
                              ? "Add demo approval request"
                              : checkResult.decision === 0
                                ? "Run demo payment"
                                : "Test blocked request"
                            : "Sign as agent & submit"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
              <div className="stack !flex !flex-col">
                <section className="panel w-full">
                  <div className="panel-head">
                    <h2>Current payment rules</h2>
                  </div>
                  <div className="panel-body">
                    {chosen ? (
                      <>
                        <div className="control-row">
                          <h3>Per-payment limit</h3>
                          <span className="value">
                            {money(chosen.perPayment)} {data.symbol}
                          </span>
                        </div>
                        <div className="control-row">
                          <h3>Daily budget remaining</h3>
                          <span className="value">
                            {money(
                              Math.max(
                                0,
                                Number(chosen.dailyLimit) -
                                  Number(chosen.spent),
                              ),
                            )}{" "}
                            {data.symbol}
                          </span>
                        </div>
                        <div className="control-row">
                          <h3>Owner approval above</h3>
                          <span className="value">
                            {money(chosen.approvalThreshold)} {data.symbol}
                          </span>
                        </div>
                        <p className="mini-note">
                          Checks run again inside the contract at execution.
                          Passing this preview does not reserve funds.
                        </p>
                      </>
                    ) : (
                      <p className="subtext">
                        Create an agent to configure payment rules.
                      </p>
                    )}
                  </div>
                </section>
                {!demo && (
                  <section className="panel w-full">
                    <div className="panel-head">
                      <h2>Import a signed request</h2>
                    </div>
                    <div className="panel-body">
                      <Field
                        label="Agent SDK envelope (JSON)"
                        help="Inspect the amount and recipient in your wallet before confirming. Anyone can relay a valid request."
                      >
                        <textarea
                          aria-label="Signed agent request JSON"
                          rows={7}
                          value={imported}
                          onChange={(e) => setImported(e.target.value)}
                          placeholder='{"chainId":11155111,"vault":"0x…","intent":{…},"signature":"0x…"}'
                        />
                      </Field>
                      <button
                        className="btn w-full"
                        disabled={busy || !live || !imported}
                        onClick={importedPayment}
                      >
                        Review signed request
                      </button>
                    </div>
                  </section>
                )}
                <div className="explanation">
                  <LockKeyhole size={17} className="mb-2" />
                  The agent signs a payment intent. Your owner key never leaves
                  your wallet. The intent is bound to one vault, chain,
                  recipient, amount, nonce, and expiry.
                </div>
              </div>
            </div>
          )}
          {view === "approvals" && (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  Payment requests{" "}
                  <span className="badge orange">{data.pending.length}</span>
                </h2>
                <small>
                  {demo
                    ? "Sample approval queue"
                    : "Pending requests stored on chain"}
                </small>
              </div>
              {data.pending.length ? (
                data.pending.map((p) => (
                  <div className="approval-card" key={p.id}>
                    <div className="approval-top">
                      <div>
                        <h3 className="text-base font-medium mb-2">
                          {p.title}
                        </h3>
                        <span
                          className={`badge ${p.decision === 15 ? "orange" : p.decision === 0 ? "" : "red"}`}
                        >
                          {POLICY_REASONS[p.decision]}
                        </span>
                      </div>
                      <div className="approval-amount">
                        {money(p.amount)}{" "}
                        <span className="text-sm text-muted-foreground">
                          {data.symbol}
                        </span>
                      </div>
                    </div>
                    <p>
                      Agent: {agentName(p.agent)}
                      <br />
                      Recipient: <span className="mono">{p.recipient}</span>
                      {p.envelope && (
                        <>
                          <br />
                          Expires:{" "}
                          {new Date(
                            Number(p.envelope.intent.deadline) * 1000,
                          ).toISOString()}
                          <br />
                          Memo hash:{" "}
                          <span className="mono">{p.envelope.intent.memo}</span>
                        </>
                      )}
                    </p>
                    <div className="approval-actions">
                      <button
                        className="btn danger"
                        disabled={busy || !writable}
                        onClick={() => rejectPending(p)}
                      >
                        Reject & cancel nonce
                      </button>
                      {p.decision === 15 ? (
                        <button
                          className="btn primary"
                          disabled={busy || !writable}
                          onClick={() => approvePending(p)}
                        >
                          Approve exact payment
                        </button>
                      ) : p.decision === 0 ? (
                        <button
                          className="btn primary"
                          disabled={busy || (!demo && !account)}
                          onClick={() => executePending(p)}
                        >
                          Execute payment <ArrowUpRight size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <CheckCheck size={32} />
                  <h3>No requests awaiting review</h3>
                  <p>
                    A signed request above an agent’s approval threshold will
                    appear here after it is submitted on chain.
                  </p>
                </div>
              )}
            </section>
          )}
          {view === "policies" && (
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Vault spending controls</h2>
                  <ShieldCheck size={17} className="text-primary" />
                </div>
                <div className="panel-body">
                  <Field
                    label={`Daily budget for all agents (${data.symbol})`}
                    help="UTC calendar day. Updating the limit does not reset any spending counters."
                  >
                    <input
                      aria-label="Vault daily limit"
                      value={policyLimit}
                      onChange={(e) => setPolicyLimit(e.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                  <button
                    className="btn primary"
                    disabled={busy || !writable}
                    onClick={() =>
                      run(async () => {
                        const n = parseUnits(policyLimit, data.decimals);
                        if (n <= 0n)
                          throw new Error("The daily limit must be positive.");
                        if (demo)
                          setDemoData((s) => ({
                            ...s,
                            globalLimit: policyLimit,
                          }));
                        else await write("setGlobalDailyLimit", [n]);
                      }, "Daily budget updated.")
                    }
                  >
                    Save daily budget
                  </button>
                  <div className="control-row mt-4">
                    <div>
                      <h3>Pause agent spending</h3>
                      <p>
                        Stops payments and deposits. You can still withdraw.
                      </p>
                    </div>
                    <Switch
                      aria-label="Pause vault spending"
                      disabled={busy || !writable}
                      checked={data.paused}
                      onCheckedChange={togglePause}
                    />
                  </div>
                  <div className="control-row">
                    <div>
                      <h3>Owner withdrawal</h3>
                      <p>Withdraw to your connected owner address.</p>
                    </div>
                    <button
                      className="btn small"
                      disabled={busy || !writable}
                      onClick={() => {
                        setFundMode("withdraw");
                        setFundAmount("10");
                      }}
                    >
                      Withdraw
                    </button>
                  </div>
                  <div className="control-row">
                    <div>
                      <h3>Agent budgets and approvals</h3>
                      <p>
                        Set limits and expirations independently for each agent.
                      </p>
                    </div>
                    <button
                      className="btn small"
                      onClick={() => navigate("agents")}
                    >
                      Manage agents
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>How limits work</h2>
                </div>
                <div className="panel-body">
                  <ul className="docs-list">
                    <li>Payments must fit the per-payment limit.</li>
                    <li>
                      Daily spend is capped for each agent and the whole vault.
                    </li>
                    <li>
                      Lifetime spend survives policy edits and daily resets.
                    </li>
                    <li>Owner approvals authorize one exact payment.</li>
                    <li>Policy edits invalidate older signed requests.</li>
                    <li>Revoked or expired agents cannot spend.</li>
                  </ul>
                  <div className="explanation mt-5">
                    A compromised agent key can spend within its remaining
                    policy. Use small budgets, short expirations, and carefully
                    verified recipients.
                  </div>
                </div>
              </section>
            </div>
          )}
          {view === "allowlist" && (
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Approved recipients</h2>
                  <ShieldCheck size={17} />
                </div>
                <div className="panel-body">
                  <Field label="Agent">
                    <SelectBox
                      label="Select agent"
                      value={chosen?.address ?? ""}
                      onChange={setSelectedAgent}
                      options={data.agents.map((a) => ({
                        value: a.address,
                        label: a.name,
                      }))}
                    />
                  </Field>
                  {chosen?.recipients.length ? (
                    chosen.recipients.map((r) => (
                      <div className="control-row" key={r}>
                        <div>
                          <div className="mono mb-2">{r}</div>
                          <span className="badge">Approved recipient</span>
                        </div>
                        <button
                          className="btn danger small"
                          disabled={busy || !writable}
                          onClick={() =>
                            run(async () => {
                              if (demo)
                                setDemoData((s) => ({
                                  ...s,
                                  agents: s.agents.map((a) =>
                                    a.address === chosen.address
                                      ? {
                                          ...a,
                                          recipients: a.recipients.filter(
                                            (x) => x !== r,
                                          ),
                                        }
                                      : a,
                                  ),
                                }));
                              else
                                await write("setRecipient", [
                                  chosen.address,
                                  r,
                                  false,
                                ]);
                            }, "Recipient removed. Old signed requests are invalidated.")
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      No recipients approved for this agent.
                    </div>
                  )}
                  <div className="mt-6">
                    <Field
                      label="Add recipient address"
                      help="Verify the address separately. Allowlist edits invalidate previously signed requests."
                    >
                      <input
                        aria-label="New approved recipient"
                        placeholder="0x…"
                        value={allowAddress}
                        onChange={(e) => setAllowAddress(e.target.value)}
                      />
                    </Field>
                    <button
                      className="btn primary"
                      disabled={busy || !writable || !chosen}
                      onClick={() =>
                        run(async () => {
                          const r = normalize(allowAddress);
                          if (
                            r === "0x0000000000000000000000000000000000000000"
                          )
                            throw new Error(
                              "The zero address is not a recipient.",
                            );
                          if (demo)
                            setDemoData((s) => ({
                              ...s,
                              agents: s.agents.map((a) =>
                                a.address === chosen!.address
                                  ? {
                                      ...a,
                                      recipients: Array.from(
                                        new Set([...a.recipients, r]),
                                      ),
                                    }
                                  : a,
                              ),
                            }));
                          else
                            await write("setRecipient", [
                              chosen!.address,
                              r,
                              true,
                            ]);
                          setAllowAddress("");
                        }, "Recipient approved.")
                      }
                    >
                      <Plus size={15} />
                      Add recipient
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>One asset per vault</h2>
                </div>
                <div className="panel-body">
                  <div className="safety-head">
                    <span className="safety-icon">
                      <CircleDollarSign size={24} />
                    </span>
                    <div>
                      <h3>{data.symbol}</h3>
                      <p>{data.decimals} decimal places</p>
                    </div>
                  </div>
                  {data.asset && (
                    <div className="mono text-muted-foreground mb-4">{data.asset}</div>
                  )}
                  <p className="subtext">
                    The asset is fixed at deployment. An agent can transfer it
                    only to its approved recipients. There is no arbitrary
                    contract-call permission.
                  </p>
                </div>
              </section>
            </div>
          )}
          {view === "receipts" && (
            <section className="panel">
              <div className="panel-head">
                <h2>Payment receipts</h2>
                <div className="flex gap-2">
                  <SelectBox
                    label="Receipt status"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "All statuses" },
                      { value: "Paid", label: "Paid" },
                      { value: "Blocked", label: "Blocked" },
                      { value: "Rejected", label: "Rejected" },
                    ]}
                  />
                  <button
                    className="btn icon-btn"
                    aria-label="Refresh receipts"
                    disabled={busy || (!demo && !live)}
                    onClick={() =>
                      run(async () => {
                        if (!demo) await refresh();
                      }, "Receipts refreshed.")
                    }
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>
              {receiptsTable(
                data.receipts.filter(
                  (r) => filter === "all" || r.status === filter,
                ),
              )}
              <div className="panel-body border-t">
                <p className="mini-note !mt-0">
                  {demo
                    ? "These are sample receipts. A demo transaction has no explorer link."
                    : `Confirmed payment events from blocks ${data.historyFrom.toLocaleString()}–${data.historyTo.toLocaleString()}. The dashboard loads up to 10,000 recent blocks. Reverted requests do not emit on-chain receipts; full-history export is available in the SDK.`}
                </p>
              </div>
            </section>
          )}
          {view === "setup" && (
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Deploy on Sepolia</h2>
                  <span className="badge purple">Testnet only</span>
                </div>
                <div className="panel-body">
                  <div className="setup-step">
                    <span className="step-number">1</span>
                    <div>
                      <h3>Connect your owner wallet</h3>
                      <p>
                        Initial owner:{" "}
                        <span className="mono">{INITIAL_OWNER}</span>
                        <br />
                        Use Sepolia ETH for deployment and transaction fees.
                      </p>
                      <button className="btn" disabled={busy} onClick={connect}>
                        <Wallet size={15} />
                        {account ? short(account) : "Connect wallet"}
                      </button>
                      {account && !isInitialOwner && (
                        <p className="!text-[#f49ba6] !mt-3">
                          Switch to the initial owner account to deploy this
                          vault.
                        </p>
                      )}
                      {account && chainId !== CHAIN_ID && (
                        <button className="btn ml-2" onClick={switchNetwork}>
                          Switch network
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="setup-step">
                    <span className="step-number">2</span>
                    <div>
                      <h3>Choose a test token</h3>
                      <p>
                        Deploy the included tUSD test token, or use a vetted
                        standard ERC20 already deployed on Sepolia.
                      </p>
                      <div className="flex gap-2 flex-wrap mb-4">
                        <button
                          className="btn"
                          disabled={busy || !account || chainId !== CHAIN_ID}
                          onClick={deployToken}
                        >
                          Deploy test token
                        </button>
                        <button
                          className="btn"
                          disabled={
                            busy ||
                            !account ||
                            !(tokenAddress || data.asset) ||
                            chainId !== CHAIN_ID
                          }
                          onClick={faucet}
                        >
                          Mint test tokens
                        </button>
                      </div>
                      <Field label="Sepolia token address">
                        <input
                          aria-label="Token contract address"
                          placeholder="0x…"
                          value={tokenAddress}
                          onChange={(e) => setTokenAddress(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="setup-step !border-0">
                    <span className="step-number">3</span>
                    <div>
                      <h3>Deploy your spending vault</h3>
                      <Field label="Initial daily budget (token units)">
                        <input
                          aria-label="Initial daily budget"
                          inputMode="decimal"
                          value={deployLimit}
                          onChange={(e) => setDeployLimit(e.target.value)}
                        />
                      </Field>
                      <button
                        className="btn primary"
                        disabled={
                          busy ||
                          !isInitialOwner ||
                          chainId !== CHAIN_ID ||
                          !tokenAddress
                        }
                        onClick={deployVault}
                      >
                        Deploy vault <ArrowUpRight size={15} />
                      </button>
                      <p className="mini-note">
                        Your wallet signs the deployment. No private key is
                        entered into this app.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
              <div className="stack !flex !flex-col">
                <section className="panel w-full">
                  <div className="panel-head">
                    <h2>Use an existing Veydrava vault</h2>
                  </div>
                  <div className="panel-body">
                    <Field label="Vault contract address">
                      <input
                        aria-label="Existing vault address"
                        value={attachAddress}
                        placeholder="0x…"
                        onChange={(e) => setAttachAddress(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Deployment block (optional)"
                      help="The dashboard scans at most the latest 10,000 blocks for receipts."
                    >
                      <input
                        aria-label="Vault deployment block"
                        inputMode="numeric"
                        value={attachBlock}
                        onChange={(e) => setAttachBlock(e.target.value)}
                      />
                    </Field>
                    <button
                      className="btn w-full"
                      disabled={busy || !account || chainId !== CHAIN_ID}
                      onClick={attach}
                    >
                      Load vault
                    </button>
                  </div>
                </section>
                <div className="explanation">
                  This build is configured for Sepolia. Its custom contracts
                  require an independent security review before handling real
                  funds. Test tokens have no monetary value.
                </div>
                {vaultAddress && (
                  <section className="panel w-full">
                    <div className="panel-head">
                      <h2>Selected vault</h2>
                    </div>
                    <div className="panel-body">
                      <div className="mono mb-4">{vaultAddress}</div>
                      <a
                        className="btn small"
                        href={`${EXPLORER}/address/${vaultAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on Etherscan <ExternalLink size={13} />
                      </a>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
          <footer className="footer-note">
            <span>
              <ShieldCheck size={13} />{" "}
              {demo
                ? "Demo workspace · no real funds"
                : "Sepolia workspace · wallet-signed transactions"}
            </span>
            <span>
              Veydrava <span className="text-primary">/</span> Agent spending,
              within boundaries.
            </span>
          </footer>
        </div>
        <Dialog
          open={!!importReview}
          onOpenChange={(v) => {
            if (!v && !busy) setImportReview(null);
          }}
        >
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle>Review signed payment</DialogTitle>
              <DialogDescription>
                Verify the exact addresses and amount. Your wallet will pay the
                gas for this request.
              </DialogDescription>
            </DialogHeader>
            {importReview && (
              <>
                <dl className="details">
                  <div>
                    <dt>Network</dt>
                    <dd>Sepolia · {CHAIN_ID}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      {formatUnits(
                        importReview.envelope.intent.amount,
                        data.decimals,
                      )}{" "}
                      {data.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Recipient</dt>
                    <dd className="mono">
                      {importReview.envelope.intent.recipient}
                    </dd>
                  </div>
                  <div>
                    <dt>Agent</dt>
                    <dd className="mono">
                      {importReview.envelope.intent.agent}
                    </dd>
                  </div>
                  <div>
                    <dt>Vault</dt>
                    <dd className="mono">{importReview.envelope.vault}</dd>
                  </div>
                  <div>
                    <dt>Decision</dt>
                    <dd>{POLICY_REASONS[importReview.decision]}</dd>
                  </div>
                </dl>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const e = importReview.envelope;
                      await write(
                        importReview.decision === 15
                          ? "submitIntent"
                          : "executeSpend",
                        [e.intent, e.signature],
                      );
                      setImported("");
                      setImportReview(null);
                    }, "Signed request confirmed.")
                  }
                >
                  {busy
                    ? "Waiting for your wallet…"
                    : importReview.decision === 15
                      ? "Submit for owner approval"
                      : "Confirm payment"}
                </button>
              </>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={fundMode !== null}
          onOpenChange={(v) => {
            if (!v && !busy) setFundMode(null);
          }}
        >
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle>
                {fundMode === "withdraw"
                  ? "Withdraw from vault"
                  : "Fund your vault"}
              </DialogTitle>
              <DialogDescription>
                {demo
                  ? "This changes your sample vault balance only."
                  : fundMode === "withdraw"
                    ? `Tokens will go to your owner wallet ${short(account)}.`
                    : "Approve an exact token allowance, then deposit. Your wallet confirms each transaction."}
              </DialogDescription>
            </DialogHeader>
            <Field label={`Amount (${data.symbol})`}>
              <input
                aria-label="Fund amount"
                autoFocus
                inputMode="decimal"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
              />
            </Field>
            <p className="subtext">
              Vault balance: {money(data.balance)} {data.symbol}
            </p>
            <button className="btn primary" disabled={busy} onClick={fund}>
              {busy
                ? "Waiting for confirmation…"
                : fundMode === "withdraw"
                  ? "Confirm withdrawal"
                  : "Approve & deposit"}
            </button>
          </DialogContent>
        </Dialog>
        {editAgent !== undefined && (
          <AgentForm
            agent={editAgent}
            symbol={data.symbol}
            decimals={data.decimals}
            busy={busy}
            onClose={() => {
              if (!busy) setEditAgent(undefined);
            }}
            onSave={async (address, values) => {
              const ok = await run(async () => {
                if (normalize(address) === normalize(INITIAL_OWNER))
                  throw new Error(
                    "Use a separate agent address, not your owner wallet.",
                  );
                const a = normalize(address),
                  nums = values
                    .slice(0, 4)
                    .map((v) => parseUnits(v, data.decimals));
                const expiry = Number(values[4]);
                if (
                  nums[0] <= 0n ||
                  nums[0] > nums[1] ||
                  nums[1] > nums[2] ||
                  nums[3] > nums[0] ||
                  nums[3] < 0n ||
                  !Number.isSafeInteger(expiry) ||
                  expiry <= Date.now() / 1000
                )
                  throw new Error(
                    "Require 0 < per-payment ≤ daily ≤ lifetime, threshold ≤ per-payment, and a future expiry.",
                  );
                if (demo) {
                  const previous = data.agents.find(
                    (x) => x.address.toLowerCase() === a.toLowerCase(),
                  );
                  if (
                    previous &&
                    parseUnits(previous.lifetimeSpent, 6) > nums[2]
                  )
                    throw new Error(
                      "Lifetime limit is below already spent funds.",
                    );
                  setDemoData((s) => {
                    const old = s.agents.find(
                      (x) => x.address.toLowerCase() === a.toLowerCase(),
                    );
                    const n: Agent = {
                      address: a,
                      name: old?.name ?? `Agent ${short(a)}`,
                      description: "Custom spending agent",
                      perPayment: values[0],
                      dailyLimit: values[1],
                      lifetimeLimit: values[2],
                      approvalThreshold: values[3],
                      validUntil: expiry,
                      spent: old?.spent ?? "0",
                      lifetimeSpent: old?.lifetimeSpent ?? "0",
                      version: String(Number(old?.version ?? 0) + 1),
                      epoch: s.epoch,
                      nonce: old?.nonce ?? "0",
                      active: true,
                      recipients: old?.recipients ?? [],
                    };
                    return {
                      ...s,
                      agents: old
                        ? s.agents.map((x) =>
                            x.address === old.address ? n : x,
                          )
                        : [...s.agents, n],
                    };
                  });
                } else await write("setPolicy", [a, ...nums, expiry]);
              }, "Agent policy saved. Add approved recipients next.");
              if (ok) setEditAgent(undefined);
            }}
          />
        )}
        <AlertDialog
          open={!!revoke}
          onOpenChange={(v) => !v && setRevoke(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke {revoke?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This disables spending and invalidates the agent’s signed
                requests. You can later create a new policy for this address.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep agent</AlertDialogCancel>
              <AlertDialogAction
                className="bg-[#bc4a42]"
                onClick={() => {
                  if (!revoke) return;
                  const a = revoke;
                  run(async () => {
                    if (demo)
                      setDemoData((s) => ({
                        ...s,
                        agents: s.agents.map((x) =>
                          x.address === a.address ? { ...x, active: false } : x,
                        ),
                      }));
                    else await write("revokeAgent", [a.address]);
                  }, "Agent revoked.");
                }}
              >
                Revoke agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle>{detail?.title}</DialogTitle>
              <DialogDescription>
                {demo
                  ? "Demo receipt — no on-chain transaction."
                  : "Confirmed payment receipt from the selected vault."}
              </DialogDescription>
            </DialogHeader>
            {detail && (
              <>
                <dl className="details">
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      {detail.amount} {data.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{detail.status}</dd>
                  </div>
                  <div>
                    <dt>Agent</dt>
                    <dd className="mono">{detail.agent}</dd>
                  </div>
                  <div>
                    <dt>Recipient</dt>
                    <dd className="mono">{detail.recipient}</dd>
                  </div>
                  <div>
                    <dt>Reference / digest</dt>
                    <dd className="mono">{detail.id}</dd>
                  </div>
                  {detail.reason && (
                    <div>
                      <dt>Policy decision</dt>
                      <dd>{detail.reason}</dd>
                    </div>
                  )}
                  {detail.memo && (
                    <div>
                      <dt>Memo hash</dt>
                      <dd className="mono">{detail.memo}</dd>
                    </div>
                  )}
                </dl>
                {detail.tx && (
                  <a
                    className="btn primary"
                    href={`${EXPLORER}/tx/${detail.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View confirmed transaction <ExternalLink size={15} />
                  </a>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      <Toaster richColors theme="dark" position="bottom-right" />
      </SidebarInset>
    </SidebarProvider>
  );
}
function AgentForm({
  agent,
  symbol,
  decimals,
  busy,
  onClose,
  onSave,
}: {
  agent: Agent | null;
  symbol: string;
  decimals: number;
  busy: boolean;
  onClose: () => void;
  onSave: (a: string, v: string[]) => Promise<void>;
}) {
  const [address, setAddress] = useState(agent?.address ?? ""),
    [per, setPer] = useState(agent?.perPayment ?? "100"),
    [daily, setDaily] = useState(agent?.dailyLimit ?? "250"),
    [lifetime, setLifetime] = useState(agent?.lifetimeLimit ?? "1000"),
    [threshold, setThreshold] = useState(agent?.approvalThreshold ?? "50"),
    [expires, setExpires] = useState(
      new Date(
        (agent?.validUntil ?? Math.floor(Date.now() / 1000) + 30 * 86400) *
          1000,
      )
        .toISOString()
        .slice(0, 16),
    );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {agent ? "Edit agent policy" : "Add a spending agent"}
          </DialogTitle>
          <DialogDescription>
            Use a separate agent signing address. Limits are in {symbol} (
            {decimals} decimals).
          </DialogDescription>
        </DialogHeader>
        <Field label="Agent address">
          <input
            aria-label="Agent wallet address"
            disabled={!!agent}
            value={address}
            placeholder="0x…"
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Maximum per payment">
            <input
              aria-label="Per payment cap"
              inputMode="decimal"
              value={per}
              onChange={(e) => setPer(e.target.value)}
            />
          </Field>
          <Field label="Daily budget">
            <input
              aria-label="Agent daily budget"
              inputMode="decimal"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          </Field>
          <Field label="Lifetime budget">
            <input
              aria-label="Agent lifetime budget"
              inputMode="decimal"
              value={lifetime}
              onChange={(e) => setLifetime(e.target.value)}
            />
          </Field>
          <Field
            label="Auto-approve up to"
            help="Set to 0 to require approval for every payment."
          >
            <input
              aria-label="Automatic approval threshold"
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Authorization expiry (UTC)">
          <input
            aria-label="Authorization expires UTC"
            type="datetime-local"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
        <p className="mini-note !mt-0">
          Updating a policy preserves spent balances and invalidates older
          signatures. Add approved recipients after creating the agent.
        </p>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            onSave(address, [
              per,
              daily,
              lifetime,
              threshold,
              String(Math.floor(new Date(`${expires}Z`).getTime() / 1000)),
            ])
          }
        >
          {busy ? "Confirm in your wallet…" : "Save agent policy"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
