"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { RevealView } from "@/lib/service";
import type { WishItem } from "@/lib/types";
import { card, formatDate, input } from "./ui";

type Load = { state: "loading" } | { state: "invalid" } | { state: "error" } | { state: "ready"; view: RevealView };

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export default function RevealClient() {
  const { token } = useParams<{ token: string }>();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/r/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) return setLoad({ state: "invalid" });
      if (!res.ok) return setLoad({ state: "error" });
      setLoad({ state: "ready", view: await res.json() });
    })();
  }, [token]);

  async function open() {
    setRevealed(true);
    window.scrollTo(0, 0);
    if (load.state === "ready" && !load.view.openedAt) {
      // Marked opened on the tap, not on page load, so link-preview bots don't count.
      fetch(`/api/r/${encodeURIComponent(token)}/open`, { method: "POST" }).catch(() => {});
    }
  }

  if (load.state === "loading") {
    return <div className="min-h-dvh bg-evergreen" aria-busy="true" />;
  }
  if (load.state === "invalid" || load.state === "error") {
    return (
      <main className="flex min-h-dvh flex-col bg-evergreen text-cream">
        <div className="candy-stripe" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 text-center">
          <h1 className="font-display text-3xl font-bold">
            {load.state === "invalid" ? "This link isn't valid" : "Something went wrong"}
          </h1>
          <p className="max-w-xs text-[15px] leading-relaxed text-sage">
            {load.state === "invalid" ? "Check the link you were sent, or ask whoever sent it." : "Try again in a minute."}
          </p>
        </div>
      </main>
    );
  }

  const v = load.view;
  return revealed ? (
    <Revealed view={v} token={token} onHide={() => setRevealed(false)} />
  ) : (
    <Sealed view={v} onOpen={open} />
  );
}

function SealBrokenBanner({ view }: { view: RevealView }) {
  if (!view.sealBroken) return null;
  return (
    <p role="alert" className="bg-gold px-5 py-3 text-center text-sm font-medium text-evergreen">
      Heads up: the admin opened the full list on {formatDate(view.sealBrokenAt, true)}.
    </p>
  );
}

function Sealed({ view, onOpen }: { view: RevealView; onOpen: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col bg-evergreen text-cream">
      <SealBrokenBanner view={view} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-7 px-7 pb-10 pt-14">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-gold">Family Christmas Draw · {view.year}</p>
          <h1 className="font-display text-[40px] font-bold leading-[1.1]">Merry Christmas, {view.me.name}</h1>
        </div>

        <div className="relative flex w-[250px] flex-col items-center">
          <svg aria-hidden="true" width="120" height="70" viewBox="0 0 120 70" fill="none">
            <path d="M60 70 C 50 40, 20 30, 6 2" stroke="#E9D9A6" strokeWidth="2" />
            <path d="M60 70 C 70 40, 100 30, 114 2" stroke="#E9D9A6" strokeWidth="2" />
          </svg>
          <div
            className="flex h-[300px] w-[250px] flex-col items-center justify-center gap-3.5 bg-cream px-6 pb-7 pt-12 text-evergreen"
            style={{ clipPath: "polygon(22% 0, 78% 0, 100% 14%, 100% 100%, 0 100%, 0 14%)", borderRadius: 18 }}
          >
            <div className="-mt-5 h-[22px] w-[22px] rounded-full border-[3px] border-[#C9BFA8]" />
            <p className="text-[13px] uppercase tracking-[0.12em] text-muted">To: {view.me.name}</p>
            <p className="text-center font-display text-[30px] leading-[1.15]">Your name is inside</p>
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#A8201A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="13" rx="1.5" />
              <path d="M12 8v13M3 12h18" />
              <path d="M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" />
            </svg>
          </div>
        </div>

        <button type="button" onClick={onOpen}
          className="min-h-[58px] w-full rounded-[14px] bg-cranberry text-lg font-semibold text-white hover:bg-cranberry-dark">
          Open your tag
        </button>
        <p className="text-center text-sm leading-normal text-sage">Make sure nobody&apos;s looking over your shoulder.</p>
      </div>
    </main>
  );
}

