"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FullListRow, LinksView } from "@/lib/service";
import { AdminHeader, Modal, SignOut, card, formatDate, input, secondaryBtn } from "./ui";

export default function LinksClient() {
  const router = useRouter();
  const [view, setView] = useState<LinksView | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [breakOpen, setBreakOpen] = useState(false);
  const [breakText, setBreakText] = useState("");
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/admin/links").then(async (res) => {
        if (res.status === 401) return router.replace("/admin/login");
        if (res.ok) setView(await res.json());
      }),
    [router],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  async function breakSeal() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/break-seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: breakText.trim() }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Couldn't break the seal.");
    setBreakOpen(false);
    setBreakText("");
    await load();
  }

  async function redraw() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/redraw", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Couldn't redraw.");
    router.push("/admin");
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const total = view?.rows.length ?? 0;
  const pct = total ? Math.round(((view?.openedCount ?? 0) / total) * 100) : 0;

  return (
    <div className="min-h-dvh pb-16">
      <AdminHeader year={view?.year ?? null} step={3} actions={<SignOut />} />
      <main className="mx-auto flex max-w-[1160px] flex-col gap-6 px-4 py-8 sm:px-8">
        {!view ? (
          <p className="text-muted">Loading…</p>
        ) : !view.drawn ? (
          <section className={`${card} flex flex-col items-start gap-3 p-6`}>
            <h2 className="font-display text-2xl font-medium text-evergreen">Nothing drawn yet</h2>
            <p className="text-muted">Set up the households and rules, then draw names.</p>
            <Link href="/admin" className={`${secondaryBtn} inline-flex items-center`}>← Back to setup</Link>
          </section>
        ) : (
          <>
            <section className={`${card} flex flex-wrap items-center justify-between gap-6 p-6`}>
              <div className="flex min-w-0 flex-[999_1_420px] items-center gap-4">
                <div className={`flex h-14 w-14 flex-none items-center justify-center rounded-full ${view.sealBroken ? "bg-[#B9B09D]" : "bg-cranberry"}`}>
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d={view.sealBroken ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
                  </svg>
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-[26px] font-medium text-evergreen">
                    {view.sealBroken ? "The seal is broken" : "Names are drawn and sealed"}
                  </h2>
                  <p className="text-sm leading-normal text-muted">
                    Drawn {formatDate(view.drawnAt, true)}.{" "}
                    {view.sealBroken
                      ? `You opened the full list on ${formatDate(view.sealBrokenAt, true)}, and every private page now says so.`
                      : "The full list is saved and never shown here."}
                  </p>
                </div>
              </div>
              <div className="flex flex-[1_1_260px] flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{view.openedCount} of {total} opened</span>
                  <span className="text-muted">Updates live</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#E6DDCB]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Links opened">
                  <div className="h-full bg-pine transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </section>

            <section className={`${card} flex flex-col px-4 pb-4 pt-2 sm:px-6`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 pt-4">
                <h2 className="font-display text-[22px] font-medium text-evergreen">Private links</h2>
                <p className="text-sm text-muted">Send each one on its own, never in a group thread.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left text-[13px] text-muted">
                      <th scope="col" className="border-b border-line py-2.5 pr-2 font-medium">Person</th>
                      <th scope="col" className="border-b border-line px-2 py-2.5 font-medium">Link</th>
                      <th scope="col" className="border-b border-line px-2 py-2.5 font-medium">Status</th>
                      <th scope="col" className="border-b border-line px-2 py-2.5 font-medium">Wishlist</th>
                      <th scope="col" className="border-b border-line py-2.5 pl-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => {
                      const url = `${origin}/r/${r.token}`;
                      const message = `Merry Christmas, ${r.name}! Your gift tag is here: ${url}\n\nIt's just for you, so please don't forward it.`;
                      return (
                        <tr key={r.token}>
                          <td className="border-b border-line-soft py-3 pr-2">
                            <span className="flex flex-col gap-0.5">
                              <span className="font-semibold">{r.name}</span>
                              <span className="text-[13px] text-muted">{r.household}</span>
                            </span>
                          </td>
                          <td className="border-b border-line-soft px-2 py-3 font-mono text-sm text-[#3C4A43]">/r/{r.token}</td>
                          <td className="border-b border-line-soft px-2 py-3">
                            <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${r.openedAt ? "bg-mint text-pine" : "bg-[#F1EBDD] text-muted"}`}>
                              {r.openedAt ? `Opened ${formatDate(r.openedAt)}` : "Not opened"}
                            </span>
                          </td>
                          <td className="border-b border-line-soft px-2 py-3 text-muted">{r.hasWishlist ? "Added" : "Not yet"}</td>
                          <td className="border-b border-line-soft py-3 pl-2 text-right">
                            <span className="inline-flex gap-2">
                              <button type="button" className={`${secondaryBtn} min-w-[112px]`} aria-label={`Copy ${r.name}'s link`} onClick={() => copy(url, `l-${r.token}`)}>
                                {copied === `l-${r.token}` ? "Copied" : "Copy link"}
                              </button>
                              <button type="button" className={`${secondaryBtn} min-w-[132px]`} aria-label={`Copy a message for ${r.name}`} onClick={() => copy(message, `m-${r.token}`)}>
                                {copied === `m-${r.token}` ? "Copied" : "Copy message"}
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {view.sealBroken && view.fullList && <FullList rows={view.fullList} />}

            <section className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-[#E3B7B3] bg-[#FBF3F1] p-6">
              <h2 className="font-display text-[22px] font-medium text-cranberry-dark">If something goes wrong</h2>
              {error && <p className="text-sm text-cranberry">{error}</p>}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-start gap-2.5">
                  <button
                    type="button"
                    disabled={view.sealBroken}
                    onClick={() => setBreakOpen(true)}
                    className="min-h-12 rounded-[10px] border-[1.5px] border-cranberry bg-white px-[18px] text-[15px] font-semibold text-cranberry hover:bg-[#FBE3E1] disabled:cursor-not-allowed disabled:border-[#B9B09D] disabled:bg-[#EFE8DA] disabled:text-[#6B6457]"
                  >
                    {view.sealBroken ? "Seal already broken" : "Break the seal"}
                  </button>
                  <p className="text-sm leading-normal text-muted">
                    Shows the full list for troubleshooting. Every private page will then say the seal was broken, so nobody can peek quietly.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2.5">
                  <button
                    type="button"
                    disabled={!view.canRedraw}
                    onClick={() => setRedrawOpen(true)}
                    className="min-h-12 rounded-[10px] border-[1.5px] border-cranberry bg-white px-[18px] text-[15px] font-semibold text-cranberry hover:bg-[#FBE3E1] disabled:cursor-not-allowed disabled:border-[#B9B09D] disabled:bg-[#EFE8DA] disabled:text-[#6B6457]"
                  >
                    Redraw everything
                  </button>
                  <p className="text-sm leading-normal text-muted">
                    {view.canRedraw
                      ? "Throws away this draw and every link. Wishlists and kid notes are kept."
                      : `Locked because ${view.openedCount} ${view.openedCount === 1 ? "person has" : "people have"} already opened their link. Breaking the seal unlocks it.`}
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <Modal open={breakOpen} onClose={() => !busy && setBreakOpen(false)} label="Break the seal">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            breakSeal();
          }}
        >
          <h2 className="font-display text-2xl font-medium text-evergreen">Break the seal?</h2>
          <p className="text-[15px] leading-relaxed">
            You&apos;ll see the full list, and everyone&apos;s private page will show a banner saying the admin opened it. This can&apos;t be undone.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="break-confirm" className="text-sm font-medium">Type BREAK to confirm</label>
            <input id="break-confirm" className={input} autoComplete="off" value={breakText} onChange={(e) => setBreakText(e.target.value)} />
          </div>
          {error && <p className="text-sm text-cranberry">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={secondaryBtn} onClick={() => setBreakOpen(false)}>Cancel</button>
            <button
              type="submit"
              disabled={breakText.trim() !== "BREAK" || busy}
              className="min-h-11 rounded-[10px] bg-cranberry px-4 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#B9B09D]"
            >
              Break the seal
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={redrawOpen} onClose={() => !busy && setRedrawOpen(false)} label="Redraw everything">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium text-evergreen">Redraw everything?</h2>
          <p className="text-[15px] leading-relaxed">
            Every link stops working. You&apos;ll go back to setup and draw again, then send everyone a new link. Wishlists and kid notes stay.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={secondaryBtn} onClick={() => setRedrawOpen(false)}>Cancel</button>
            <button type="button" disabled={busy} onClick={redraw}
              className="min-h-11 rounded-[10px] bg-cranberry px-4 text-[15px] font-semibold text-white disabled:bg-[#B9B09D]">
              {busy ? "Wiping…" : "Wipe and start over"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FullList({ rows }: { rows: FullListRow[] }) {
  return (
    <section className={`${card} flex flex-col px-4 pb-4 pt-2 sm:px-6`}>
      <h2 className="pb-3 pt-4 font-display text-[22px] font-medium text-evergreen">The full list</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th scope="col" className="border-b border-line py-2.5 pr-2 font-medium">Giver</th>
              <th scope="col" className="border-b border-line px-2 py-2.5 font-medium">Buys for</th>
              <th scope="col" className="border-b border-line px-2 py-2.5 font-medium">Kid (with their household)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.giver + r.household}>
                <td className="border-b border-line-soft py-3 pr-2">
                  <span className="font-semibold">{r.giver}</span> <span className="text-[13px] text-muted">· {r.household}</span>
                </td>
                <td className="border-b border-line-soft px-2 py-3">{r.buysFor}</td>
                <td className="border-b border-line-soft px-2 py-3 text-muted">{r.kids.length ? r.kids.join(", ") : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
