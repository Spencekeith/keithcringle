"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { input, primaryBtn } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="candy-stripe" />
      <div className="flex flex-1 items-center justify-center bg-evergreen px-5 py-12">
        <form
          className="flex w-full max-w-sm flex-col gap-4 rounded-[14px] bg-cream p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await fetch("/api/admin/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ password }),
            });
            setBusy(false);
            if (res.ok) return router.replace("/admin");
            setError((await res.json().catch(() => null))?.error ?? "Couldn't sign in.");
          }}
        >
          <p className="text-[13px] uppercase tracking-[0.12em] text-muted">Admin</p>
          <h1 className="font-display text-3xl font-bold text-evergreen">Family Christmas Draw</h1>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pw" className="text-sm font-medium">Admin password</label>
            <input id="pw" type="password" autoComplete="current-password" className={input} value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-cranberry">{error}</p>}
          <button type="submit" className={primaryBtn} disabled={busy || !password}>{busy ? "Checking…" : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}
