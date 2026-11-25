import { Suspense } from "react";
import LinksClient from "@/components/LinksClient";

export default function LinksPage() {
  return (
    <Suspense>
      <LinksClient />
    </Suspense>
  );
}
