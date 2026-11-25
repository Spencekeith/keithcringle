import { Suspense } from "react";
import SetupClient from "@/components/SetupClient";

export default function AdminPage() {
  return (
    <Suspense>
      <SetupClient />
    </Suspense>
  );
}
