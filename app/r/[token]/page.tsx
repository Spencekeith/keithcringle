import type { Metadata } from "next";
import { Suspense } from "react";
import RevealClient from "@/components/RevealClient";

// Generic metadata only: previews in iMessage etc. must never show a name or a match.
export const metadata: Metadata = {
  title: "Family Christmas Draw",
  description: "Family Christmas Draw",
  robots: { index: false, follow: false },
};

export default function RevealPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-evergreen" />}>
      <RevealClient />
    </Suspense>
  );
}
