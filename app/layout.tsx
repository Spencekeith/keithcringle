import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Generic on purpose: link previews (iMessage etc.) must never show a name or a match.
export const metadata: Metadata = {
  title: "Family Christmas Draw",
  description: "Family Christmas Draw",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: { title: "Family Christmas Draw", description: "Family Christmas Draw", type: "website" },
  twitter: { card: "summary", title: "Family Christmas Draw", description: "Family Christmas Draw" },
  referrer: "no-referrer",
};

export const viewport: Viewport = { themeColor: "#123B2F" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
