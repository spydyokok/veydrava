import VeydravaApp from "@/components/veydrava/app";
import { ArrowUpRight, Layers3 } from "lucide-react";
import type { CSSProperties } from "react";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  // Keep previously shared workspace URLs usable after introducing the home page.
  const params = await searchParams;
  if (params.view) return <VeydravaApp />;

  return (
    <main className="landing">
      <header className="landing-header">
        <a href="/" className="landing-brand" aria-label="Veydrava home">
          <Layers3 size={23} aria-hidden="true" />
          <span>Veydrava</span>
        </a>
        <span className="landing-network">Sepolia testnet</span>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="landing-kicker">Agent spending. Under your control.</p>
        <h1 id="landing-title" className="landing-title" aria-label="Veydrava">
          {Array.from("Veydrava").map((letter, index) => (
            <span key={index} aria-hidden="true" style={{ "--letter": index } as CSSProperties}>
              {letter}
            </span>
          ))}
          <span className="landing-period" aria-hidden="true">.</span>
        </h1>
        <p className="landing-description">
          Give your agents a budget.<br />Keep every payment within your rules.
        </p>
        <a className="landing-explore" href="/dashboard">
          Explore more <ArrowUpRight size={21} aria-hidden="true" />
        </a>
        <p className="landing-hint">Explore the workspace in demo mode.</p>
      </section>

      <footer className="landing-footer">
        <span>Budgets. Approvals. On-chain receipts.</span>
        <span>Your agents. Your rules.</span>
      </footer>
    </main>
  );
}
