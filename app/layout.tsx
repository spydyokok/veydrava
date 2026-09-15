import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
  ),
  openGraph: {
    title: "Veydrava — Agent spending vault",
    description:
      "Owner-controlled budgets, approvals, and on-chain agent payments.",
    type: "website",
  },
  title: "Veydrava — Agent spending vault",
  description:
    "Give your agents a budget. Stay in control with on-chain spending limits, approved recipients, and payment receipts.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
