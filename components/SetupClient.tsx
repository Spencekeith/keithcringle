"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readyCheck } from "@/lib/draw";
import { randomId } from "@/lib/random";
import type { Assignment, Config, Household } from "@/lib/types";
import { AdminHeader, Modal, SignOut, Switch, card, input, primaryBtn, secondaryBtn } from "./ui";

type SaveState = "idle" | "saving" | "saved" | "error";

function blankName(c: Config): string | null {
  for (const h of c.households) {
    if (!h.name.trim()) return "Every household needs a name.";
    for (const p of [...h.adults, ...h.kids]) if (!p.name.trim()) return `Fill in every name in ${h.name} to save.`;
  }
  return null;
}

export default function SetupClient() {
  const router = useRouter();
  const [year, setYear] = useState<number | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pending = useRef<Config | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    (async () => {
      const [c, h] = await Promise.all([fetch("/api/admin/config"), fetch("/api/admin/history")]);
      if (c.status === 401) return router.replace("/admin/login");
      if (!c.ok || !h.ok) return setLoadError("Couldn't load the setup. Refresh to try again.");
      const cj = await c.json();
      setYear(cj.year);
      setConfig(cj.config);
      setDrawn(cj.drawn);
      setHistory((await h.json()).rows);
    })();
  }, [router]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    if (!body) return inflight.current;
    pending.current = null;
    const run = (async () => {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaveState("error");
        setSaveMsg((await res.json().catch(() => null))?.error ?? "Couldn't save.");
        return false;
      }
      setSaveState("saved");
      setSaveMsg(null);
      return true;
    })();
    inflight.current = run;
    return run;
  }, []);

  const update = (fn: (c: Config) => void) => {
    if (!config) return;
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    const blank = blankName(next);
    if (blank) {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      setSaveState("error");
      setSaveMsg(blank);
      return;
    }
    pending.current = next;
    setSaveState("saving");
    setSaveMsg(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  const ready = useMemo(() => (config ? readyCheck(config, history) : null), [config, history]);
  const gp = config?.households.find((h) => h.isGrandparents);
  const canDraw = !!ready?.ok && !drawn && saveState !== "error" && !drawing;

  async function doDraw() {
    setDrawing(true);
    setDrawError(null);
    const saved = await flush();
    if (!saved) {
      setDrawing(false);
      setConfirmOpen(false);
      return setDrawError("Fix the save error first.");
    }
    const res = await fetch("/api/admin/draw", { method: "POST" });
    if (res.ok || res.status === 409) return router.push("/admin/links");
    setDrawing(false);
    setConfirmOpen(false);
    setDrawError((await res.json().catch(() => null))?.error ?? "The draw failed.");
  }

  if (loadError) return <p className="p-8 text-cranberry">{loadError}</p>;

  return (
    <div className="min-h-dvh pb-16">
      <AdminHeader year={year} step={1} actions={<SignOut />} />
      {!config || !ready ? (
        <p className="mx-auto max-w-[1160px] px-8 py-10 text-muted">Loading…</p>
      ) : (
        <main className="mx-auto flex max-w-[1160px] flex-wrap items-start gap-7 px-4 py-8 sm:px-8">
          <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            {drawn && (
              <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
                <p className="text-[15px]">
                  <strong className="font-semibold">Names are drawn.</strong> Households and rules are locked now.
                </p>
                <Link href="/admin/links" className={`${secondaryBtn} inline-flex items-center`}>
                  Go to the links →
                </Link>
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-display text-[28px] font-medium text-evergreen">Households</h2>
              <p className="text-sm text-muted">{drawn ? "Locked after the draw" : "Tap a kid to sit them out this year"}</p>
            </div>

            {config.households.map((h, hi) => (
              <HouseholdCard
                key={h.id}
                household={h}
                locked={drawn}
                editing={editing === h.id}
                gpSkip={config.rules.grandparentsSkipKids}
                onEdit={() => setEditing(editing === h.id ? null : h.id)}
                onChange={(fn) => update((c) => fn(c.households[hi], c))}
                onRemove={() => {
                  if (!window.confirm(`Remove ${h.name || "this household"}?`)) return;
                  setEditing(null);
                  update((c) => void c.households.splice(hi, 1));
                }}
              />
            ))}

            {!drawn && (
              <button
                type="button"
                className="min-h-[52px] rounded-[14px] border-[1.5px] border-dashed border-[#9C9381] p-4 text-[15px] font-medium text-evergreen hover:bg-cream"
                onClick={() => {
                  const id = randomId("h-");
                  update((c) =>
                    void c.households.push({ id, name: "New household", adults: [{ id: randomId("p-"), name: "" }], kids: [] }),
                  );
                  setEditing(id);
                }}
              >
                + Add a household
              </button>
            )}

            {year && <LastYear key={JSON.stringify(history)} year={year - 1} config={config} history={history} onSaved={setHistory} />}
          </section>

          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
            <section className={`${card} flex flex-col gap-3.5 p-[22px]`}>
              <h2 className="font-display text-[22px] font-medium text-evergreen">The details</h2>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="date" className="text-sm font-medium">Gift exchange date</label>
                <input id="date" className={input} placeholder="e.g. Christmas Eve" value={config.exchangeDate}
                  onChange={(e) => update((c) => void (c.exchangeDate = e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ab" className="text-sm font-medium">Adult budget</label>
                  <input id="ab" className={input} placeholder="$50" value={config.budgets.adult}
                    onChange={(e) => update((c) => void (c.budgets.adult = e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="kb" className="text-sm font-medium">Kid budget</label>
                  <input id="kb" className={input} placeholder="$30" value={config.budgets.kid}
                    onChange={(e) => update((c) => void (c.budgets.kid = e.target.value))} />
                </div>
              </div>
              <p className="min-h-5 text-[13px] text-muted" aria-live="polite">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
                {saveState === "error" && <span className="text-cranberry">{saveMsg}</span>}
              </p>
            </section>

            <section className={`${card} flex flex-col gap-1.5 p-[22px]`}>
              <h2 className="mb-1.5 font-display text-[22px] font-medium text-evergreen">Rules</h2>
              <Switch label="No drawing yourself or your spouse" sub="Always on" checked disabled />
              <Switch
                label="Parents don't draw their own kids"
                sub="Kids always go to another household"
                checked={config.rules.ownKids}
                disabled={drawn}
                onChange={(v) => update((c) => void (c.rules.ownKids = v))}
              />
              <Switch
                label="No repeat of last year's match"
                sub={`Checked against the ${(year ?? 0) - 1} draw${history.length ? "" : " (nothing entered yet)"}`}
                checked={config.rules.noRepeat}
                disabled={drawn}
                onChange={(v) => update((c) => void (c.rules.noRepeat = v))}
              />
              <Switch
                label={`${gp?.name ?? "Grandparents"} sit out the kid draw`}
                sub={
                  !gp
                    ? "Mark a household as the grandparents to use this"
                    : config.rules.grandparentsSkipKids
                      ? "On: adults only for them"
                      : "Off: they draw a kid like every other couple"
                }
                checked={config.rules.grandparentsSkipKids}
                disabled={drawn || !gp}
                onChange={(v) => update((c) => void (c.rules.grandparentsSkipKids = v))}
              />
            </section>

            <section className="flex flex-col gap-4 rounded-[14px] bg-evergreen p-[22px] text-cream">
              <h2 className="font-display text-[22px] font-medium">Ready check</h2>
              <dl className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[13px] text-sage">Adults in exchange</dt>
                  <dd className="font-display text-[32px]">{ready.adultCount}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[13px] text-sage">Kids / couples</dt>
                  <dd className="font-display text-[32px]">{ready.kidCount} / {ready.giverCount}</dd>
                </div>
              </dl>
              <p
                role="status"
                className={`rounded-[10px] px-3.5 py-3 text-sm leading-[1.45] ${
                  ready.level === "ok" ? "bg-pine" : ready.level === "info" ? "bg-[#FCEFD6] text-[#5C3900]" : "bg-[#FBE3E1] text-[#7E1712]"
                }`}
              >
                {ready.level === "error" && <strong className="font-semibold">Can&apos;t draw yet. </strong>}
                {ready.message}
              </p>
              {drawError && <p className="rounded-[10px] bg-[#FBE3E1] px-3.5 py-3 text-sm text-[#7E1712]">{drawError}</p>}
              <button type="button" className={primaryBtn} disabled={!canDraw} onClick={() => setConfirmOpen(true)}>
                {drawn ? "Already drawn" : "Draw names"}
              </button>
              <p className="text-[13px] leading-normal text-sage">
                Results are sealed the moment they&apos;re drawn. Nobody sees the full list, including you.
              </p>
            </section>
          </aside>
        </main>
      )}

      <Modal open={confirmOpen} onClose={() => !drawing && setConfirmOpen(false)} label="Confirm the draw">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium text-evergreen">Draw names?</h2>
          <p className="text-[15px] leading-relaxed">This seals the draw. You won&apos;t be able to see who has whom.</p>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={secondaryBtn} disabled={drawing} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className={`${primaryBtn} min-h-11 text-[15px]`} disabled={drawing} onClick={doDraw}>
              {drawing ? "Drawing…" : "Draw and seal"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const chipIn =
  "min-h-11 rounded-full border-[1.5px] border-pine bg-white px-4 py-2 text-[15px] font-medium text-evergreen disabled:cursor-not-allowed";
const chipOut =
  "min-h-11 rounded-full border-[1.5px] border-dashed border-[#9C9381] bg-transparent px-4 py-2 text-[15px] font-medium text-[#6B6457] line-through disabled:cursor-not-allowed";

function HouseholdCard({
  household: h,
  locked,
  editing,
  gpSkip,
  onEdit,
  onChange,
  onRemove,
}: {
  household: Household;
  locked: boolean;
  editing: boolean;
  gpSkip: boolean;
  onEdit: () => void;
  onChange: (fn: (h: Household, c: Config) => void) => void;
  onRemove: () => void;
}) {
  if (editing && !locked) {
    return (
      <article className={`${card} flex flex-col gap-4 px-[22px] py-5`}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${h.id}-name`} className="text-sm font-medium">Household name</label>
          <input id={`${h.id}-name`} className={input} value={h.name} onChange={(e) => onChange((x) => void (x.name = e.target.value))} />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label htmlFor={`${h.id}-tag`} className="text-sm font-medium">Label (optional)</label>
            <input id={`${h.id}-tag`} className={input} placeholder="e.g. Grandparents" value={h.tag ?? ""}
              onChange={(e) => onChange((x) => void (x.tag = e.target.value))} />
          </div>
          <label className="flex min-h-11 items-center gap-2.5 self-end text-[15px]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-pine"
              checked={!!h.isGrandparents}
              onChange={(e) =>
                onChange((x, c) => {
                  for (const other of c.households) delete other.isGrandparents;
                  if (e.target.checked) x.isGrandparents = true;
                })
              }
            />
            These are the grandparents
          </label>
        </div>

        <PeopleEditor
          title="Adults"
          people={h.adults}
          addLabel="+ Add adult"
          onName={(i, v) => onChange((x) => void (x.adults[i].name = v))}
          onRemove={(i) => onChange((x) => void x.adults.splice(i, 1))}
          onAdd={() => onChange((x) => void x.adults.push({ id: randomId("p-"), name: "" }))}
        />
        <PeopleEditor
          title="Kids"
          people={h.kids}
          addLabel="+ Add kid"
          onName={(i, v) => onChange((x) => void (x.kids[i].name = v))}
          onRemove={(i) => onChange((x) => void x.kids.splice(i, 1))}
          onAdd={() => onChange((x) => void x.kids.push({ id: randomId("k-"), name: "", optedOut: false }))}
        />

        <div className="flex flex-wrap justify-between gap-3 border-t border-dashed border-[#D8CDB6] pt-4">
          <button type="button" className="min-h-11 px-1 text-sm font-medium text-cranberry underline" onClick={onRemove}>
            Remove household
          </button>
          <button type="button" className={secondaryBtn} onClick={onEdit}>Done</button>
        </div>
      </article>
    );
  }

  return (
    <article className={`${card} flex flex-col gap-3.5 px-[22px] py-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="font-display text-[22px] font-medium text-evergreen">{h.name}</h3>
          {h.tag && (
            <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-pine">{h.tag}</span>
          )}
        </div>
        {!locked && (
          <button type="button" className="min-h-11 px-1 text-sm text-muted hover:text-ink" onClick={onEdit} aria-label={`Edit ${h.name}`}>
            Edit
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {h.adults.map((a) => (
          <span key={a.id} className="inline-flex items-center rounded-full bg-evergreen px-3.5 py-2 text-[15px] font-medium text-cream">
            {a.name || "(no name)"}
          </span>
        ))}
      </div>
      {h.kids.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-dashed border-[#D8CDB6] pt-3">
          <p className="text-[13px] text-muted">Kids</p>
          <div className="flex flex-wrap gap-2">
            {h.kids.map((k, ki) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={k.optedOut}
                disabled={locked}
                className={k.optedOut ? chipOut : chipIn}
                onClick={() => onChange((x) => void (x.kids[ki].optedOut = !x.kids[ki].optedOut))}
              >
                {k.optedOut ? `${k.name} · sitting out` : k.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {h.isGrandparents && gpSkip && (
        <p className="text-sm text-muted">In the adult exchange only. Not drawing a kid this year.</p>
      )}
    </article>
  );
}

function PeopleEditor({
  title,
  people,
  addLabel,
  onName,
  onRemove,
  onAdd,
}: {
  title: string;
  people: { id: string; name: string }[];
  addLabel: string;
  onName: (i: number, v: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {people.map((p, i) => (
        <div key={p.id} className="flex gap-2">
          <label htmlFor={p.id} className="sr-only">{`${title.slice(0, -1)} ${i + 1} name`}</label>
          <input id={p.id} className={input} value={p.name} placeholder="Name" onChange={(e) => onName(i, e.target.value)} />
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[10px] border border-field bg-white text-muted hover:text-cranberry"
            aria-label={`Remove ${p.name || "this person"}`}
            onClick={() => onRemove(i)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button type="button" className="min-h-11 self-start px-1 text-sm font-medium text-evergreen underline" onClick={onAdd}>
        {addLabel}
      </button>
    </fieldset>
  );
}

function LastYear({
  year,
  config,
  history,
  onSaved,
}: {
  year: number;
  config: Config;
  history: Assignment[];
  onSaved: (rows: Assignment[]) => void;
}) {
  const householdOf = useMemo(() => {
    const m = new Map<string, Household>();
    for (const h of config.households) for (const a of h.adults) m.set(a.id, h);
    return m;
  }, [config]);
  const [adultPick, setAdultPick] = useState<Record<string, string>>(() =>
    Object.fromEntries(history.filter((r) => r.adultRecipientId).map((r) => [r.giverId, r.adultRecipientId])),
  );
  const [kidPick, setKidPick] = useState<Record<string, string>>(() => {
    const k: Record<string, string> = {};
    for (const row of history) {
      const h = householdOf.get(row.giverId);
      if (h && row.kidRecipientIds[0]) k[h.id] = row.kidRecipientIds[0];
    }
    return k;
  });
  const [status, setStatus] = useState<string | null>(null);

  const adults = config.households.flatMap((h) => h.adults.map((a) => ({ ...a, h })));
  const kids = config.households.flatMap((h) => h.kids.map((k) => ({ ...k, h })));

  async function save() {
    const rows: Assignment[] = adults.map((a) => ({
      giverId: a.id,
      adultRecipientId: adultPick[a.id] ?? "",
      kidRecipientIds: kidPick[a.h.id] ? [kidPick[a.h.id]] : [],
    }));
    setStatus("Saving…");
    const res = await fetch("/api/admin/history", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) return setStatus("Couldn't save.");
    onSaved((await res.json()).rows);
    setStatus("Saved");
  }

  const select = `${input} pr-8`;
  return (
    <details className={`${card} group p-5`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
        <span className="font-display text-[22px] font-medium text-evergreen">Last year&apos;s matches ({year})</span>
        <span className="text-sm text-muted">{history.length ? "Entered" : "Optional"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-muted">
          Enter {year} by hand so the no-repeat rule works this year. After this year&apos;s draw, the app remembers on its own.
        </p>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Who each adult bought for</legend>
          {adults.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
              <label htmlFor={`ly-${a.id}`} className="text-sm">{a.name}</label>
              <select id={`ly-${a.id}`} className={select} value={adultPick[a.id] ?? ""}
                onChange={(e) => setAdultPick({ ...adultPick, [a.id]: e.target.value })}>
                <option value="">Not sure</option>
                {adults.filter((o) => o.h.id !== a.h.id).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
        {kids.length > 0 && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Which kid each couple covered</legend>
            {config.households.filter((h) => h.adults.length).map((h) => (
              <div key={h.id} className="flex flex-col gap-1">
                <label htmlFor={`lyk-${h.id}`} className="text-sm">{h.name}</label>
                <select id={`lyk-${h.id}`} className={select} value={kidPick[h.id] ?? ""}
                  onChange={(e) => setKidPick({ ...kidPick, [h.id]: e.target.value })}>
                  <option value="">None / not sure</option>
                  {kids.filter((k) => k.h.id !== h.id).map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
        )}
        <div className="flex items-center gap-3">
          <button type="button" className={secondaryBtn} onClick={save}>Save {year} matches</button>
          <span className="text-sm text-muted" aria-live="polite">{status}</span>
        </div>
      </div>
    </details>
  );
}