function Revealed({ view, token, onHide }: { view: RevealView; token: string; onHide: () => void }) {
  const r = view.adultRecipient;
  const details = [view.budgets.adult && `Budget ${view.budgets.adult}`, view.exchangeDate && `Exchange ${view.exchangeDate}`].filter(Boolean);
  const kidNames = joinNames(view.kids.map((k) => k.name));
  const covering = view.partners.length ? `You & ${joinNames(view.partners)} are covering` : "You're covering";

  return (
    <main className="min-h-dvh bg-page">
      <div className="candy-stripe" />
      <SealBrokenBanner view={view} />
      <div className="bg-evergreen text-cream">
        <div className="mx-auto flex max-w-xl flex-col gap-1.5 px-6 pb-7 pt-8">
          <p className="text-[13px] uppercase tracking-[0.12em] text-gold">You&apos;re buying for</p>
          <h1 className="font-display text-[56px] font-bold leading-none">{r.name}</h1>
          {details.length > 0 && <p className="mt-1.5 text-[15px] text-[#D7E3DC]">{details.join(" · ")}</p>}
        </div>
      </div>

      <div className="mx-auto flex max-w-xl flex-col gap-4 p-5">
        <section className={`${card} flex flex-col gap-2 p-[18px]`}>
          <h2 className="text-[15px] font-semibold">{r.name}&apos;s wishlist</h2>
          {r.wishlist.length === 0 ? (
            <p className="text-[15px] leading-normal text-muted">
              {r.name} hasn&apos;t added anything yet. Check back closer to the day.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {r.wishlist.map((w) => (
                <li key={w.id} className="text-[15px] leading-normal">
                  {w.url ? (
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-cranberry underline">{w.text}</a>
                  ) : (
                    w.text
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} flex flex-col gap-2.5 p-[18px]`}>
          {view.kids.length === 0 ? (
            <p className="text-[15px] leading-normal text-muted">Your household isn&apos;t covering a kid this year. Just {r.name}.</p>
          ) : (
            <>
              <p className="text-[13px] uppercase tracking-[0.1em] text-muted">{covering}</p>
              <p className="font-display text-[34px] leading-[1.05] text-cranberry">{kidNames}</p>
              {view.budgets.kid && <p className="text-sm text-muted">Kid budget {view.budgets.kid}{view.kids.length > 1 ? " each" : ""}</p>}
              {view.kids.map((k) => (
                <div key={k.id} className="flex flex-col gap-1 border-t border-dashed border-[#D8CDB6] pt-2.5">
                  <p className="text-[13px] font-semibold text-pine">
                    {view.kids.length > 1 ? `${k.name}: notes from ${k.parents}` : `Notes from ${k.parents}`}
                  </p>
                  <p className="whitespace-pre-wrap text-[15px] leading-normal text-muted">
                    {k.notes ?? `No notes yet. ${k.parents} can add sizes and ideas.`}
                  </p>
                </div>
              ))}
            </>
          )}
        </section>

        <MyWishlist token={token} initial={view.myWishlist} />

        {view.myKids.map((k) => (
          <KidNotesEditor key={k.id} token={token} kid={k} />
        ))}

        <button type="button" onClick={onHide} className="min-h-12 text-[15px] font-medium text-muted underline">
          Hide it again
        </button>
        <p className="mb-3 text-center text-[13px] leading-normal text-muted">This link is just for you. Don&apos;t forward it.</p>
      </div>
    </main>
  );
}

function MyWishlist({ token, initial }: { token: string; initial: WishItem[] }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function save(next: WishItem[]) {
    const prev = items;
    setItems(next);
    setStatus("Saving…");
    const res = await fetch(`/api/r/${encodeURIComponent(token)}/wishlist`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      setItems(prev);
      setStatus((await res.json().catch(() => null))?.error ?? "Couldn't save. Try again.");
      return false;
    }
    setItems(await res.json());
    setStatus("Saved");
    return true;
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-[18px]">
      <h2 className="text-[15px] font-semibold">Your wishlist</h2>
      <p className="text-sm leading-normal text-muted">Whoever drew you will see this. They won&apos;t know you can&apos;t see them.</p>
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5">
              <span className="min-w-0 break-words text-[15px]">
                {w.text}
                {w.url && <span className="block truncate text-[13px] text-muted">{w.url}</span>}
              </span>
              <button
                type="button"
                className="min-h-11 min-w-11 flex-none rounded-[10px] text-muted hover:text-cranberry"
                aria-label={`Remove ${w.text}`}
                onClick={() => save(items.filter((x) => x.id !== w.id))}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (await save([...items, { id: "", text: text.trim(), ...(url.trim() ? { url: url.trim() } : {}) }])) {
            setText("");
            setUrl("");
          }
        }}
      >
        <label htmlFor="wish" className="sr-only">Wishlist idea</label>
        <input id="wish" className={input} placeholder="Add an idea" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <label htmlFor="wish-url" className="sr-only">Link (optional)</label>
          <input id="wish-url" className={`${input} flex-1`} placeholder="Link (optional)" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" disabled={!text.trim()}
            className="min-h-[46px] flex-none rounded-[10px] bg-evergreen px-4 text-[15px] font-semibold text-cream disabled:opacity-60">
            Add
          </button>
        </div>
      </form>
      <p className="min-h-5 text-[13px] text-muted" aria-live="polite">{status}</p>
    </section>
  );
}

function KidNotesEditor({ token, kid }: { token: string; kid: { id: string; name: string; notes: string } }) {
  const [text, setText] = useState(kid.notes);
  const [saved, setSaved] = useState(kid.notes);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = text !== saved;

  return (
    <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-[18px]">
      <label htmlFor={`notes-${kid.id}`} className="text-[15px] font-semibold">Notes for whoever has {kid.name}</label>
      <p className="text-sm leading-normal text-muted">Sizes, what {kid.name}&apos;s into right now, anything to skip. Only {kid.name}&apos;s giver sees this.</p>
      <textarea
        id={`notes-${kid.id}`}
        rows={4}
        maxLength={2000}
        className={`${input} resize-y`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus(null);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty}
          className="min-h-11 rounded-[10px] bg-evergreen px-4 text-[15px] font-semibold text-cream disabled:opacity-60"
          onClick={async () => {
            setStatus("Saving…");
            const res = await fetch(`/api/r/${encodeURIComponent(token)}/kidnotes/${encodeURIComponent(kid.id)}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text }),
            });
            if (!res.ok) return setStatus("Couldn't save. Try again.");
            setSaved(text);
            setStatus("Saved");
          }}
        >
          Save notes
        </button>
        <span className="text-[13px] text-muted" aria-live="polite">{status}</span>
      </div>
    </section>
  );
}
