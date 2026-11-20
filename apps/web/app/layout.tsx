import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NetworkBanner } from "./network-banner";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Flow",
  description: "Sell in Bitcoin. Withdraw Bitcoin or local currency. NWC test wallet or mainnet demos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sans.variable}>
        <NetworkBanner />
        {children}
      </body>
    </html>
  );
}
